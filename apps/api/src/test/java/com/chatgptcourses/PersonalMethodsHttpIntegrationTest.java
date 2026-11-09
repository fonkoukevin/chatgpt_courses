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
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real sessions, CSRF, owner checks and optimistic writes against PostgreSQL, without test-only routes. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "MAIL_MODE=disabled", "debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PersonalMethodsHttpIntegrationTest {
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
    private static final String METHODS = "/api/v1/me/methods";
    private static final String CMS = "/api/v1/admin/contents";
    private static final String PRIVATE_TEXT = "P07_PRIVATE_PERSONAL_TEXT";
    private static final String PRIVATE_SOURCE = "P07_PRIVATE_PROTECTED_DEFINITION";

    @Test
    void durableCrudSearchAndDuplicateKeepPersonalTextAndLocaleAcrossSessions() throws Exception {
        var account = account(false); var first = account.browser(); String marker = unique();
        var fields = fields(marker, "Texte français indépendant", "Notes à retrouver " + marker);
        var created = create(account, fields); String id = text(created, "id");
        assertThat(created.headers().firstValue("Location")).hasValue(METHODS + "/" + id);
        assertThat(etag(created)).isEqualTo("\"personal-method-" + id + "-r0\"");
        assertThat(tree(created).path("origin").isNull()).isTrue();
        assertPrivate(created);
        var second = browser(); login(second, account.email(), account.password());
        var reopened = get(second, METHODS + "/" + id);
        assertThat(tree(reopened).path("text").asText()).isEqualTo("Texte français indépendant");
        assertThat(tree(reopened).path("locale").asText()).isEqualTo("fr");
        assertThat(tree(get(second, METHODS + "/" + id + "/source-update")).path("status").asText()).isEqualTo("NONE");
        var result = get(second, METHODS + "?q=" + marker + "&category=Proposition&pageSize=1");
        assertThat(tree(result).path("total").asInt()).isEqualTo(1);
        assertThat(tree(result).path("items").get(0).path("id").asText()).isEqualTo(id);
        assertThat(result.body()).doesNotContain("Texte français indépendant", "Notes à retrouver");
        fields.put("text", "Retouche finale indépendante des paramètres");
        fields.put("notes", "Notes personnelles conservées");
        var saved = mutate(second, "PATCH", METHODS + "/" + id, Map.of("fields", fields), account.id(), etag(reopened));
        assertThat(saved.statusCode()).isEqualTo(200);
        assertThat(tree(saved).path("revision").asLong()).isEqualTo(1);
        assertThat(tree(get(first, METHODS + "/" + id)).path("text").asText()).isEqualTo("Retouche finale indépendante des paramètres");
        var copied = mutate(second, "POST", METHODS + "/" + id + "/duplicates", null, account.id(), etag(saved));
        assertThat(copied.statusCode()).isEqualTo(201);
        assertThat(text(copied, "id")).isNotEqualTo(id);
        assertThat(tree(copied).path("notes")).isEqualTo(tree(saved).path("notes"));
        assertThat(etag(get(first, METHODS + "/" + id))).isEqualTo(etag(saved));
        assertThat(mutate(first, "DELETE", METHODS + "/" + id, null, account.id(), etag(saved)).statusCode()).isEqualTo(204);
        assertProblem(get(second, METHODS + "/" + id), 404, "RESOURCE_NOT_FOUND");
        assertThat(get(second, METHODS + "/" + text(copied, "id")).statusCode()).isEqualTo(200);
    }

    @Test
    void otherAccountsCannotReadUpdateDuplicateDeleteOrInspectSource() throws Exception {
        var owner = account(false); var other = account(false);
        var created = create(owner, fields("Private " + unique(), PRIVATE_TEXT, "Private note")); String id = text(created, "id");
        assertProblem(get(other.browser(), METHODS + "/" + id), 404, "RESOURCE_NOT_FOUND");
        assertProblem(get(other.browser(), METHODS + "/" + id + "/source-update"), 404, "RESOURCE_NOT_FOUND");
        assertProblem(mutate(other.browser(), "PATCH", METHODS + "/" + id, Map.of("fields", fields("Attempt", "No mutation", "")), other.id(), etag(created)), 404, "RESOURCE_NOT_FOUND");
        assertProblem(mutate(other.browser(), "POST", METHODS + "/" + id + "/duplicates", null, other.id(), etag(created)), 404, "RESOURCE_NOT_FOUND");
        assertProblem(mutate(other.browser(), "DELETE", METHODS + "/" + id, null, other.id(), etag(created)), 404, "RESOURCE_NOT_FOUND");
        assertThat(tree(get(other.browser(), METHODS)).path("total").asLong()).isZero();
        assertThat(tree(get(owner.browser(), METHODS + "/" + id)).path("text").asText()).isEqualTo(PRIVATE_TEXT);
        assertProblem(get(browser(), METHODS + "/" + id), 401, "AUTHENTICATION_REQUIRED");
        assertProblem(get(owner.browser(), "/api/v1/admin/orders"), 403, "ACCESS_DENIED");
    }

    @Test
    void csrfAccountContextAndStrictValidationRejectUnconfirmedOrForgedWrites() throws Exception {
        var account = account(false); var b = account.browser(); var command = Map.of("fields", fields(unique(), "Instruction", ""));
        assertProblem(send(b, "POST", METHODS, command, null, account.id().toString(), null), 403, "CSRF_INVALID");
        assertProblem(send(b, "POST", METHODS, command, csrf(b), null, null), 428, "ACCOUNT_CONTEXT_REQUIRED");
        assertProblem(send(b, "POST", METHODS, command, csrf(b), "not-a-uuid", null), 400, "VALIDATION_FAILED");
        assertProblem(mutate(b, "POST", METHODS, command, UUID.randomUUID(), null), 409, "ACCOUNT_CONTEXT_CHANGED");
        var forged = fields(unique(), "Instruction", ""); forged.put("ownerId", UUID.randomUUID());
        assertProblem(mutate(b, "POST", METHODS, Map.of("fields", forged), account.id(), null), 400, "INVALID_REQUEST");
        var invalid = fields(" ", "Instruction", "");
        var failure = mutate(b, "POST", METHODS, Map.of("fields", invalid), account.id(), null);
        assertProblem(failure, 400, "VALIDATION_FAILED");
        assertThat(tree(failure).path("fieldErrors").get(0).path("field").asText()).isEqualTo("fields.title");
        var oversized = fields(unique(), "é".repeat(30000), "");
        assertProblem(mutate(b, "POST", METHODS, Map.of("fields", oversized), account.id(), null), 400, "VALIDATION_FAILED");
        var created = create(account, fields(unique(), "Unchanged", "")); String id = text(created, "id");
        for (String verb : List.of("PATCH", "DELETE", "POST")) {
            String path = METHODS + "/" + id + (verb.equals("POST") ? "/duplicates" : "");
            Object body = verb.equals("PATCH") ? command : null;
            assertProblem(send(b, verb, path, body, csrf(b), null, etag(created)), 428, "ACCOUNT_CONTEXT_REQUIRED");
        }
        assertProblem(get(b, METHODS + "?pageSize=101"), 400, "VALIDATION_FAILED");
        assertProblem(get(b, METHODS + "?q=" + "a".repeat(241)), 400, "VALIDATION_FAILED");
        assertThat(jdbc.update("UPDATE user_roles SET revoked_at=greatest(created_at,updated_at,CURRENT_TIMESTAMP),updated_at=greatest(created_at,updated_at,CURRENT_TIMESTAMP),revision=revision+1 WHERE user_id=? AND revoked_at IS NULL", account.id())).isPositive();
        assertProblem(mutate(b, "PATCH", METHODS + "/" + id, command, account.id(), etag(created)), 403, "ACCESS_DENIED");
    }

    @Test
    void staleAccountContextAfterLogoutAndLoginNeverImportsPreviousAccountsText() throws Exception {
        var previous = account(false); var current = account(false); var b = previous.browser();
        assertThat(send(b, "POST", "/api/v1/auth/logout", null, csrf(b), previous.id().toString(), null).statusCode()).isEqualTo(204);
        login(b, current.email(), current.password());
        var command = Map.of("fields", fields("Previous draft", PRIVATE_TEXT, ""));
        assertProblem(mutate(b, "POST", METHODS, command, previous.id(), null), 409, "ACCOUNT_CONTEXT_CHANGED");
        assertThat(tree(get(b, METHODS)).path("total").asLong()).isZero();
        var confirmed = mutate(b, "POST", METHODS, command, current.id(), null);
        assertThat(confirmed.statusCode()).isEqualTo(201);
        var previousSession = browser(); login(previousSession, previous.email(), previous.password());
        assertProblem(get(previousSession, METHODS + "/" + text(confirmed, "id")), 404, "RESOURCE_NOT_FOUND");
    }

    @Test
    void concurrentUpdatesUseStrongPreconditionsAndPersistOnlyOneWinner() throws Exception {
        var account = account(false); var created = create(account, fields(unique(), "Original", "")); String id = text(created, "id");
        var b = browser(); login(b, account.email(), account.password());
        var next = Map.of("fields", fields(unique(), "Next", ""));
        assertProblem(mutate(account.browser(), "PATCH", METHODS + "/" + id, next, account.id(), null), 428, "PRECONDITION_REQUIRED");
        assertProblem(mutate(account.browser(), "POST", METHODS + "/" + id + "/duplicates", null, account.id(), null), 428, "PRECONDITION_REQUIRED");
        assertProblem(mutate(account.browser(), "DELETE", METHODS + "/" + id, null, account.id(), null), 428, "PRECONDITION_REQUIRED");
        assertProblem(mutate(account.browser(), "PATCH", METHODS + "/" + id, next, account.id(), "W/" + etag(created)), 412, "REVISION_CONFLICT");
        String firstCsrf = csrf(account.browser()), secondCsrf = csrf(b);
        var firstRequest = request("PATCH", METHODS + "/" + id, Map.of("fields", fields(unique(), "First winner candidate", "")), firstCsrf, account.id().toString(), etag(created));
        var secondRequest = request("PATCH", METHODS + "/" + id, Map.of("fields", fields(unique(), "Second winner candidate", "")), secondCsrf, account.id().toString(), etag(created));
        var first = account.browser().http().sendAsync(firstRequest, HttpResponse.BodyHandlers.ofString());
        var second = b.http().sendAsync(secondRequest, HttpResponse.BodyHandlers.ofString());
        var responses = List.of(first.get(), second.get());
        assertThat(responses.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(200, 412);
        var loser = responses.stream().filter(value -> value.statusCode() == 412).findFirst().orElseThrow();
        assertProblem(loser, 412, "REVISION_CONFLICT");
        var winner = responses.stream().filter(value -> value.statusCode() == 200).findFirst().orElseThrow();
        var stored = get(b, METHODS + "/" + id);
        assertThat(tree(stored).path("revision").asLong()).isEqualTo(1);
        assertThat(tree(stored).path("text")).isEqualTo(tree(winner).path("text"));
        assertProblem(mutate(b, "DELETE", METHODS + "/" + id, null, account.id(), etag(created)), 412, "REVISION_CONFLICT");
    }

    @Test
    void publishedSourceCorrectionAndArchiveNeverReplacePersonalSnapshotOrNotes() throws Exception {
        var editor = account(true); var learner = account(false);
        var source = cmsCreate(editor, "METHOD_TEMPLATE", "FREE", "Source " + unique()); String contentId = text(source, "id");
        var published = publish(editor, contentId);
        var template = get(browser(), templatePath(published));
        assertThat(template.statusCode()).isEqualTo(200);
        assertThat(template.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(tree(template).path("availability").asText()).isEqualTo("PUBLISHED");
        assertThat(tree(template).path("definition").path("steps").size()).isEqualTo(2);
        var copied = copySource(learner, published, fields("My adapted source", PRIVATE_TEXT, "My notes remain"));
        assertThat(copied.statusCode()).isEqualTo(201); String methodId = text(copied, "id");
        assertThat(tree(copied).path("origin").path("revisionId").asText()).isEqualTo(text(published, "currentRevisionId"));
        assertThat(tree(get(learner.browser(), METHODS + "/" + methodId + "/source-update")).path("status").asText()).isEqualTo("CURRENT");
        var updatedDocument = document("FREE");
        updatedDocument.put("blocks", List.of(block("Editorial source correction, no automatic personal replacement.")));
        var revised = cmsAction(editor, contentId, "revisions", Map.of("title", "Corrected source", "summary", "Minor source correction", "document", updatedDocument, "reason", "Explicit correction"));
        assertThat(revised.statusCode()).isEqualTo(200); var updated = publish(editor, contentId);
        var notice = get(learner.browser(), METHODS + "/" + methodId + "/source-update");
        assertThat(tree(notice).path("status").asText()).isEqualTo("UPDATE_AVAILABLE");
        assertThat(notice.headers().firstValue("ETag")).isEmpty();
        assertThat(tree(notice).path("candidate").path("revisionId").asText()).isEqualTo(text(updated, "currentRevisionId"));
        assertProblem(copySource(learner, published, fields("Stale source", "No substitution", "")), 412, "REVISION_CONFLICT");
        var untouched = get(learner.browser(), METHODS + "/" + methodId);
        assertThat(etag(untouched)).isEqualTo(etag(copied));
        assertThat(tree(untouched)).isEqualTo(tree(copied));
        assertThat(cmsAction(editor, contentId, "archive", Map.of("reason", "Source withdrawn" )).statusCode()).isEqualTo(200);
        assertThat(tree(get(learner.browser(), METHODS + "/" + methodId + "/source-update")).path("status").asText()).isEqualTo("UNAVAILABLE");
        assertThat(tree(get(learner.browser(), METHODS + "/" + methodId))).isEqualTo(tree(copied));
        assertProblem(copySource(learner, updated, fields("Archived source", "No new access", "")), 404, "RESOURCE_NOT_FOUND");
        assertThat(mutate(learner.browser(), "POST", METHODS + "/" + methodId + "/duplicates", null, learner.id(), etag(copied)).statusCode()).isEqualTo(201);
    }

    @Test
    void premiumDraftAndWrongKindSourcesNeverExposeOrCreateProtectedContent() throws Exception {
        var editor = account(true); var learner = account(false);
        var premium = cmsCreate(editor, "METHOD_TEMPLATE", "PROTECTED", "Premium " + unique());
        premium = publish(editor, text(premium, "id"));
        for (var b : List.of(browser(), editor.browser(), learner.browser())) {
            var response = get(b, templatePath(premium));
            assertThat(tree(response).path("availability").asText()).isEqualTo("PROTECTED");
            assertThat(tree(response).path("definition").isNull()).isTrue();
            assertThat(response.body()).doesNotContain(PRIVATE_SOURCE);
        }
        assertProblem(copySource(learner, premium, fields("Forbidden source", "Cannot copy", "")), 403, "ACCESS_DENIED");
        assertProblem(copySource(editor, premium, fields("Editor cannot bypass access", "Cannot copy", "")), 403, "ACCESS_DENIED");
        var draft = cmsCreate(editor, "METHOD_TEMPLATE", "FREE", "Draft " + unique());
        assertProblem(get(browser(), templatePath(draft)), 404, "RESOURCE_NOT_FOUND");
        assertProblem(copySource(learner, draft, fields("Draft copy", "Cannot copy", "")), 404, "RESOURCE_NOT_FOUND");
        var guide = cmsCreate(editor, "GUIDE", "FREE", "Wrong kind " + unique()); guide = publish(editor, text(guide, "id"));
        assertProblem(get(browser(), templatePath(guide)), 404, "RESOURCE_NOT_FOUND");
        assertProblem(copySource(learner, guide, fields("Guide copy", "Cannot copy", "")), 404, "RESOURCE_NOT_FOUND");
        var noDefinition = document("FREE"); noDefinition.remove("methodDefinition");
        var legacy = cmsCreate(editor, "METHOD_TEMPLATE", "FREE", "Incomplete definition " + unique(), noDefinition);
        var readiness = tree(get(editor.browser(), CMS + "/" + text(legacy, "id") + "/readiness"));
        assertThat(readiness.path("ready").asBoolean()).isFalse();
        boolean missingDefinition = false;
        for (var issue : readiness.path("blockingIssues")) missingDefinition |= issue.path("code").asText().equals("METHOD_DEFINITION_REQUIRED");
        assertThat(missingDefinition).isTrue();
    }

    private HttpResponse<String> create(Account account, Map<String,Object> fields) throws Exception {
        var response = mutate(account.browser(), "POST", METHODS, Map.of("fields", fields), account.id(), null);
        assertThat(response.statusCode()).isEqualTo(201); return response;
    }
    private HttpResponse<String> copySource(Account account, HttpResponse<String> source, Map<String,Object> fields) throws Exception {
        return mutate(account.browser(), "POST", METHODS + "/from-template", Map.of("sourceResourceId", text(source, "resourceId"), "sourceVersionId", text(source, "versionId"),
                "sourceRevisionId", text(source, "currentRevisionId"), "sourceLocale", "fr", "fields", fields), account.id(), null);
    }
    private String templatePath(HttpResponse<String> source) throws Exception { return "/api/v1/method-templates/" + text(source, "resourceId") + "/versions/" + text(source, "versionId") + "?locale=fr"; }
    private HttpResponse<String> cmsCreate(Account editor, String kind, String access, String title) throws Exception { return cmsCreate(editor, kind, access, title, document(access)); }
    private HttpResponse<String> cmsCreate(Account editor, String kind, String access, String title, Map<String,Object> document) throws Exception {
        if (!kind.equals("METHOD_TEMPLATE")) document.remove("methodDefinition");
        var response = send(editor.browser(), "POST", CMS, Map.of("kind", kind, "locale", "fr", "slug", unique(), "title", title, "summary", "Isolated fictional method source",
                "objectives", "Prepare a factual proposal", "evaluationDefinition", "Declared factual checks", "document", document, "childVersionIds", List.of(), "reason", "Isolated P07 HTTP test"), csrf(editor.browser()), null, null);
        assertThat(response.statusCode()).isEqualTo(201); return response;
    }
    private HttpResponse<String> cmsAction(Account editor, String id, String action, Object body) throws Exception {
        return send(editor.browser(), "POST", CMS + "/" + id + "/" + action, body, csrf(editor.browser()), null, etag(get(editor.browser(), CMS + "/" + id)));
    }
    private HttpResponse<String> publish(Account editor, String id) throws Exception {
        assertThat(cmsAction(editor, id, "transition", transition("TO_REVIEW")).statusCode()).isEqualTo(200);
        var ready = cmsAction(editor, id, "transition", transition("READY")); assertThat(ready.statusCode()).isEqualTo(200);
        var result = cmsAction(editor, id, "publish", Map.of("revisionId", text(ready, "currentRevisionId"), "reason", "Explicit source publication"));
        assertThat(result.statusCode()).isEqualTo(200); return result;
    }
    private static Map<String,Object> transition(String state) { var value = new LinkedHashMap<String,Object>(); value.put("state", state); value.put("reason", "Explicit source review"); value.put("sourceRevisionId", null); return value; }
    private static Map<String,Object> fields(String title, String text, String notes) {
        var value = new LinkedHashMap<String,Object>(); value.put("title", title); value.put("locale", "fr"); value.put("text", text);
        value.put("parameters", parameters()); value.put("generatedFrom", parameters()); value.put("notes", notes); value.put("category", "Proposition"); return value;
    }
    private static Map<String,Object> parameters() { return Map.of("objective", "Préparer une proposition", "context", "", "availableData", "BR01 et TR01 fictifs", "recipient", "Client R", "format", "Deux pages maximum", "constraints", "Aucun fait inventé", "clarifications", "Logo et intégration à chiffrer séparément"); }
    private static Map<String,Object> document(String access) {
        var value = new LinkedHashMap<String,Object>(); value.put("objective", "Préparer une proposition factuelle."); value.put("expectedResult", "Une instruction adaptée au dossier fictif.");
        value.put("prerequisites", List.of("Lire BR01 et TR01")); value.put("blocks", List.of(block("Réécrire les quatre pages existantes, sans inventer de prix de formation."))); value.put("estimatedMinutes", null);
        value.put("exercise", Map.of("instructions", "Repérer les éléments à clarifier.", "correction", "PRIVATE_CORRECTION_NOT_A_METHOD_FIELD")); value.put("quiz", List.of());
        value.put("rubric", List.of(Map.of("key", "fidelity", "label", "Respecter les faits", "points", 1, "blocking", true))); value.put("access", access); value.put("media", List.of()); value.put("relatedResourceIds", List.of());
        value.put("methodDefinition", Map.of("useCases", List.of("Préparer une proposition"), "requiredInputs", List.of("Brief", "Tarifs"), "steps", List.of("Séparer faits et inconnues", "Préparer puis vérifier"),
                "starterInstruction", access.equals("PROTECTED") ? PRIVATE_SOURCE : "Utilise les seules données BR01 et TR01.", "example", "Ne pas chiffrer le logo sans donnée.", "checks", List.of("Relire chaque fait"), "limitations", List.of("Aucun résultat commercial promis"), "defaults", parameters()));
        return value;
    }
    private static Map<String,Object> block(String text) { var value = new LinkedHashMap<String,Object>(); value.put("type", "PARAGRAPH"); value.put("text", text); value.put("url", null); return value; }
    private Account account(boolean editor) throws Exception {
        var b = browser(); String email = unique() + "@courses.invalid", password = unique() + "-isolated-password";
        var registered = send(b, "POST", "/api/v1/auth/register", Map.of("email", email, "password", password, "locale", "fr"), csrf(b), null, null);
        assertThat(registered.statusCode()).isEqualTo(201); UUID id = UUID.fromString(text(registered, "id"));
        if (editor) assertThat(jdbc.update("INSERT INTO user_roles(id,user_id,role_id) SELECT ?,?,id FROM roles WHERE code='EDITOR'", UUID.randomUUID(), id)).isEqualTo(1);
        login(b, email, password); return new Account(b, id, email, password);
    }
    private void login(Browser b, String email, String password) throws Exception {
        var request = HttpRequest.newBuilder(uri("/api/v1/auth/login")).header("Content-Type", "application/x-www-form-urlencoded").header("X-CSRF-TOKEN", csrf(b))
                .POST(HttpRequest.BodyPublishers.ofString("email=" + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8))).build();
        assertThat(b.http().send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);
    }
    private String csrf(Browser b) throws Exception { var response = get(b, "/api/v1/auth/csrf"); assertThat(response.statusCode()).isEqualTo(200); return text(response, "token"); }
    private HttpResponse<String> mutate(Browser b, String verb, String path, Object body, UUID context, String etag) throws Exception { return send(b, verb, path, body, csrf(b), context == null ? null : context.toString(), etag); }
    private HttpResponse<String> send(Browser b, String verb, String path, Object body, String csrf, String context, String etag) throws Exception { return b.http().send(request(verb, path, body, csrf, context, etag), HttpResponse.BodyHandlers.ofString()); }
    private HttpRequest request(String verb, String path, Object body, String csrf, String context, String etag) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).method(verb, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        if (body != null) request.header("Content-Type", "application/json");
        if (csrf != null) request.header("X-CSRF-TOKEN", csrf); if (context != null) request.header("X-Account-Context", context); if (etag != null) request.header("If-Match", etag);
        return request.build();
    }
    private HttpResponse<String> get(Browser b, String path) throws Exception { return b.http().send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString()); }
    private JsonNode tree(HttpResponse<String> response) throws Exception { return mapper.readTree(response.body()); }
    private String text(HttpResponse<String> response, String field) throws Exception { return tree(response).path(field).asText(); }
    private static String etag(HttpResponse<String> response) { return response.headers().firstValue("ETag").orElseThrow(); }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private static String unique() { return "p07-" + UUID.randomUUID(); }
    private void assertPrivate(HttpResponse<String> response) { assertThat(response.headers().firstValue("Cache-Control")).hasValue("private, no-store"); assertThat(response.body()).doesNotContain("\"ownerId\"", "\"passwordHash\""); }
    private void assertProblem(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status); var body = tree(response);
        assertThat(body.path("type").asText()).isEqualTo("about:blank"); assertThat(body.path("status").asInt()).isEqualTo(status); assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(body.path("traceId").asText()).matches("[0-9a-f-]{36}");
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
        assertPrivate(response); assertThat(response.body()).doesNotContain(PRIVATE_TEXT, PRIVATE_SOURCE, "rejectedValue", "passwordHash");
    }
    private static Browser browser() { return new Browser(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build()); }
    private record Browser(HttpClient http) { }
    private record Account(Browser browser, UUID id, String email, String password) { @Override public String toString() { return "Account[redacted]"; } }
}
