package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "debug=false"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FoundationIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42")
            .asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void postgresProperties(DynamicPropertyRegistry registry) {
        registry.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);
        registry.add("POSTGRES_HOST", POSTGRES::getHost);
        registry.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        registry.add("POSTGRES_DB", POSTGRES::getDatabaseName);
        registry.add("POSTGRES_USER", POSTGRES::getUsername);
        registry.add("POSTGRES_PASSWORD", POSTGRES::getPassword);
    }

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired SessionRepository<? extends Session> sessions;
    @Autowired ObjectMapper mapper;

    @Test
    @Order(1)
    void healthUsesRealHttpAndPostgresWithoutCreatingAnAnonymousSession() throws Exception {
        var response = get("/api/v1/system/health");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(response.body()).get("status").asText()).isEqualTo("UP");
        assertThat(mapper.readTree(response.body()).size()).isEqualTo(1);
        assertThat(response.headers().firstValue("Cache-Control")).hasValueSatisfying(
                value -> assertThat(value).contains("no-store"));
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success AND version = '001'", Integer.class))
                .isEqualTo(1);
    }

    @Test
    @Order(2)
    void sessionsArePersistedInMigratedPostgresAndDeletingTheSessionCascades() {
        verifySessionPersistence(sessions);
    }

    private <S extends Session> void verifySessionPersistence(SessionRepository<S> repository) {
        S session = repository.createSession();
        session.setAttribute("foundation-check", "saved-in-postgres");
        repository.save(session);
        try {
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM spring_session WHERE session_id = ?",
                    Integer.class, session.getId())).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM spring_session_attributes", Integer.class))
                    .isEqualTo(1);
            S persisted = repository.findById(session.getId());
            assertThat(persisted).isNotNull();
            assertThat(persisted.<String>getAttribute("foundation-check")).isEqualTo("saved-in-postgres");
        } finally {
            repository.deleteById(session.getId());
        }
        assertThat(repository.findById(session.getId())).isNull();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM spring_session_attributes", Integer.class)).isZero();
    }

    @Test
    @Order(3)
    void anUnknownPublicSystemRouteIsARealSanitized404() throws Exception {
        var response = get("/api/v1/system/not-found");
        assertProblem(response, 404, "RESOURCE_NOT_FOUND");
    }

    @Test
    @Order(4)
    void privateRoutesAreDeniedAndCsrfStillProtectsMutations() throws Exception {
        assertProblem(get("/api/v1/me"), 401, "AUTHENTICATION_REQUIRED");
        var response = http.send(HttpRequest.newBuilder(uri("/api/v1/system/health"))
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertProblem(response, 403, "CSRF_INVALID");
    }

    @Test
    @Order(5)
    void databaseFailureReturns503ThenRecoversAfterContainerResumes() throws Exception {
        var docker = DockerClientFactory.instance().client();
        // La pause garde le port éphémère : Docker Desktop le réattribue sur stop/start.
        docker.pauseContainerCmd(POSTGRES.getContainerId()).exec();
        try {
            assertProblem(get("/api/v1/system/health"), 503, "SERVICE_UNAVAILABLE");
        } finally {
            docker.unpauseContainerCmd(POSTGRES.getContainerId()).exec();
        }
        var deadline = System.nanoTime() + Duration.ofSeconds(25).toNanos();
        HttpResponse<String> response;
        do {
            response = get("/api/v1/system/health");
            if (response.statusCode() == 200) break;
            Thread.sleep(200);
        } while (System.nanoTime() < deadline);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success AND version = '001'", Integer.class))
                .isEqualTo(1);
    }

    private void assertProblem(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(
                value -> assertThat(value).startsWith("application/problem+json"));
        var body = mapper.readTree(response.body());
        assertThat(body.get("status").asInt()).isEqualTo(status);
        assertThat(body.get("code").asText()).isEqualTo(code);
        assertThat(body.get("traceId").asText()).isNotBlank();
        assertThat(response.body()).doesNotContain("stack", "exception", "jdbc:", "password", "org.postgresql");
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(uri(path)).timeout(Duration.ofSeconds(8)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
