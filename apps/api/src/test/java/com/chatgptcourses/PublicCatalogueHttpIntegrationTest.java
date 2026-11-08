package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Public catalogue scenarios through real HTTP, Spring filters and PostgreSQL. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "MAIL_MODE=disabled", "debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PublicCatalogueHttpIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42")
            .asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);
        registry.add("POSTGRES_HOST", POSTGRES::getHost);
        registry.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        registry.add("POSTGRES_DB", POSTGRES::getDatabaseName);
        registry.add("POSTGRES_USER", POSTGRES::getUsername);
        registry.add("POSTGRES_PASSWORD", POSTGRES::getPassword);
    }
    @Value("${local.server.port}") int port;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    private static final String CMS = "/api/v1/admin/contents";
    private static final String CATALOGUE = "/api/v1/catalog";
    private static final String PRIVATE_CORRECTION = "P06_PRIVATE_CORRECTION_SENTINEL";

    @Test
    void searchCombinesPublishedFiltersAndPaginatesTiesInStableOrder() throws Exception {
        var editor = account(true); var anonymous = browser(); String prefix = unique();
        var ids = new ArrayList<String>();
        for (int i = 0; i < 3; i++) {
            var draft = create(editor, "ACTIVITY", "FREE", "Same " + prefix, List.of());
            String id = text(draft, "id");
            metadata(editor, id, metadata("understand-brief", "BEGINNER"));
            publish(editor, id); ids.add(text(draft, "resourceId"));
        }
        create(editor, "ACTIVITY", "FREE", "Draft " + prefix, List.of());
        var removed = create(editor, "ACTIVITY", "FREE", "Archived " + prefix, List.of());
        publish(editor, text(removed, "id")); action(editor, text(removed, "id"), "archive", Map.of("reason", "Retrait de test"));
        String query = "?locale=fr&q=" + prefix + "&type=ACTIVITY&goal=understand-brief&level=BEGINNER&access=FREE&pageSize=1&sort=TITLE";
        var received = new ArrayList<String>();
        for (int page = 0; page < 3; page++) {
            var response = get(anonymous, CATALOGUE + query + "&page=" + page);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
            assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
            var body = tree(response);
            assertThat(body.path("total").asLong()).isEqualTo(3);
            assertThat(body.path("page").asInt()).isEqualTo(page);
            assertThat(body.path("pageSize").asInt()).isEqualTo(1);
            received.add(body.path("items").get(0).path("resourceId").asText());
        }
        assertThat(received).containsExactlyElementsOf(ids.stream().sorted().toList());
        assertThat(tree(get(anonymous, CATALOGUE + query + "&page=0")).path("items").get(0).path("resourceId").asText()).isEqualTo(received.getFirst());
        var facets = tree(get(anonymous, CATALOGUE + "/facets?locale=fr"));
        assertThat(facetCodes(facets.path("types"))).doesNotContain("MODULE");
        assertThat(facetCodes(facets.path("goals"))).contains("understand-brief");
        for (String name : List.of("types", "goals", "levels", "accesses", "locales")) for (var facet : facets.path(name)) assertThat(facet.path("count").asLong()).isPositive();
        assertProblem(get(anonymous, CATALOGUE + "?locale=fr&pageSize=101"), 400, "VALIDATION_FAILED");
        assertProblem(get(anonymous, CATALOGUE + "?locale=fr&type=MODULE"), 400, "VALIDATION_FAILED");
        assertProblem(get(anonymous, CATALOGUE + "?locale=fr&sort=RANDOM"), 400, "VALIDATION_FAILED");
        assertProblem(get(anonymous, CATALOGUE), 400, "INVALID_REQUEST");
    }

    @Test
    void programmePinsEveryChildVersionAndExactActivityNeverResolvesToLatest() throws Exception {
        var editor = account(true); var anonymous = browser();
        var activity = create(editor, "ACTIVITY", "FREE", "Old activity " + unique(), List.of());
        String activityId = text(activity, "id"), activityResource = text(activity, "resourceId"), oldVersion = text(activity, "versionId");
        publish(editor, activityId);
        var module = create(editor, "MODULE", "PROTECTED", "Module " + unique(), List.of(oldVersion));
        publish(editor, text(module, "id"));
        var course = create(editor, "COURSE", "PROTECTED", "Course " + unique(), List.of(text(module, "versionId")));
        metadata(editor, text(course, "id"), metadata("build-proposal", "BEGINNER"));
        publish(editor, text(course, "id"));
        var nextDocument = document("FREE"); nextDocument.put("objective", "A new pedagogical objective");
        nextDocument.put("blocks", List.of(block("P06_NEWER_ACTIVITY_BODY")));
        var next = action(editor, activityId, "versions", Map.of("objectives", "New objective", "evaluationDefinition", "New declared assessment", "title", "New activity " + unique(),
                "summary", "New version", "document", nextDocument, "childVersionIds", List.of(), "reason", "New pedagogy"));
        assertThat(next.statusCode()).isEqualTo(201); publish(editor, text(next, "id"));
        var courseResponse = get(anonymous, detail(text(course, "resourceId"), "fr"));
        var courseBody = tree(courseResponse);
        assertThat(courseBody.path("document").isNull()).isTrue();
        assertThat(courseBody.path("objective").asText()).isNotBlank();
        assertThat(courseBody.path("expectedResult").asText()).isNotBlank();
        assertThat(courseBody.path("metadata").path("evaluationDescription").asText()).isEqualTo("Décrire les contrôles déclaratifs, sans certification.");
        var moduleNode = courseBody.path("curriculum").get(0);
        assertThat(moduleNode.path("versionId").asText()).isEqualTo(text(module, "versionId"));
        var activityNode = moduleNode.path("children").get(0);
        assertThat(activityNode.path("resourceId").asText()).isEqualTo(activityResource);
        assertThat(activityNode.path("versionId").asText()).isEqualTo(oldVersion);
        assertThat(tree(get(anonymous, detail(activityResource, "fr"))).path("versionId").asText()).isEqualTo(text(next, "versionId"));
        var exact = get(anonymous, version(activityResource, oldVersion, "fr"));
        assertThat(exact.statusCode()).isEqualTo(200);
        assertThat(tree(exact).path("versionId").asText()).isEqualTo(oldVersion);
        assertThat(exact.body().contains("P06_NEWER_ACTIVITY_BODY")).isFalse();
        assertProblem(get(anonymous, version(text(course, "resourceId"), oldVersion, "fr")), 404, "RESOURCE_NOT_FOUND");
        var bySlug = get(anonymous, CATALOGUE + "/by-slug/COURSE/" + text(course, "slug") + "?locale=fr");
        assertThat(tree(bySlug).path("resourceId").asText()).isEqualTo(text(course, "resourceId"));
        assertProblem(get(anonymous, CATALOGUE + "/by-slug/GUIDE/" + text(course, "slug") + "?locale=fr"), 404, "RESOURCE_NOT_FOUND");
        assertNoPrivateFields(courseResponse);
        assertNoPrivateFields(exact);
    }

    @Test
    void languageContextIsExplicitAndReadyDoesNotRepublishAStaleTranslation() throws Exception {
        var editor = account(true); var anonymous = browser();
        var fr = create(editor, "ACTIVITY", "FREE", "French " + unique(), List.of());
        String frId = text(fr, "id"), resource = text(fr, "resourceId");
        publish(editor, frId);
        var missing = tree(get(anonymous, detail(resource, "en")));
        assertThat(missing.path("availability").asText()).isEqualTo("MISSING_TRANSLATION");
        assertThat(missing.path("title").isNull()).isTrue();
        assertThat(missing.path("document").isNull()).isTrue();
        assertThat(missing.path("metadata").path("goalCodes").isEmpty()).isTrue();
        assertProblem(get(anonymous, CATALOGUE + "/by-slug/ACTIVITY/" + text(fr, "slug") + "?locale=en"), 404, "RESOURCE_NOT_FOUND");
        var en = action(editor, frId, "translations", Map.of("locale", "en", "slug", unique(), "title", "English " + unique(), "summary", "An explicit English test translation",
                "document", document("FREE"), "reason", "Explicit translation"));
        String enId = text(en, "id"); publish(editor, enId);
        String previousPublicReview = tree(get(anonymous, detail(resource, "en"))).path("reviewedAt").asText();
        var corrected = document("FREE"); corrected.put("blocks", List.of(block("Source correction with the same pedagogical objective.")));
        action(editor, frId, "revisions", save("Corrected French source", corrected));
        var stale = tree(get(anonymous, detail(resource, "en")));
        assertThat(stale.path("availability").asText()).isEqualTo("STALE");
        assertThat(stale.path("document").isNull()).isTrue();
        action(editor, enId, "transition", transition("TO_REVIEW", null));
        String sourceRevision = text(get(editor, CMS + "/" + frId), "currentRevisionId");
        var ready = action(editor, enId, "transition", transition("READY", sourceRevision));
        assertThat(ready.statusCode()).isEqualTo(200);
        var stillUnpublished = tree(get(anonymous, detail(resource, "en")));
        assertThat(stillUnpublished.path("availability").asText()).isEqualTo("STALE");
        assertThat(stillUnpublished.path("document").isNull()).isTrue();
        assertThat(stillUnpublished.path("reviewedAt").asText()).isEqualTo(previousPublicReview);
        var oldProjection = tree(get(anonymous, "/api/v1/contents/" + resource + "?locale=en"));
        assertThat(oldProjection.path("availability").asText()).isEqualTo("STALE");
        assertThat(oldProjection.path("document").isNull()).isTrue();
        publish(editor, frId);
        var republished = action(editor, enId, "publish", Map.of("revisionId", text(ready, "currentRevisionId"), "reason", "Explicit English republication"));
        assertThat(republished.statusCode()).isEqualTo(200);
        assertThat(tree(get(anonymous, detail(resource, "en"))).path("availability").asText()).isEqualTo("PUBLISHED");
        action(editor, enId, "archive", Map.of("reason", "English withdrawal"));
        var withdrawn = tree(get(anonymous, detail(resource, "en")));
        assertThat(withdrawn.path("availability").asText()).isEqualTo("WITHDRAWN");
        assertThat(withdrawn.path("document").isNull()).isTrue();
        assertThat(withdrawn.path("title").isNull()).isTrue();
        assertThat(withdrawn.path("versionId").asText()).isEqualTo(text(fr, "versionId"));
        assertThat(tree(get(anonymous, detail(resource, "fr"))).path("availability").asText()).isEqualTo("PUBLISHED");
    }

    @Test
    void metadataAndReviewDatesRemainPublishedSnapshotsUntilExplicitPublication() throws Exception {
        var editor = account(true); var anonymous = browser();
        var guide = create(editor, "GUIDE", "FREE", "Guide " + unique(), List.of());
        String id = text(guide, "id"), resource = text(guide, "resourceId");
        metadata(editor, id, metadata("understand-brief", "BEGINNER"));
        publish(editor, id);
        var original = tree(get(anonymous, detail(resource, "fr")));
        String review = original.path("reviewedAt").asText(), publishedRevision = original.path("revisionId").asText();
        var changed = metadata(editor, id, metadata("check-output", "ADVANCED"));
        assertThat(changed.statusCode()).isEqualTo(200);
        assertThat(text(changed, "state")).isEqualTo("DRAFT");
        assertThat(text(changed, "currentRevisionId")).isNotEqualTo(publishedRevision);
        var beforeReview = tree(get(anonymous, detail(resource, "fr")));
        assertThat(beforeReview.path("metadata").path("level").asText()).isEqualTo("BEGINNER");
        assertThat(beforeReview.path("reviewedAt").asText()).isEqualTo(review);
        action(editor, id, "transition", transition("TO_REVIEW", null));
        action(editor, id, "transition", transition("READY", null));
        var afterReview = tree(get(anonymous, detail(resource, "fr")));
        assertThat(afterReview.path("metadata").path("level").asText()).isEqualTo("BEGINNER");
        assertThat(afterReview.path("reviewedAt").asText()).isEqualTo(review);
        var current = get(editor, CMS + "/" + id);
        var republished = action(editor, id, "publish", Map.of("revisionId", text(current, "currentRevisionId"), "reason", "Publish new metadata"));
        assertThat(republished.statusCode()).isEqualTo(200);
        var finalPublic = tree(get(anonymous, detail(resource, "fr")));
        assertThat(finalPublic.path("metadata").path("level").asText()).isEqualTo("ADVANCED");
        assertThat(finalPublic.path("revisionId").asText()).isNotEqualTo(publishedRevision);
        var revision = action(editor, id, "revisions", save("Minor correction preserving metadata", document("FREE")));
        assertThat(tree(revision).path("metadata").path("level").asText()).isEqualTo("ADVANCED");
        var history = tree(get(editor, CMS + "/" + id + "/revisions"));
        assertThat(history.path("items").get(0).path("metadata").path("level").asText()).isEqualTo("ADVANCED");
        assertThat(history.path("items").get(2).path("metadata").path("level").asText()).isEqualTo("BEGINNER");
    }

    @Test
    void metadataPermissionsValidationAndPublicConfidentialityRemainServerEnforced() throws Exception {
        var editor = account(true); var learner = account(false); var anonymous = browser();
        var content = create(editor, "ACTIVITY", "PROTECTED", "Protected " + unique(), List.of());
        String id = text(content, "id"), resource = text(content, "resourceId");
        var body = Map.of("metadata", metadata("build-proposal", "BEGINNER"), "reason", "Metadata test");
        assertProblem(send(editor, "PUT", CMS + "/" + id + "/metadata", body, csrf(editor), null), 428, "PRECONDITION_REQUIRED");
        assertProblem(send(editor, "PUT", CMS + "/" + id + "/metadata", body, null, etag(content)), 403, "CSRF_INVALID");
        assertProblem(send(learner, "PUT", CMS + "/" + id + "/metadata", body, csrf(learner), etag(content)), 403, "ACCESS_DENIED");
        var bad = metadata("build-proposal", "BEGINNER"); bad.put("sources", List.of(Map.of("label", "Unsafe", "url", "javascript:alert(1)")));
        assertProblem(metadata(editor, id, bad), 400, "VALIDATION_FAILED");
        var invented = metadata("build-proposal", "BEGINNER"); invented.put("authorId", UUID.randomUUID());
        assertProblem(metadata(editor, id, invented), 400, "INVALID_REQUEST");
        var oversized = metadata("build-proposal", "BEGINNER");
        oversized.put("faq", java.util.stream.IntStream.range(0, 9).mapToObj(i -> Map.of("question", "Question " + i, "answer", "x".repeat(2000))).toList());
        assertProblem(metadata(editor, id, oversized), 400, "VALIDATION_FAILED");
        assertThat(text(get(editor, CMS + "/" + id), "currentRevisionId")).isEqualTo(text(content, "currentRevisionId"));
        publish(editor, id);
        var publicResponse = get(anonymous, detail(resource, "fr"));
        assertThat(tree(publicResponse).path("document").isNull()).isTrue();
        assertThat(publicResponse.body()).isEqualTo(get(editor, detail(resource, "fr")).body());
        assertNoPrivateFields(publicResponse);
        assertProblem(get(anonymous, CMS + "/" + id + "/preview"), 401, "AUTHENTICATION_REQUIRED");
    }

    @Test
    void zeroResultsAndRealPostgresOutageAreDifferentAndTheCatalogueRecovers() throws Exception {
        var anonymous = browser();
        String path = CATALOGUE + "?locale=fr&q=" + unique();
        var empty = get(anonymous, path);
        assertThat(empty.statusCode()).isEqualTo(200);
        assertThat(tree(empty).path("total").asLong()).isZero();
        assertThat(tree(empty).path("items").isEmpty()).isTrue();
        var docker = DockerClientFactory.instance().client();
        docker.pauseContainerCmd(POSTGRES.getContainerId()).exec();
        try { assertProblem(get(anonymous, path), 503, "SERVICE_UNAVAILABLE"); }
        finally { docker.unpauseContainerCmd(POSTGRES.getContainerId()).exec(); }
        long deadline = System.nanoTime() + Duration.ofSeconds(25).toNanos();
        HttpResponse<String> recovered;
        do { recovered = get(anonymous, path); if (recovered.statusCode() == 200) break; Thread.sleep(150); } while (System.nanoTime() < deadline);
        assertThat(recovered.statusCode()).isEqualTo(200);
        assertThat(tree(recovered).path("items").isEmpty()).isTrue();
    }

    private HttpResponse<String> publish(Browser editor, String id) throws Exception {
        assertThat(action(editor, id, "transition", transition("TO_REVIEW", null)).statusCode()).isEqualTo(200);
        var current = tree(get(editor, CMS + "/" + id)); String source = null;
        if (!current.path("sourceTranslationId").isNull()) source = text(get(editor, CMS + "/" + current.path("sourceTranslationId").asText()), "currentRevisionId");
        var reviewed = action(editor, id, "transition", transition("READY", source)); assertThat(reviewed.statusCode()).isEqualTo(200);
        var published = action(editor, id, "publish", Map.of("revisionId", text(reviewed, "currentRevisionId"), "reason", "Explicit test publication"));
        assertThat(published.statusCode()).isEqualTo(200); return published;
    }
    private HttpResponse<String> action(Browser editor, String id, String suffix, Object body) throws Exception {
        return send(editor, "POST", CMS + "/" + id + "/" + suffix, body, csrf(editor), etag(get(editor, CMS + "/" + id)));
    }
    private HttpResponse<String> metadata(Browser editor, String id, Map<String,Object> metadata) throws Exception {
        return send(editor, "PUT", CMS + "/" + id + "/metadata", Map.of("metadata", metadata, "reason", "Explicit metadata snapshot"), csrf(editor), etag(get(editor, CMS + "/" + id)));
    }
    private HttpResponse<String> create(Browser editor, String kind, String access, String title, List<String> children) throws Exception {
        var response = send(editor, "POST", CMS, Map.of("kind", kind, "locale", "fr", "slug", unique(), "title", title, "summary", "Fictional public catalogue test",
                "objectives", "Distinguish confirmed facts and unknowns", "evaluationDefinition", "PRIVATE_ASSESSMENT_DEFINITION", "document", document(access), "childVersionIds", children, "reason", "Isolated catalogue test"), csrf(editor), null);
        assertThat(response.statusCode()).isEqualTo(201); return response;
    }
    private static Map<String,Object> document(String access) {
        var value = new LinkedHashMap<String,Object>(); value.put("objective", "Distinguer les faits des informations à confirmer dans BR01.");
        value.put("expectedResult", "Un tableau de cadrage du brief."); value.put("prerequisites", List.of("Lire le dossier fictif BR01"));
        value.put("blocks", List.of(block("Client R demande quatre pages. Le logo et l’intégration restent à clarifier."))); value.put("estimatedMinutes", null);
        value.put("exercise", Map.of("instructions", "Relever deux inconnues.", "correction", PRIVATE_CORRECTION));
        value.put("quiz", List.of(Map.of("key", "fact", "prompt", "Quel élément est confirmé ?", "options", List.of("Quatre pages", "Le prix du logo"), "correctOption", 0, "explanation", PRIVATE_CORRECTION, "points", 1)));
        value.put("rubric", List.of(Map.of("key", "fidelity", "label", "Ne pas inventer de fait", "points", 1, "blocking", true))); value.put("access", access);
        value.put("media", List.of()); value.put("relatedResourceIds", List.of()); return value;
    }
    private static Map<String,Object> metadata(String goal, String level) {
        var value = new LinkedHashMap<String,Object>(); value.put("goalCodes", List.of(goal)); value.put("level", level); value.put("audience", List.of("Indépendants travaillant sur un dossier fictif"));
        value.put("tools", List.of(Map.of("name", "ChatGPT", "url", "https://chatgpt.com/"))); value.put("sources", List.of(Map.of("label", "Catalogue de référence", "url", "/fr/catalogue")));
        value.put("faq", List.of(Map.of("question", "Le cas est-il réel ?", "answer", "Non, il s’agit d’un exercice fictif."))); value.put("evaluationDescription", "Décrire les contrôles déclaratifs, sans certification."); return value;
    }
    private static Map<String,Object> block(String text) { var result = new LinkedHashMap<String,Object>(); result.put("type", "PARAGRAPH"); result.put("text", text); result.put("url", null); return result; }
    private static Map<String,Object> save(String title, Map<String,Object> document) { return Map.of("title", title, "summary", "Minor editorial correction", "document", document, "reason", "Keep pedagogy unchanged"); }
    private static Map<String,Object> transition(String state, String source) { var result = new LinkedHashMap<String,Object>(); result.put("state", state); result.put("reason", "Explicit review action"); result.put("sourceRevisionId", source); return result; }
    private Browser account(boolean editor) throws Exception {
        var browser = browser(); String email = unique() + "@courses.invalid", password = unique() + "-isolated-secret";
        var created = send(browser, "POST", "/api/v1/auth/register", Map.of("email", email, "password", password, "locale", "fr"), csrf(browser), null);
        assertThat(created.statusCode()).isEqualTo(201); UUID owner = UUID.fromString(text(created, "id"));
        if (editor) assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'", UUID.randomUUID(), owner)).isEqualTo(1);
        var request = HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type", "application/x-www-form-urlencoded").header("X-CSRF-TOKEN", csrf(browser))
                .POST(HttpRequest.BodyPublishers.ofString("email=" + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8))).build();
        assertThat(browser.http().send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200); return browser;
    }
    private String csrf(Browser browser) throws Exception { var result = get(browser, "/api/v1/auth/csrf"); assertThat(result.statusCode()).isEqualTo(200); return tree(result).path("token").asText(); }
    private HttpResponse<String> send(Browser browser, String method, String path, Object body, String csrf, String etag) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        if (csrf != null) request.header("X-CSRF-TOKEN", csrf); if (etag != null) request.header("If-Match", etag);
        return browser.http().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> get(Browser browser, String path) throws Exception { return browser.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString()); }
    private JsonNode tree(HttpResponse<String> response) throws Exception { return mapper.readTree(response.body()); }
    private String text(HttpResponse<String> response, String field) throws Exception { return tree(response).path(field).asText(); }
    private static String etag(HttpResponse<String> response) { return response.headers().firstValue("ETag").orElseThrow(); }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private static String detail(String resource, String locale) { return CATALOGUE + "/resources/" + resource + "?locale=" + locale; }
    private static String version(String resource, String version, String locale) { return CATALOGUE + "/resources/" + resource + "/versions/" + version + "?locale=" + locale; }
    private static String unique() { return "p06-" + UUID.randomUUID(); }
    private static List<String> facetCodes(JsonNode values) { var result = new ArrayList<String>(); for (var value : values) result.add(value.path("code").asText()); return result; }
    private void assertNoPrivateFields(HttpResponse<String> response) {
        for (String field : List.of("authorId", "legacyBody", "evaluationDefinition", "correctOption", "correction", "explanation", "permissions", "email"))
            assertThat(response.body().contains("\"" + field + "\":")).as("public JSON excludes private field " + field).isFalse();
        assertThat(response.body().contains(PRIVATE_CORRECTION)).as("public JSON excludes correction contents").isFalse();
    }
    private void assertProblem(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status); assertThat(tree(response).path("type").asText()).isEqualTo("about:blank");
        assertThat(tree(response).path("status").asInt()).isEqualTo(status); assertThat(tree(response).path("code").asText()).isEqualTo(code);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
        assertThat(response.headers().firstValue("Cache-Control")).hasValueSatisfying(value -> assertThat(value).contains("no-store")); assertNoPrivateFields(response);
    }
    private static Browser browser() { return new Browser(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build()); }
    private record Browser(HttpClient http) { }
}
