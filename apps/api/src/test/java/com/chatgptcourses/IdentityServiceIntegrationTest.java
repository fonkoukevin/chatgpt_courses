package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.chatgptcourses.identity.config.IdentityConfiguration;
import com.chatgptcourses.identity.security.IdentityUserDetails;
import com.chatgptcourses.identity.service.AccountProfile;
import com.chatgptcourses.identity.service.IdentityService;
import com.chatgptcourses.identity.validation.AccountPasswordValidator;
import com.chatgptcourses.notifications.PasswordResetNotifier;
import com.chatgptcourses.notifications.NotificationSender;
import com.chatgptcourses.notifications.NotificationTypes;
import com.chatgptcourses.shared.http.ApiError;
import com.chatgptcourses.shared.http.ApiException;
import com.chatgptcourses.shared.http.EntityTags;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "APP_ENV=test", "APP_PUBLIC_ORIGIN=http://localhost:3000", "SESSION_COOKIE_SECURE=false", "debug=false",
        "MAIL_MODE=local"
})
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class IdentityServiceIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("NOTIFICATION_OUTBOX_KEY", NotificationTestKeys::randomKey);
        registry.add("POSTGRES_HOST", POSTGRES::getHost);
        registry.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        registry.add("POSTGRES_DB", POSTGRES::getDatabaseName);
        registry.add("POSTGRES_USER", POSTGRES::getUsername);
        registry.add("POSTGRES_PASSWORD", POSTGRES::getPassword);
    }
    @Autowired IdentityService identity;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired MailCapture mail;
    @Autowired PlatformTransactionManager transactions;

    @Test
    void registrationPreservesAddressCharactersAndUnicodeAndNeverSerializesACredential() throws Exception {
        String email = "First.Last+suffix." + UUID.randomUUID() + "@EXAMPLE.TEST";
        String password = "🔐".repeat(12);
        var profile = identity.register("  " + email + "  ", password, "Service fixture", "en");
        assertThat(profile.email()).isEqualTo(email.toLowerCase(java.util.Locale.ROOT));
        assertThat(profile.roles()).containsExactly("LEARNER");
        assertThat(profile.permissions()).contains("identity.preferences.write");
        var credential = identity.findForAuthentication(email).orElseThrow();
        assertThat(credential.passwordHash()).startsWith("{" + IdentityConfiguration.PASSWORD_ENCODER_ID + "}");
        assertThat(encoder.matches(password, credential.passwordHash())).isTrue();
        var other = identity.register("salt." + UUID.randomUUID() + "@example.test", password, null, "fr");
        assertThat(identity.findForAuthentication(other.email()).orElseThrow().passwordHash()).isNotEqualTo(credential.passwordHash());
        expect(ApiError.EMAIL_ALREADY_REGISTERED, () -> identity.register(profile.email(), password, null, "fr"));
        assertThat(AccountPasswordValidator.isAcceptable("a".repeat(11))).isFalse();
        assertThat(AccountPasswordValidator.isAcceptable("a".repeat(12))).isTrue();
        assertThat(AccountPasswordValidator.isAcceptable("🔐".repeat(128))).isTrue();
        assertThat(AccountPasswordValidator.isAcceptable("🔐".repeat(129))).isFalse();
        var principal = IdentityUserDetails.fromCredentials(credential);
        assertThat(principal.getUsername()).isEqualTo(profile.id().toString());
        var bytes = new ByteArrayOutputStream();
        try (var stream = new ObjectOutputStream(bytes)) { stream.writeObject(principal); }
        assertThat(bytes.toString(StandardCharsets.ISO_8859_1)).doesNotContain(credential.passwordHash());
        try (var stream = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            assertThat(((IdentityUserDetails) stream.readObject()).getPassword()).isNull();
        }
        principal.eraseCredentials();
        assertThat(principal.getPassword()).isNull();
        assertThat(encoder.matches("anything", "unversioned-unsupported-hash")).isFalse();
    }

    @Test
    void preferencesUseTheActorAndRealRevisionAndRecheckRevokedPermissions() {
        var first = account();
        var second = account();
        var firstPreferences = identity.getPreferences(first.id());
        var secondPreferences = identity.getPreferences(second.id());
        expect(ApiError.PRECONDITION_REQUIRED, () -> identity.updatePreferences(first.id(), null, "en"));
        expect(ApiError.REVISION_CONFLICT, () -> identity.updatePreferences(first.id(),
                EntityTags.forRevision("preferences", secondPreferences.id(), secondPreferences.revision()), "en"));
        String tag = EntityTags.forRevision("preferences", firstPreferences.id(), firstPreferences.revision());
        var updated = identity.updatePreferences(first.id(), tag, "en");
        assertThat(updated.revision()).isEqualTo(firstPreferences.revision() + 1);
        expect(ApiError.REVISION_CONFLICT, () -> identity.updatePreferences(first.id(), tag, "fr"));
        assertThat(identity.getPreferences(first.id()).locale()).isEqualTo("en");
        assertThat(identity.getPreferences(second.id()).locale()).isEqualTo("fr");
        jdbc.update("UPDATE user_roles SET revoked_at = greatest(created_at,updated_at,CURRENT_TIMESTAMP), updated_at = greatest(created_at,updated_at,CURRENT_TIMESTAMP), revision = revision + 1 WHERE user_id = ? AND revoked_at IS NULL", first.id());
        assertThat(catchThrowable(() -> identity.updatePreferences(first.id(),
                EntityTags.forRevision("preferences", updated.id(), updated.revision()), "fr"))).isInstanceOf(AccessDeniedException.class);
        assertThat(identity.getPreferences(first.id()).locale()).isEqualTo("en");
    }

    @Test
    void simultaneousResetConsumesOnceChangesEpochAndRevokesSessionsWhileExpiredLinksFail() throws Exception {
        var profile = account();
        identity.requestPasswordReset(profile.email(), "fr");
        var token = mail.await(profile.email(), 1).getFirst().token();
        assertThat(token).hasSize(43);
        assertThat(jdbc.queryForObject("SELECT token_hash FROM password_reset_tokens WHERE user_id = ?", String.class, profile.id()))
                .hasSize(64).isNotEqualTo(token);
        var primaryId = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time,principal_name)
                VALUES (?,?,1,1,1800,9999999999999,?)
                """, primaryId, UUID.randomUUID().toString(), profile.id().toString());
        jdbc.update("INSERT INTO spring_session_attributes VALUES (?,'reset-fixture',decode('0102','hex'))", primaryId);
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        List<String> outcomes;
        try (var executor = Executors.newFixedThreadPool(2)) {
            var futures = List.of("First replacement 123", "Second replacement 456").stream().map(password -> executor.submit(() -> {
                ready.countDown();
                go.await();
                try { identity.resetPassword(token, password); return "SUCCESS"; }
                catch (ApiException failure) { return failure.error().name(); }
            })).toList();
            assertThat(ready.await(3, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            outcomes = List.of(futures.get(0).get(10, TimeUnit.SECONDS), futures.get(1).get(10, TimeUnit.SECONDS));
        }
        assertThat(outcomes).containsExactlyInAnyOrder("SUCCESS", "INVALID_RESET_TOKEN");
        assertThat(identity.loadSessionUser(profile.id()).orElseThrow().authenticationVersion()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM spring_session WHERE principal_name = ?", Integer.class, profile.id().toString())).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM spring_session_attributes WHERE session_primary_id = ?", Integer.class, primaryId)).isZero();
        expect(ApiError.INVALID_RESET_TOKEN, () -> identity.resetPassword(token, "Another replacement 789"));
        identity.requestPasswordReset(profile.email(), "en");
        var expired = mail.await(profile.email(), 2).get(1).token();
        jdbc.update("UPDATE password_reset_tokens SET expires_at = created_at + interval '1 microsecond' WHERE user_id = ? AND consumed_at IS NULL", profile.id());
        expect(ApiError.INVALID_RESET_TOKEN, () -> identity.resetPassword(expired, "Expired replacement 123"));
        assertThat(identity.loadSessionUser(profile.id()).orElseThrow().authenticationVersion()).isEqualTo(1);
    }

    @Test
    void resetRequestQuotaIsAtomicForKnownAndUnknownAccountsWithoutExposingAnAddress() throws Exception {
        var profile = account();
        try (var executor = Executors.newFixedThreadPool(6)) {
            var requests = java.util.stream.IntStream.range(0, 8).mapToObj(index -> executor.submit(
                    () -> identity.requestPasswordReset(profile.email(), "fr"))).toList();
            for (var request : requests) request.get(10, TimeUnit.SECONDS);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = ?", Integer.class, profile.id())).isEqualTo(3);
        assertThat(mail.await(profile.email(), 3)).hasSize(3);
        String unknown = "unknown." + UUID.randomUUID() + "@example.test";
        for (int index = 0; index < 8; index++) identity.requestPasswordReset(unknown, "en");
        assertThat(identity.findForAuthentication(unknown)).isEmpty();
        assertThat(mail.forEmail(unknown)).isEmpty();
        assertThat(jdbc.queryForList("SELECT bucket_key FROM identity_rate_limits", String.class)).allMatch(key -> key.matches("[0-9a-f]{64}"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM identity_rate_limits WHERE request_count = 8", Integer.class)).isGreaterThanOrEqualTo(2);
    }

    @Test
    void aResetLinkIssuedDuringACredentialChangeWaitsAndUsesTheCommittedEpoch() throws Exception {
        var profile = account();
        String changedHash = encoder.encode("Concurrent credential 123");
        // Closing the locker before the executor also releases its lock if an assertion fails.
        try (var executor = Executors.newSingleThreadExecutor();
             var locker = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            locker.setAutoCommit(false);
            try (var statement = locker.prepareStatement("UPDATE user_accounts SET password_hash=?,revision=revision+1,updated_at=greatest(created_at,CURRENT_TIMESTAMP) WHERE id=?")) {
                statement.setString(1, changedHash);
                statement.setObject(2, profile.id());
                statement.executeUpdate();
            }
            var started = new CountDownLatch(1);
            var request = executor.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(transaction -> {
                jdbc.execute("SET LOCAL application_name='p04-reset-issue-race'");
                started.countDown();
                identity.requestPasswordReset(profile.email(), "fr");
            }));
            assertThat(started.await(3, TimeUnit.SECONDS)).isTrue();
            long deadline = System.nanoTime() + Duration.ofSeconds(3).toNanos();
            boolean waiting;
            do {
                waiting = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name='p04-reset-issue-race' AND wait_event_type='Lock')", Boolean.class));
                if (!waiting) Thread.sleep(20);
            } while (!waiting && System.nanoTime() < deadline);
            assertThat(waiting).as("The reset request must actually wait for the concurrent account change").isTrue();
            locker.commit();
            request.get(10, TimeUnit.SECONDS);
        }
        var token = mail.await(profile.email(), 1).getFirst().token();
        assertThat(jdbc.queryForObject("SELECT authentication_version FROM password_reset_tokens WHERE user_id=?", Long.class, profile.id())).isEqualTo(1);
        identity.resetPassword(token, "After the race password 456");
        assertThat(identity.loadSessionUser(profile.id()).orElseThrow().authenticationVersion()).isEqualTo(2);
    }

    @Test
    void upgradingV002KeepsExistingAccountPreferencesAndSessionWithEpochZero() throws Exception {
        var configuration = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas("identity_upgrade").defaultSchema("identity_upgrade").target("2").locations("classpath:db/migration").cleanDisabled(true);
        configuration.load().migrate();
        UUID user = UUID.randomUUID();
        UUID missingPreferences = UUID.randomUUID();
        UUID preference = UUID.randomUUID();
        String session = UUID.randomUUID().toString();
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            connection.setSchema("identity_upgrade");
            var database = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            database.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES (?,?,'synthetic-legacy-hash','ACTIVE')", user, "legacy." + user + "@example.test");
            database.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES (?,?,'synthetic-legacy-hash','ACTIVE')", missingPreferences, "legacy." + missingPreferences + "@example.test");
            database.update("INSERT INTO user_preferences(id,user_id,locale,time_zone,revision) VALUES (?,?,'en','UTC',7)", preference, user);
            database.update("INSERT INTO spring_session VALUES (?,?,1,1,1800,9999999999999,?)", session, UUID.randomUUID().toString(), user.toString());
        }
        configuration.target("latest").load().migrate();
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            connection.setSchema("identity_upgrade");
            var database = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
            assertThat(database.queryForObject("SELECT authentication_version FROM user_accounts WHERE id = ?", Long.class, user)).isZero();
            assertThat(database.queryForObject("SELECT password_hash FROM user_accounts WHERE id = ?", String.class, user)).isEqualTo("synthetic-legacy-hash");
            assertThat(database.queryForObject("SELECT revision FROM user_preferences WHERE id = ?", Long.class, preference)).isEqualTo(7);
            assertThat(database.queryForObject("SELECT locale FROM user_preferences WHERE id = ?", String.class, preference)).isEqualTo("en");
            assertThat(database.queryForObject("SELECT COUNT(*) FROM spring_session WHERE primary_id = ?", Integer.class, session)).isEqualTo(1);
            assertThat(database.queryForObject("SELECT locale FROM user_preferences WHERE user_id = ?", String.class, missingPreferences)).isEqualTo("fr");
            assertThat(database.queryForObject("SELECT COUNT(*) FROM user_roles", Integer.class)).isZero();
        }
    }

    private AccountProfile account() { return identity.register("service." + UUID.randomUUID() + "@example.test", "Initial password 123", null, "fr"); }
    private static void expect(ApiError error, Runnable action) {
        var failure = catchThrowable(action::run);
        assertThat(failure).isInstanceOf(ApiException.class);
        assertThat(((ApiException) failure).error()).isEqualTo(error);
    }
    record CapturedMail(String email, String token) {
        @Override public String toString() { return "CapturedMail[redacted]"; }
    }
    static final class MailCapture implements PasswordResetNotifier {
        private final List<CapturedMail> messages = new CopyOnWriteArrayList<>();
        @Override public void send(String email, String locale, String token, Instant expiresAt) { messages.add(new CapturedMail(email, token)); }
        List<CapturedMail> forEmail(String email) { return messages.stream().filter(message -> message.email().equals(email)).toList(); }
        List<CapturedMail> await(String email, int count) throws InterruptedException {
            long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
            while (forEmail(email).size() < count && System.nanoTime() < deadline) Thread.sleep(20);
            var captured = forEmail(email);
            assertThat(captured.size()).as("Expected notification count, without printing its contents").isEqualTo(count);
            return captured;
        }
    }
    @TestConfiguration
    static class TestMailConfiguration {
        @Bean @Primary MailCapture capturedPasswordResetMail() { return new MailCapture(); }
        // This identity-domain suite exercises the durable worker with a delivery double.
        // Real SMTP transport is covered by NotificationOutboxIntegrationTest, never shared Mailpit.
        @Bean @Primary NotificationSender isolatedNotificationDelivery(MailCapture capture) {
            return (id, type, payload) -> {
                if (type == NotificationTypes.Type.PASSWORD_RESET) {
                    capture.send(payload.recipient(), payload.locale(), payload.token(), payload.tokenExpiresAt());
                }
            };
        }
    }
}
