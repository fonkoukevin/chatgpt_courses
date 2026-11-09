package com.chatgptcourses;

import static org.assertj.core.api.Assertions.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.sql.DriverManager;
import java.util.Map;
import java.util.UUID;
import com.chatgptcourses.operations.SchemaMigrationMain;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
        "APP_ENV=staging", "APP_PUBLIC_ORIGIN=https://staging.courses.invalid", "SESSION_COOKIE_SECURE=true",
        "spring.profiles.active=staging",
        "MAIL_MODE=disabled", "STRIPE_ENABLED=false", "STORAGE_ENABLED=false", "NOTIFICATION_OUTBOX_ENABLED=false",
        "PAYMENT_INBOX_ENABLED=false", "REFUND_WORKER_ENABLED=false", "spring.flyway.enabled=false", "debug=false"
})
@ActiveProfiles("staging") @Testcontainers @DirtiesContext(classMode=DirtiesContext.ClassMode.AFTER_CLASS)
class StagingHttpIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        String role = "staging_app", password = UUID.randomUUID().toString();
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()); var statement = connection.createStatement()) {
            statement.execute("CREATE ROLE " + role + " LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
            SchemaMigrationMain.migrate(Map.of("APP_ENV","staging","POSTGRES_HOST",POSTGRES.getHost(),"POSTGRES_PORT",POSTGRES.getMappedPort(5432).toString(),"POSTGRES_DB",POSTGRES.getDatabaseName(),"POSTGRES_USER",POSTGRES.getUsername(),"POSTGRES_PASSWORD",POSTGRES.getPassword(),"POSTGRES_APP_ROLE",role));
        } catch (Exception unavailable) { throw new IllegalStateException("Isolated schema preparation failed"); }
        registry.add("POSTGRES_HOST", POSTGRES::getHost); registry.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        registry.add("POSTGRES_DB", POSTGRES::getDatabaseName); registry.add("POSTGRES_USER", () -> role);
        registry.add("POSTGRES_PASSWORD", () -> password); registry.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);
    }
    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    @Test void stagingStartsWithOnlyHibernateValidationAfterSeparateMigrationAndHealthHasNoDetails() throws Exception {
        var response = get("/api/v1/system/health");
        assertThat(response.statusCode()).isEqualTo(200); assertThat(response.body()).isEqualTo("{\"status\":\"UP\"}");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(response.headers().firstValue("Cache-Control")).hasValueSatisfying(value -> assertThat(value).contains("no-store"));
    }
    @Test void stagingCsrfStillCreatesASecureHttpOnlyLaxRootSessionCookie() throws Exception {
        var response = get("/api/v1/auth/csrf"); assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().allValues("Set-Cookie")).anySatisfy(value -> assertThat(value).contains("SESSION=", "Path=/", "Secure", "HttpOnly", "SameSite=Lax"));
        var denied = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/auth/logout"))
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(denied.statusCode()).isEqualTo(403);
    }
    private HttpResponse<String> get(String path) throws Exception { return http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString()); }
}
