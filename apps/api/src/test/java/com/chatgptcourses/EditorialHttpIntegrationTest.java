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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Publication scenarios through real Spring authorization/CSRF filters and PostgreSQL. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "MAIL_MODE=disabled", "debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class EditorialHttpIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42")
            .asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        registry.add("POSTGRES_HOST", POSTGRES::getHost);
        registry.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        registry.add("POSTGRES_DB", POSTGRES::getDatabaseName);
        registry.add("POSTGRES_USER", POSTGRES::getUsername);
        registry.add("POSTGRES_PASSWORD", POSTGRES::getPassword);
    }
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    private static final String ADMIN = "/api/v1/admin/contents";

    @Test
    void completeLifecyclePublishesOnlyChosenRevisionAndPreservesHistoryOnArchive() throws Exception {
        var editor = account(true);
        var anonymous = browser();
        var created = create(editor, "FREE");
        String id = text(created, "id"), resource = text(created, "resourceId"), version = text(created, "versionId");
        assertThat(text(created, "state")).isEqualTo("DRAFT");
        assertThat(tree(created).path("verifiedAt").isNull()).isTrue();
        assertProblem(get(anonymous, publicPath(resource, "fr") + "&preview=true"), 404, "RESOURCE_NOT_FOUND");
        assertProblem(get(anonymous, ADMIN + "/" + id + "/preview"), 401, "AUTHENTICATION_REQUIRED");
        var preview = get(editor, ADMIN + "/" + id + "/preview");
        assertThat(preview.statusCode()).isEqualTo(200);
        assertThat(preview.headers().firstValue("Cache-Control")).hasValueSatisfying(value -> assertThat(value).contains("private", "no-store"));
        assertThat(preview.headers().firstValue("X-Robots-Tag")).hasValue("noindex, nofollow");
        assertThat(tree(get(editor, ADMIN + "/" + id + "/readiness")).path("ready").asBoolean()).isTrue();
        var published = publish(editor, id);
        assertThat(text(published, "state")).isEqualTo("PUBLISHED");
        assertThat(tree(published).path("frozenAt").isNull()).isFalse();
        assertThat(tree(published).path("verifiedAt").isNull()).isFalse();
        var publicResponse = get(anonymous, publicPath(resource, "fr"));
        assertThat(publicResponse.statusCode()).isEqualTo(200);
        var publicBody = tree(publicResponse);
        assertThat(publicBody.path("document").isObject()).isTrue();
        assertThat(publicBody.path("revisionId").asText()).isEqualTo(text(published, "currentRevisionId"));
        assertThat(publicBody.path("document").has("exercise")).isFalse();
        assertThat(publicBody.path("document").has("exerciseInstructions")).isTrue();
        assertThat(publicBody.path("document").path("quiz").get(0).has("correctOption")).isFalse();
        assertThat(publicBody.path("document").path("quiz").get(0).has("explanation")).isFalse();
        assertThat(publicResponse.body().contains("P05 private correction sentinel")).as("exercise correction not serialized publicly").isFalse();

        var correctedDocument = document("FREE");
        correctedDocument.put("blocks", List.of(block("PARAGRAPH", "Correction mineure : conserver les faits du brief.", null)));
        var correction = command(editor, id, "revisions", save("Correction éditoriale", correctedDocument));
        assertThat(text(correction, "state")).isEqualTo("DRAFT");
        assertThat(text(correction, "versionId")).isEqualTo(version);
        assertThat(text(correction, "resourceId")).isEqualTo(resource);
        assertThat(text(get(anonymous, publicPath(resource, "fr")), "title")).isEqualTo(text(published, "title"));
        var history = tree(get(editor, ADMIN + "/" + id + "/revisions?page=0&size=10"));
        assertThat(history.path("total").asLong()).isEqualTo(2);
        assertThat(history.path("items").get(1).path("id").asText()).isEqualTo(text(published, "currentRevisionId"));
        assertThat(tree(get(editor, ADMIN + "/" + id + "/dependencies")).path("canArchive").asBoolean()).isTrue();
        var archived = command(editor, id, "archive", Map.of("reason", "Retrait explicite de la ressource de test"));
        assertThat(text(archived, "state")).isEqualTo("ARCHIVED");
        assertProblem(get(anonymous, publicPath(resource, "fr")), 404, "RESOURCE_NOT_FOUND");
        assertThat(tree(get(editor, ADMIN + "/" + id + "/revisions")).path("total").asLong()).isEqualTo(2);
    }

    @Test
    void translationBecomesStaleWithoutLeakingItsBodyAndFamilyEtagsChange() throws Exception {
        var editor = account(true);
        var anonymous = browser();
        var fr = create(editor, "FREE");
        String id = text(fr, "id"), resource = text(fr, "resourceId");
        fr = publish(editor, id);
        assertProblem(get(anonymous, publicPath(resource, "en")), 404, "RESOURCE_NOT_FOUND");
        var translation = command(editor, id, "translations", Map.of("locale", "en", "slug", slug(), "title", "Distinguish facts and unknowns",
                "summary", "English editorial test", "document", document("FREE"), "reason", "Traduction explicite de test"));
        assertThat(translation.statusCode()).isEqualTo(201);
        String enId = text(translation, "id");
        assertThat(text(translation, "resourceId")).isEqualTo(resource);
        assertThat(text(translation, "versionId")).isEqualTo(text(fr, "versionId"));
        var publishedEn = publish(editor, enId);
        assertThat(tree(get(anonymous, publicPath(resource, "en"))).path("document").isObject()).isTrue();
        String sourceEtag = etag(get(editor, ADMIN + "/" + id));
        var enSnapshot = get(editor, ADMIN + "/" + enId);
        String englishEtag = etag(enSnapshot);
        command(editor, id, "revisions", save("Correction de la source française", document("FREE")));
        var stale = get(editor, ADMIN + "/" + enId);
        assertThat(text(stale, "state")).isEqualTo("STALE");
        assertThat(etag(stale)).isNotEqualTo(englishEtag);
        assertThat(etag(get(editor, ADMIN + "/" + id))).isNotEqualTo(sourceEtag);
        var stalePublic = tree(get(anonymous, publicPath(resource, "en")));
        assertThat(stalePublic.path("availability").asText()).isEqualTo("STALE");
        assertThat(stalePublic.path("document").isNull()).isTrue();
        assertThat(stalePublic.path("revisionId").asText()).isEqualTo(text(publishedEn, "currentRevisionId"));
        assertThat(tree(get(editor, ADMIN + "/" + enId + "/revisions")).path("total").asLong()).isEqualTo(1);
        assertThat(tree(get(editor, ADMIN + "/" + id)).path("translations").size()).isEqualTo(2);
    }

    @Test
    void protectedContentNeverExposesDocumentAndUnverifiedPromisedMediaBlocksPublication() throws Exception {
        var editor = account(true);
        var anonymous = browser();
        var protectedContent = create(editor, "PROTECTED");
        String protectedId = text(protectedContent, "id"), resource = text(protectedContent, "resourceId");
        publish(editor, protectedId);
        for (var browser : List.of(anonymous, editor)) {
            var response = get(browser, publicPath(resource, "fr") + "&preview=true");
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(tree(response).path("access").asText()).isEqualTo("PROTECTED");
            assertThat(tree(response).path("document").isNull()).isTrue();
            assertThat(response.body().contains("P05 private correction sentinel")).isFalse();
        }
        var missing = document("FREE");
        missing.put("media", List.of(Map.of("assetId", UUID.randomUUID(), "kind", "VIDEO", "required", true, "label", "Média promis non produit")));
        var blocked = create(editor, missing);
        String blockedId = text(blocked, "id");
        var readiness = tree(get(editor, ADMIN + "/" + blockedId + "/readiness"));
        assertThat(readiness.path("ready").asBoolean()).isFalse();
        var codes = new ArrayList<String>();
        for (var issue : readiness.path("blockingIssues")) codes.add(issue.path("code").asText());
        assertThat(codes).contains("MEDIA_UNVERIFIED");
        command(editor, blockedId, "transition", transition("TO_REVIEW", null));
        assertProblem(command(editor, blockedId, "transition", transition("READY", null)), 409, "CONTENT_NOT_READY");
        assertProblem(command(editor, blockedId, "publish", Map.of("revisionId", text(blocked, "currentRevisionId"), "reason", "Publication refusée attendue")), 409, "CONTENT_NOT_READY");
        assertProblem(get(anonymous, publicPath(text(blocked, "resourceId"), "fr")), 404, "RESOURCE_NOT_FOUND");
    }

    @Test
    void csrfAndPrecisePermissionsProtectRealRoutesAndFutureCommerceStaysDenied() throws Exception {
        var learner = account(false);
        var editor = account(true);
        assertProblem(get(learner, ADMIN), 403, "ACCESS_DENIED");
        var created = create(editor, "FREE");
        String id = text(created, "id");
        assertProblem(send(editor, "POST", ADMIN + "/" + id + "/revisions", save("Sans CSRF", document("FREE")), null, etag(created)), 403, "CSRF_INVALID");
        assertProblem(send(learner, "POST", ADMIN + "/" + id + "/revisions", save("Sans permission", document("FREE")), csrf(learner), etag(created)), 403, "ACCESS_DENIED");
        // This is deny-all protection of a future route, not a commerce integration claim.
        assertProblem(get(editor, "/api/v1/admin/orders"), 403, "ACCESS_DENIED");
        assertThat(tree(get(editor, ADMIN + "?kind=ACTIVITY&locale=fr&page=0&size=1")).path("size").asInt()).isEqualTo(1);
        assertProblem(get(editor, ADMIN + "?size=101"), 400, "VALIDATION_FAILED");
        assertProblem(get(editor, ADMIN + "?page=1000001"), 400, "VALIDATION_FAILED");
        jdbc.update("UPDATE user_roles SET revoked_at=current_timestamp,revision=revision+1 WHERE user_id=? AND role_id=(SELECT id FROM roles WHERE code='EDITOR') AND revoked_at IS NULL", editor.owner());
        assertProblem(get(editor, ADMIN + "/" + id), 403, "ACCESS_DENIED");
    }

    @Test
    void concurrentWritersKeepWinnerAndFrozenPedagogyRequiresANewVersion() throws Exception {
        var editor = account(true);
        var created = create(editor, "FREE");
        String id = text(created, "id");
        var token = csrf(editor);
        assertProblem(send(editor, "POST", ADMIN + "/" + id + "/revisions", save("Sans révision", document("FREE")), token, null), 428, "PRECONDITION_REQUIRED");
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        List<HttpResponse<String>> results;
        try (var executor = Executors.newFixedThreadPool(2)) {
            var futures = List.of("Première modification", "Deuxième modification").stream().map(title -> executor.submit(() -> {
                ready.countDown();
                if (!go.await(5, TimeUnit.SECONDS)) throw new AssertionError("Concurrent write start not released");
                return send(editor, "POST", ADMIN + "/" + id + "/revisions", save(title, document("FREE")), token, etag(created));
            })).toList();
            assertThat(ready.await(3, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            results = List.of(futures.get(0).get(15, TimeUnit.SECONDS), futures.get(1).get(15, TimeUnit.SECONDS));
        }
        assertThat(results.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(200, 412);
        assertProblem(results.stream().filter(response -> response.statusCode() == 412).findFirst().orElseThrow(), 412, "REVISION_CONFLICT");
        var winner = results.stream().filter(response -> response.statusCode() == 200).findFirst().orElseThrow();
        assertThat(text(get(editor, ADMIN + "/" + id), "title")).isEqualTo(text(winner, "title"));
        assertThat(tree(get(editor, ADMIN + "/" + id + "/revisions")).path("total").asLong()).isEqualTo(2);
        var published = publish(editor, id);
        var altered = document("FREE"); altered.put("objective", "Un nouvel objectif pédagogique exige sa propre version.");
        assertProblem(command(editor, id, "revisions", save("Nouveaux objectifs", altered)), 409, "NEW_PEDAGOGICAL_VERSION_REQUIRED");
        var version = command(editor, id, "versions", Map.of("objectives", "Nouvel objectif pédagogique", "evaluationDefinition", "Nouvelle évaluation déclarative", "title", "Version pédagogique suivante", "summary", "Version distincte", "document", altered, "childVersionIds", List.of(), "reason", "Changement pédagogique explicite"));
        assertThat(version.statusCode()).isEqualTo(201);
        assertThat(text(version, "resourceId")).isEqualTo(text(published, "resourceId"));
        assertThat(text(version, "versionId")).isNotEqualTo(text(published, "versionId"));
        assertThat(tree(version).path("versionNumber").asInt()).isEqualTo(2);
        assertThat(text(get(browser(), publicPath(text(published, "resourceId"), "fr")), "versionId")).isEqualTo(text(published, "versionId"));
    }

    @Test
    void strictPayloadsRejectInventedAvailabilityAndUnsafeLinksWhilePreviewKeepsTextLiteral() throws Exception {
        var editor = account(true);
        var unsafe = document("FREE"); unsafe.put("blocks", List.of(block("LINK", "Lien dangereux", "javascript:alert(1)")));
        assertProblem(create(editor, unsafe), 400, "VALIDATION_FAILED");
        var unknown = createBody(document("FREE")); unknown.put("userId", UUID.randomUUID());
        assertProblem(send(editor, "POST", ADMIN, unknown, csrf(editor), null), 400, "INVALID_REQUEST");
        var numeric = document("FREE"); numeric.put("estimatedMinutes", 1.5);
        assertProblem(create(editor, numeric), 400, "INVALID_REQUEST");
        var invented = document("FREE");
        invented.put("media", List.of(Map.of("assetId", UUID.randomUUID(), "kind", "VIDEO", "required", true, "label", "Référence", "available", true)));
        assertProblem(create(editor, invented), 400, "INVALID_REQUEST");
        var literal = document("FREE");
        String text = "<script>window.P05ShouldNeverRun=true</script>";
        literal.put("blocks", List.of(block("PARAGRAPH", text, null)));
        var created = create(editor, literal);
        assertThat(created.statusCode()).isEqualTo(201);
        var preview = get(editor, ADMIN + "/" + text(created, "id") + "/preview");
        assertThat(tree(preview).path("document").path("blocks").get(0).path("text").asText()).isEqualTo(text);
        assertThat(preview.headers().firstValue("Content-Type")).hasValueSatisfying(value -> assertThat(value).startsWith("application/json"));
        // Browser rendering of this literal is checked separately; JSON persistence is not a visual XSS test.
    }

    @Test
    void p03LegacyTextStaysReadableAndRequiresExplicitStructuredConversion() throws Exception {
        var editor = account(true);
        try (var fixture = getClass().getResourceAsStream("/devdata/p03-demo.sql")) {
            assertThat(fixture).isNotNull();
            jdbc.execute(new String(fixture.readAllBytes(), StandardCharsets.UTF_8));
        }
        UUID id = UUID.fromString("03400000-0000-4000-8000-000000000005");
        String legacyBody = jdbc.queryForObject("SELECT body FROM editorial_revisions WHERE translation_id=?", String.class, id);
        var legacy = get(editor, ADMIN + "/" + id);
        assertThat(legacy.statusCode()).isEqualTo(200);
        assertThat(tree(legacy).path("document").isNull()).isTrue();
        assertThat(tree(legacy).path("legacyBody").asText()).isEqualTo(legacyBody);
        assertThat(legacyBody).isNotBlank();
        var readiness = tree(get(editor, ADMIN + "/" + id + "/readiness"));
        assertThat(readiness.path("ready").asBoolean()).isFalse();
        assertThat(readiness.path("blockingIssues").get(0).path("code").asText()).isEqualTo("STRUCTURED_DOCUMENT_REQUIRED");
        var converted = command(editor, id.toString(), "revisions", save("Conversion structurée explicite du dossier fictif", document("FREE")));
        assertThat(converted.statusCode()).isEqualTo(200);
        assertThat(tree(converted).path("document").isObject()).isTrue();
        assertThat(tree(converted).path("legacyBody").isNull()).isTrue();
        var history = tree(get(editor, ADMIN + "/" + id + "/revisions"));
        assertThat(history.path("total").asLong()).isEqualTo(2);
        assertThat(history.path("items").get(1).path("document").isNull()).isTrue();
        assertThat(history.path("items").get(1).path("legacyBody").asText()).isEqualTo(legacyBody);
        assertProblem(get(browser(), publicPath(text(converted, "resourceId"), "fr")), 404, "RESOURCE_NOT_FOUND");
    }

    private HttpResponse<String> publish(Browser editor, String id) throws Exception {
        var submitted = command(editor, id, "transition", transition("TO_REVIEW", null));
        assertThat(submitted.statusCode()).isEqualTo(200);
        var current = tree(get(editor, ADMIN + "/" + id));
        String source = current.path("sourceRevisionId").isNull() ? null : current.path("sourceRevisionId").asText();
        var reviewed = command(editor, id, "transition", transition("READY", source));
        assertThat(reviewed.statusCode()).isEqualTo(200);
        var published = command(editor, id, "publish", Map.of("revisionId", text(reviewed, "currentRevisionId"), "reason", "Publication de la révision de test vérifiée"));
        assertThat(published.statusCode()).isEqualTo(200);
        return published;
    }
    private HttpResponse<String> command(Browser editor, String id, String suffix, Object body) throws Exception {
        var current = get(editor, ADMIN + "/" + id);
        return send(editor, "POST", ADMIN + "/" + id + "/" + suffix, body, csrf(editor), etag(current));
    }
    private HttpResponse<String> create(Browser editor, String access) throws Exception { return create(editor, document(access)); }
    private HttpResponse<String> create(Browser editor, Map<String,Object> document) throws Exception { return send(editor, "POST", ADMIN, createBody(document), csrf(editor), null); }
    private static Map<String,Object> createBody(Map<String,Object> document) {
        return new LinkedHashMap<>(Map.of("kind", "ACTIVITY", "locale", "fr", "slug", slug(), "title", "Distinguer faits et inconnues", "summary", "Cas pédagogique fictif P05", "objectives", "Distinguer faits et inconnues du brief", "evaluationDefinition", "Contrôles déclaratifs du dossier", "document", document, "childVersionIds", List.of(), "reason", "Création isolée de test"));
    }
    private static Map<String,Object> document(String access) {
        var value = new LinkedHashMap<String,Object>();
        value.put("objective", "Distinguer les faits des informations à confirmer dans BR01.");
        value.put("expectedResult", "Un tableau faits, inconnues et conséquences.");
        value.put("prerequisites", List.of());
        value.put("blocks", List.of(block("PARAGRAPH", "Client R demande quatre pages en français. Le logo et l’intégration restent à clarifier.", null)));
        value.put("estimatedMinutes", null);
        value.put("exercise", Map.of("instructions", "Relever deux informations manquantes du brief.", "correction", "P05 private correction sentinel : date des documents et périmètre du logo à confirmer."));
        value.put("quiz", List.of(Map.of("key", "brief-unknown", "prompt", "Quel élément reste à confirmer ?", "options", List.of("La date des documents", "Le nombre de pages"), "correctOption", 0, "explanation", "La date de disponibilité n’est pas fournie.", "points", 1)));
        value.put("rubric", List.of(Map.of("key", "facts", "label", "Aucun fait inventé", "points", 1, "blocking", true)));
        value.put("access", access); value.put("media", List.of()); value.put("relatedResourceIds", List.of());
        return value;
    }
    private static Map<String,Object> block(String type, String text, String url) {
        var result = new LinkedHashMap<String,Object>(); result.put("type", type); result.put("text", text); result.put("url", url); return result;
    }
    private static Map<String,Object> transition(String state, String source) {
        var result = new LinkedHashMap<String,Object>(); result.put("state", state); result.put("reason", "Vérification éditoriale explicite de test"); result.put("sourceRevisionId", source); return result;
    }
    private static Map<String,Object> save(String title, Map<String,Object> document) { return Map.of("title", title, "summary", "Révision éditoriale isolée", "document", document, "reason", "Correction mineure de test"); }
    private Browser account(boolean editor) throws Exception {
        var browser = browser(); String email = "p05-" + UUID.randomUUID() + "@courses.invalid";
        String password = "P05-" + UUID.randomUUID() + "-isolated";
        var registered = send(browser, "POST", "/api/v1/auth/register", Map.of("email", email, "password", password, "locale", "fr"), csrf(browser), null);
        assertThat(registered.statusCode()).isEqualTo(201);
        UUID owner = UUID.fromString(text(registered, "id"));
        if (editor) assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'", UUID.randomUUID(), owner)).isEqualTo(1);
        var csrf = csrf(browser);
        var request = HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type", "application/x-www-form-urlencoded").header("X-CSRF-TOKEN", csrf)
                .POST(HttpRequest.BodyPublishers.ofString("email=" + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8))).build();
        assertThat(browser.http().send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);
        return new Browser(browser.http(), owner);
    }
    private String csrf(Browser browser) throws Exception {
        var response = get(browser, "/api/v1/auth/csrf"); assertThat(response.statusCode()).isEqualTo(200); return tree(response).path("token").asText();
    }
    private HttpResponse<String> send(Browser browser, String method, String path, Object body, String csrf, String etag) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        if (csrf != null) request.header("X-CSRF-TOKEN", csrf);
        if (etag != null) request.header("If-Match", etag);
        return browser.http().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> get(Browser browser, String path) throws Exception {
        return browser.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    private void assertProblem(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
        assertThat(response.headers().firstValue("Cache-Control")).hasValueSatisfying(value -> assertThat(value).contains("no-store"));
        assertThat(tree(response).path("type").asText()).isEqualTo("about:blank");
        assertThat(tree(response).path("status").asInt()).isEqualTo(status);
        assertThat(tree(response).path("code").asText()).isEqualTo(code);
        assertThat(response.body().contains("P05 private correction sentinel")).as("errors do not disclose editorial body").isFalse();
    }
    private JsonNode tree(HttpResponse<String> response) throws Exception { return mapper.readTree(response.body()); }
    private String text(HttpResponse<String> response, String property) throws Exception { return tree(response).path(property).asText(); }
    private static String etag(HttpResponse<String> response) { return response.headers().firstValue("ETag").orElseThrow(); }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private static String publicPath(String resource, String locale) { return "/api/v1/contents/" + resource + "?locale=" + locale; }
    private static String slug() { return "p05-" + UUID.randomUUID(); }
    private static Browser browser() { return new Browser(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build(), null); }
    private record Browser(HttpClient http, UUID owner) { }
}
