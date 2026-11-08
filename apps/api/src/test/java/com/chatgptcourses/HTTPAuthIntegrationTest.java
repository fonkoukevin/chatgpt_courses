package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.Socket;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Real servlet filters, JDBC sessions, PostgreSQL and SMTP; no mock authentication. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class HTTPAuthIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42")
            .asCompatibleSubstituteFor("postgres"));
    @Container
    static final GenericContainer<?> MAILPIT = new GenericContainer<>(DockerImageName.parse(
            "axllent/mailpit:v1.33.0@sha256:9b3a463be15354c0f0eba91697d80e3e0d8a5623ef0e627cacc836bc17fd5231"))
            .withExposedPorts(1025, 8025).waitingFor(Wait.forHttp("/readyz").forPort(8025));

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);
        registry.add("POSTGRES_HOST", POSTGRES::getHost);
        registry.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        registry.add("POSTGRES_DB", POSTGRES::getDatabaseName);
        registry.add("POSTGRES_USER", POSTGRES::getUsername);
        registry.add("POSTGRES_PASSWORD", POSTGRES::getPassword);
        registry.add("MAIL_HOST", MAILPIT::getHost);
        registry.add("MAIL_PORT", () -> MAILPIT.getMappedPort(1025));
        registry.add("MAIL_MODE", () -> "local");
        registry.add("MAIL_FROM", () -> "noreply@courses.local.invalid");
    }

    private static final String PASSWORD = "P04 isolated initial secret!";
    private static final String NEW_PASSWORD = "P04 isolated replacement secret!";
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;

    @Test
    void registrationValidatesNormalizesAndNeverAcceptsClientPrivilegesOrLogsIn() throws Exception {
        var browser = browser();
        var csrf = csrf(browser);
        String email = email();
        assertProblem(json(browser, "POST", "/api/v1/auth/register", Map.of("email", email,
                "password", PASSWORD, "locale", "fr", "roles", List.of("ADMIN")), csrf, null), 400, "INVALID_REQUEST");
        assertProblem(json(browser, "POST", "/api/v1/auth/register", Map.of("email", email,
                "password", "short", "locale", "fr"), csrf, null), 400, "VALIDATION_FAILED");
        var response = register(browser, "  " + email.toUpperCase(java.util.Locale.ROOT) + "  ", csrf);
        assertThat(response.statusCode()).isEqualTo(201);
        var user = tree(response);
        assertThat(user.path("email").asText()).isEqualTo(email);
        assertThat(user.path("roles").size()).isEqualTo(1);
        assertThat(user.path("roles").get(0).asText()).isEqualTo("LEARNER");
        var permissionCodes = new java.util.ArrayList<String>();
        for (var permission : user.path("permissions")) permissionCodes.add(permission.asText());
        assertThat(permissionCodes).contains("identity.preferences.write", "assets.read", "assets.write",
                "media.progress.read", "media.progress.write");
        assertThat(permissionCodes).doesNotContain("notifications.read", "notifications.manage", "content.write", "content.publish");
        assertThat(response.body().contains("password")).as("credentials excluded from profile").isFalse();
        assertProblem(get(browser, "/api/v1/auth/me"), 401, "AUTHENTICATION_REQUIRED");
        assertProblem(register(browser, email, csrf), 409, "EMAIL_ALREADY_REGISTERED");
    }

    @Test
    void loginRequiresCsrfRotatesSessionAndStoresOnlyCredentialFreePrincipal() throws Exception {
        var browser = browser();
        var csrf = csrf(browser);
        String anonymousCookie = sessionCookie(browser);
        String email = email();
        var user = tree(register(browser, email, csrf));
        assertProblem(login(browser, email, PASSWORD, null), 403, "CSRF_INVALID");
        assertProblem(login(browser, email, PASSWORD, new Csrf("invalid", csrf.headerName())), 403, "CSRF_INVALID");
        assertProblem(login(browser, email, "incorrect", csrf), 401, "BAD_CREDENTIALS");
        assertThat(login(browser, email, PASSWORD, csrf).statusCode()).isEqualTo(200);
        assertThat(sessionCookie(browser).equals(anonymousCookie)).as("session fixation rotation").isFalse();
        String owner = user.path("id").asText();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM spring_session WHERE principal_name=?", Integer.class, owner)).isEqualTo(1);
        var serialized = jdbc.queryForList("SELECT a.attribute_bytes FROM spring_session_attributes a JOIN spring_session s ON s.primary_id=a.session_primary_id WHERE s.principal_name=?", byte[].class, owner);
        String hash = jdbc.queryForObject("SELECT password_hash FROM user_accounts WHERE id=?", String.class, UUID.fromString(owner));
        for (byte[] value : serialized) {
            String bytes = new String(value, StandardCharsets.ISO_8859_1);
            assertThat(bytes.contains(hash) || bytes.contains(PASSWORD)).as("JDBC session excludes password and hash").isFalse();
        }
        var preferences = get(browser, "/api/v1/me/preferences");
        String etag = preferences.headers().firstValue("ETag").orElseThrow();
        assertProblem(json(browser, "PATCH", "/api/v1/me/preferences", Map.of("locale", "en"), csrf, etag), 403, "CSRF_INVALID");
        var freshCsrf = csrf(browser);
        assertThat(json(browser, "PATCH", "/api/v1/me/preferences", Map.of("locale", "en"), freshCsrf, etag).statusCode()).isEqualTo(200);
        // A fresh HTTP client carrying the opaque cookie reads the same persisted identity.
        var secondClient = new Browser(HttpClient.newBuilder().cookieHandler(browser.cookies()).build(), browser.cookies());
        assertThat(tree(get(secondClient, "/api/v1/auth/me")).path("id").asText()).isEqualTo(owner);
    }

    @Test
    void preferencesUseOwnerAndStrongRevisionAndRevocationAppliesToExistingSession() throws Exception {
        var browser = browser();
        String email = email();
        String owner = tree(register(browser, email, csrf(browser))).path("id").asText();
        assertThat(login(browser, email, PASSWORD, csrf(browser)).statusCode()).isEqualTo(200);
        var csrf = csrf(browser);
        var original = get(browser, "/api/v1/me/preferences");
        String etag = original.headers().firstValue("ETag").orElseThrow();
        assertProblem(json(browser, "PATCH", "/api/v1/me/preferences", Map.of("locale", "en"), csrf, null), 428, "PRECONDITION_REQUIRED");
        assertProblem(json(browser, "PATCH", "/api/v1/me/preferences", Map.of("locale", "en", "userId", UUID.randomUUID().toString()), csrf, etag), 400, "INVALID_REQUEST");
        var changed = json(browser, "PATCH", "/api/v1/me/preferences", Map.of("locale", "en"), csrf, etag);
        assertThat(changed.statusCode()).isEqualTo(200);
        assertThat(tree(changed).path("id").asText()).isEqualTo(tree(original).path("id").asText());
        assertThat(tree(changed).path("revision").asLong()).isEqualTo(tree(original).path("revision").asLong() + 1);
        assertProblem(json(browser, "PATCH", "/api/v1/me/preferences", Map.of("locale", "fr"), csrf, etag), 412, "REVISION_CONFLICT");
        jdbc.update("UPDATE user_roles SET revoked_at=current_timestamp,updated_at=current_timestamp WHERE user_id=? AND revoked_at IS NULL", UUID.fromString(owner));
        assertProblem(json(browser, "PATCH", "/api/v1/me/preferences", Map.of("locale", "fr"), csrf,
                changed.headers().firstValue("ETag").orElseThrow()), 403, "ACCESS_DENIED");
        assertThat(get(browser, "/api/v1/me/preferences").statusCode()).isEqualTo(200);
        assertThat(tree(get(browser, "/api/v1/auth/me")).path("permissions").isEmpty()).isTrue();
    }

    @Test
    void disabledAndExpiredSessionsLoseAccessWithoutAnotherLogin() throws Exception {
        var disabled = browser();
        String firstEmail = email();
        String owner = tree(register(disabled, firstEmail, csrf(disabled))).path("id").asText();
        assertThat(login(disabled, firstEmail, PASSWORD, csrf(disabled)).statusCode()).isEqualTo(200);
        jdbc.update("UPDATE user_accounts SET status='DISABLED',updated_at=greatest(created_at,current_timestamp) WHERE id=?", UUID.fromString(owner));
        assertProblem(get(disabled, "/api/v1/auth/me"), 401, "AUTHENTICATION_REQUIRED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM spring_session WHERE principal_name=?", Integer.class, owner)).isZero();
        assertProblem(login(disabled, firstEmail, PASSWORD, csrf(disabled)), 401, "BAD_CREDENTIALS");

        var expired = browser();
        String secondEmail = email();
        String expiringOwner = tree(register(expired, secondEmail, csrf(expired))).path("id").asText();
        assertThat(login(expired, secondEmail, PASSWORD, csrf(expired)).statusCode()).isEqualTo(200);
        jdbc.update("UPDATE spring_session SET last_access_time=?,max_inactive_interval=1,expiry_time=? WHERE principal_name=?",
                System.currentTimeMillis() - 60_000, System.currentTimeMillis() - 59_000, expiringOwner);
        assertProblem(get(expired, "/api/v1/auth/me"), 401, "AUTHENTICATION_REQUIRED");
    }

    @Test
    void logoutInvalidatesJdbcSessionCookieAndCsrf() throws Exception {
        var browser = browser();
        String email = email();
        String owner = tree(register(browser, email, csrf(browser))).path("id").asText();
        assertThat(login(browser, email, PASSWORD, csrf(browser)).statusCode()).isEqualTo(200);
        var csrf = csrf(browser);
        assertProblem(json(browser, "POST", "/api/v1/auth/logout", null, null, null), 403, "CSRF_INVALID");
        var response = json(browser, "POST", "/api/v1/auth/logout", null, csrf, null);
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.headers().allValues("Set-Cookie").stream().anyMatch(value -> value.startsWith("SESSION=") && value.contains("Max-Age=0")))
                .as("logout expires the actual session cookie").isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM spring_session WHERE principal_name=?", Integer.class, owner)).isZero();
        assertProblem(get(browser, "/api/v1/auth/me"), 401, "AUTHENTICATION_REQUIRED");
        assertProblem(login(browser, email, PASSWORD, csrf), 403, "CSRF_INVALID");
        assertThat(login(browser, email, PASSWORD, csrf(browser)).statusCode()).isEqualTo(200);
    }

    @Test
    void recoveryUsesTrustedOriginAndHasOneAtomicWinnerAndRevokesOldSessions() throws Exception {
        var existing = browser();
        String email = email();
        String owner = tree(register(existing, email, csrf(existing))).path("id").asText();
        assertThat(login(existing, email, PASSWORD, csrf(existing)).statusCode()).isEqualTo(200);
        var resetter = browser();
        var csrf = csrf(resetter);
        // A raw local HTTP request lets this exercise Host itself, which the JDK client reserves.
        int knownStatus = forgedHostResetRequest(resetter, email, csrf);
        var unknown = json(resetter, "POST", "/api/v1/auth/password-reset-requests", Map.of("email", email(), "locale", "en"), csrf, null);
        assertThat(knownStatus).isEqualTo(202);
        assertThat(unknown.statusCode()).isEqualTo(knownStatus);
        assertThat(unknown.body()).isEmpty();
        String token = awaitResetToken(email, "en");
        assertThat(jdbc.queryForObject("SELECT token_hash FROM password_reset_tokens WHERE user_id=?", String.class, UUID.fromString(owner)).equals(token))
                .as("only token digest is stored").isFalse();
        var first = browser();
        var second = browser();
        var firstCsrf = csrf(first);
        var secondCsrf = csrf(second);
        List<HttpResponse<String>> results;
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> json(first, "POST", "/api/v1/auth/password-resets", Map.of("token", token, "newPassword", NEW_PASSWORD), firstCsrf, null));
            var b = executor.submit(() -> json(second, "POST", "/api/v1/auth/password-resets", Map.of("token", token, "newPassword", NEW_PASSWORD), secondCsrf, null));
            results = List.of(a.get(), b.get());
        }
        assertThat(results.stream().map(HttpResponse::statusCode).sorted().toList()).containsExactly(204, 400);
        assertProblem(results.stream().filter(result -> result.statusCode() == 400).findFirst().orElseThrow(), 400, "INVALID_RESET_TOKEN");
        assertThat(jdbc.queryForObject("SELECT authentication_version FROM user_accounts WHERE id=?", Long.class, UUID.fromString(owner))).isEqualTo(1);
        assertProblem(get(existing, "/api/v1/auth/me"), 401, "AUTHENTICATION_REQUIRED");
        assertProblem(login(existing, email, PASSWORD, csrf(existing)), 401, "BAD_CREDENTIALS");
        assertThat(login(existing, email, NEW_PASSWORD, csrf(existing)).statusCode()).isEqualTo(200);
        assertProblem(json(first, "POST", "/api/v1/auth/password-resets", Map.of("token", token, "newPassword", PASSWORD), csrf(first), null), 400, "INVALID_RESET_TOKEN");
    }

    @Test
    void expiredRecoveryIsRejectedAndForwardedProtoCannotOverrideLocalCookiePolicy() throws Exception {
        var browser = browser();
        var cookieResponse = browser.http().send(HttpRequest.newBuilder(uri("/api/v1/auth/csrf"))
                .header("X-Forwarded-Proto", "https").GET().build(), HttpResponse.BodyHandlers.ofString());
        var cookie = cookieResponse.headers().firstValue("Set-Cookie").orElseThrow();
        assertThat(cookie).contains("Path=/", "HttpOnly", "SameSite=Lax");
        assertThat(cookie.contains("Secure")).as("explicit HTTP-local policy ignores untrusted forwarded scheme").isFalse();
        String email = email();
        String owner = tree(register(browser, email, csrf(browser))).path("id").asText();
        assertThat(json(browser, "POST", "/api/v1/auth/password-reset-requests", Map.of("email", email, "locale", "fr"), csrf(browser), null).statusCode()).isEqualTo(202);
        String token = awaitResetToken(email, "fr");
        jdbc.update("UPDATE password_reset_tokens SET expires_at=created_at + interval '1 microsecond' WHERE user_id=?", UUID.fromString(owner));
        assertProblem(json(browser, "POST", "/api/v1/auth/password-resets", Map.of("token", token, "newPassword", NEW_PASSWORD), csrf(browser), null), 400, "INVALID_RESET_TOKEN");
        assertThat(jdbc.queryForObject("SELECT authentication_version FROM user_accounts WHERE id=?", Long.class, UUID.fromString(owner))).isZero();
    }

    private String awaitResetToken(String recipient, String locale) throws Exception {
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        var base = "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025);
        long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
        do {
            var listing = http.send(HttpRequest.newBuilder(URI.create(base + "/api/v1/messages")).GET().build(), HttpResponse.BodyHandlers.ofString());
            for (var message : mapper.readTree(listing.body()).path("messages")) {
                String expectedSubject="en".equals(locale)?"Reset your ChatGPT Courses password":"Réinitialiser votre mot de passe ChatGPT Courses";
                if(!expectedSubject.equals(message.path("Subject").asText()))continue;
                boolean toRecipient = false;
                for (var to : message.path("To")) if (recipient.equals(to.path("Address").asText())) toRecipient = true;
                if (!toRecipient) continue;
                var detail = http.send(HttpRequest.newBuilder(URI.create(base + "/api/v1/message/" + message.path("ID").asText())).GET().build(), HttpResponse.BodyHandlers.ofString());
                String text = mapper.readTree(detail.body()).path("Text").asText();
                var match = Pattern.compile("http://localhost:3000/" + ("en".equals(locale) ? "en/reset-password" : "fr/reinitialisation") + "#token=([A-Za-z0-9_-]{43})").matcher(text);
                assertThat(match.find()).as("SMTP message uses configured public origin and fragment token").isTrue();
                assertThat(text.contains("attacker.invalid")).as("untrusted host excluded from recovery URL").isFalse();
                return match.group(1);
            }
            Thread.sleep(100);
        } while (System.nanoTime() < deadline);
        throw new AssertionError("Expected local SMTP recovery message was not delivered");
    }

    private int forgedHostResetRequest(Browser browser, String email, Csrf csrf) throws Exception {
        byte[] body = mapper.writeValueAsBytes(Map.of("email", email, "locale", "en"));
        try (var socket = new Socket("127.0.0.1", port)) {
            socket.setSoTimeout(10_000);
            String headers = "POST /api/v1/auth/password-reset-requests HTTP/1.1\r\n"
                    + "Host: attacker.invalid\r\nX-Forwarded-Host: attacker.invalid\r\nX-Forwarded-Proto: https\r\n"
                    + "Content-Type: application/json\r\nContent-Length: " + body.length + "\r\n"
                    + "Cookie: SESSION=" + sessionCookie(browser) + "\r\n" + csrf.headerName() + ": " + csrf.token()
                    + "\r\nConnection: close\r\n\r\n";
            socket.getOutputStream().write(headers.getBytes(StandardCharsets.ISO_8859_1));
            socket.getOutputStream().write(body);
            socket.getOutputStream().flush();
            String response = new String(socket.getInputStream().readAllBytes(), StandardCharsets.ISO_8859_1);
            int boundary = response.indexOf("\r\n\r\n");
            assertThat(boundary > 0).as("well-formed local HTTP response").isTrue();
            String payload = response.substring(boundary + 4);
            boolean chunked = response.substring(0, boundary).toLowerCase(java.util.Locale.ROOT).contains("transfer-encoding: chunked");
            assertThat(chunked ? payload.equals("0\r\n\r\n") : payload.isEmpty()).as("neutral recovery response has no body").isTrue();
            return Integer.parseInt(response.substring(0, response.indexOf("\r\n")).split(" ")[1]);
        }
    }

    private HttpResponse<String> register(Browser browser, String email, Csrf csrf) throws Exception {
        return json(browser, "POST", "/api/v1/auth/register", Map.of("email", email, "password", PASSWORD, "displayName", "P04 isolated fixture", "locale", "fr"), csrf, null);
    }
    private HttpResponse<String> login(Browser browser, String email, String password, Csrf csrf) throws Exception {
        var request = HttpRequest.newBuilder(uri("/api/v1/auth/login")).timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString("email=" + encode(email) + "&password=" + encode(password)));
        if (csrf != null) request.header(csrf.headerName(), csrf.token());
        return browser.http().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> json(Browser browser, String method, String path, Object body, Csrf csrf, String etag) throws Exception {
        var request = HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        if (csrf != null) request.header(csrf.headerName(), csrf.token());
        if (etag != null) request.header("If-Match", etag);
        return browser.http().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> get(Browser browser, String path) throws Exception {
        return browser.http().send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(8)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    private Csrf csrf(Browser browser) throws Exception {
        var response = get(browser, "/api/v1/auth/csrf");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).hasValueSatisfying(value -> assertThat(value).contains("no-store"));
        var token = tree(response);
        assertThat(token.path("headerName").asText()).isEqualTo("X-CSRF-TOKEN");
        assertThat(token.path("parameterName").asText()).isEqualTo("_csrf");
        assertThat(token.path("token").asText().isBlank()).isFalse();
        return new Csrf(token.path("token").asText(), token.path("headerName").asText());
    }
    private void assertProblem(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(value -> assertThat(value).startsWith("application/problem+json"));
        assertThat(response.headers().firstValue("Cache-Control")).hasValueSatisfying(value -> assertThat(value).contains("no-store"));
        var body = tree(response);
        assertThat(body.path("type").asText()).isEqualTo("about:blank");
        assertThat(body.path("status").asInt()).isEqualTo(status);
        assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(body.path("traceId").asText()).matches("[0-9a-f-]{36}");
        assertThat(response.body().contains(PASSWORD) || response.body().contains(NEW_PASSWORD)).as("errors exclude credential values").isFalse();
    }
    private JsonNode tree(HttpResponse<String> response) throws Exception { return mapper.readTree(response.body()); }
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static String email() { return "p04-" + UUID.randomUUID() + "@courses.invalid"; }
    private static Browser browser() {
        var cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        return new Browser(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).cookieHandler(cookies).followRedirects(HttpClient.Redirect.NEVER).build(), cookies);
    }
    private static String sessionCookie(Browser browser) {
        return browser.cookies().getCookieStore().getCookies().stream().filter(cookie -> cookie.getName().equals("SESSION")).findFirst().orElseThrow().getValue();
    }
    private record Browser(HttpClient http, CookieManager cookies) { }
    private record Csrf(String token, String headerName) {
        @Override public String toString() { return "Csrf[redacted]"; }
    }
}
