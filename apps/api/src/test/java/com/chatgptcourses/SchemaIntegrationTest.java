package com.chatgptcourses;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.chatgptcourses.identity.model.UserAccount;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.OptimisticLockException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
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
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SchemaIntegrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42")
            .asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("POSTGRES_HOST", POSTGRES::getHost);
        registry.add("POSTGRES_PORT", () -> POSTGRES.getMappedPort(5432));
        registry.add("POSTGRES_DB", POSTGRES::getDatabaseName);
        registry.add("POSTGRES_USER", POSTGRES::getUsername);
        registry.add("POSTGRES_PASSWORD", POSTGRES::getPassword);
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired EntityManagerFactory entityManagers;
    @Autowired ObjectMapper mapper;

    @Test @Order(1)
    void aFreshDatabaseMigratesAndHibernateValidatesWithoutSeedingAccountsOrCommerce() {
        assertThat(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE type = 'SQL' AND success ORDER BY installed_rank", String.class)).containsExactly("001", "002", "003", "004", "005", "006", "007");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_accounts", Integer.class)).isZero();
        assertThat(jdbc.queryForList("SELECT code FROM roles ORDER BY code", String.class)).containsExactly("EDITOR", "LEARNER");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_roles", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_resources", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT current_setting('TimeZone')", String.class)).isEqualTo("UTC");
        assertThat(jdbc.queryForList("""
                SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
                AND table_name IN ('orders', 'payments', 'access_grants', 'projects')
                """, String.class)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM personal_methods", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_enrollments", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_activity_notes", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_quiz_attempts", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
                WHERE c.contype = 'f' AND t.relnamespace = 'public'::regnamespace
                AND t.relname <> 'spring_session_attributes' AND c.confdeltype <> 'r'
                """, Integer.class)).isZero();
    }

    @Test @Order(2)
    void upgradingV001PreservesItsExistingJdbcSessionAndAttribute() throws Exception {
        migrate("upgrade_v001", "1");
        var primaryId = UUID.randomUUID().toString();
        var sessionId = UUID.randomUUID().toString();
        try (var connection = connection("upgrade_v001")) {
            var database = new JdbcTemplate(new SingleConnectionDataSourceAdapter(connection));
            database.update("""
                    INSERT INTO spring_session(primary_id, session_id, creation_time, last_access_time,
                    max_inactive_interval, expiry_time) VALUES (?, ?, 1, 2, 1800, 1800002)
                    """, primaryId, sessionId);
            database.update("INSERT INTO spring_session_attributes VALUES (?, 'upgrade-marker', decode('010203', 'hex'))", primaryId);
        }
        var migrated = migrate("upgrade_v001", null);
        assertThat(migrated.validateWithResult().validationSuccessful).isTrue();
        try (var connection = connection("upgrade_v001")) {
            var database = new JdbcTemplate(new SingleConnectionDataSourceAdapter(connection));
            assertThat(database.queryForObject("SELECT session_id FROM spring_session WHERE primary_id = ?", String.class, primaryId)).isEqualTo(sessionId);
            assertThat(database.queryForObject("SELECT encode(attribute_bytes, 'hex') FROM spring_session_attributes WHERE session_primary_id = ?", String.class, primaryId)).isEqualTo("010203");
            assertThat(database.queryForList("SELECT version FROM flyway_schema_history WHERE type = 'SQL' AND success ORDER BY installed_rank", String.class)).containsExactly("001", "002", "003", "004", "005", "006", "007");
        }
    }

    @Test @Order(3)
    void identityConstraintsPreserveUtcAndRevokedPermissionOrigins() {
        var user = UUID.randomUUID();
        var email = "schema." + user + "@example.test";
        jdbc.update("""
                INSERT INTO user_accounts(id, normalized_email, password_hash, status, created_at, updated_at)
                VALUES (?, ?, 'synthetic-test-hash', 'ACTIVE', '2026-11-08 03:00:00+03', '2026-11-08 00:00:00Z')
                """, user, email);
        assertThat(jdbc.queryForObject("SELECT created_at FROM user_accounts WHERE id = ?", java.sql.Timestamp.class, user).toInstant())
                .isEqualTo(Instant.parse("2026-11-08T00:00:00Z"));
        expectState("23505", () -> insertUser(UUID.randomUUID(), email));
        expectState("23514", () -> insertUser(UUID.randomUUID(), email.toUpperCase(java.util.Locale.ROOT)));
        expectState("23514", () -> jdbc.update("UPDATE user_accounts SET updated_at = created_at - interval '1 second' WHERE id = ?", user));
        expectState("23514", () -> jdbc.update("UPDATE user_accounts SET revision = 9007199254740992 WHERE id = ?", user));
        expectState("23514", () -> jdbc.update("UPDATE user_accounts SET created_at = 'infinity'::timestamptz WHERE id = ?", user));
        expectState("23503", () -> jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES (?,?,'fr','UTC')", UUID.randomUUID(), UUID.randomUUID()));
        expectState("23514", () -> jdbc.update("INSERT INTO user_preferences(id,user_id,locale,time_zone) VALUES (?,?,'de','UTC')", UUID.randomUUID(), user));

        var role = UUID.randomUUID();
        var permission = UUID.randomUUID();
        jdbc.update("INSERT INTO roles(id,code) VALUES (?,?)", role, "SCHEMA_" + UUID.randomUUID().toString().replace("-", "").toUpperCase(java.util.Locale.ROOT));
        jdbc.update("INSERT INTO permissions(id,code) VALUES (?,?)", permission, "schema." + UUID.randomUUID());
        var grant = UUID.randomUUID();
        jdbc.update("INSERT INTO user_roles(id,user_id,role_id) VALUES (?,?,?)", grant, user, role);
        expectState("23505", () -> jdbc.update("INSERT INTO user_roles(id,user_id,role_id) VALUES (?,?,?)", UUID.randomUUID(), user, role));
        jdbc.update("UPDATE user_roles SET revoked_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", grant);
        jdbc.update("INSERT INTO user_roles(id,user_id,role_id) VALUES (?,?,?)", UUID.randomUUID(), user, role);
        expectState("23514", () -> jdbc.update("UPDATE user_roles SET revoked_at = NULL WHERE id = ?", grant));
        expectState("23514", () -> jdbc.update("DELETE FROM user_roles WHERE id = ?", grant));
        // PostgreSQL 18 distinguishes an explicit RESTRICT deletion from a missing FK target.
        expectState("23001", () -> jdbc.update("DELETE FROM user_accounts WHERE id = ?", user));
        var roleGrant = UUID.randomUUID();
        jdbc.update("INSERT INTO role_permissions(id,role_id,permission_id) VALUES (?,?,?)", roleGrant, role, permission);
        expectState("23505", () -> jdbc.update("INSERT INTO role_permissions(id,role_id,permission_id) VALUES (?,?,?)", UUID.randomUUID(), role, permission));
        expectState("23514", () -> jdbc.update("DELETE FROM role_permissions WHERE id = ?", roleGrant));
    }

    @Test @Order(4)
    void localizedSlugsAndRevisionPointersCannotCrossTheirIdentityOrLanguage() {
        var course = resource("COURSE");
        var anotherCourse = resource("COURSE");
        var module = resource("MODULE");
        var slug = "shared-" + UUID.randomUUID();
        insertSlug(course, "COURSE", "fr", slug);
        insertSlug(course, "COURSE", "en", slug);
        insertSlug(module, "MODULE", "fr", slug);
        expectState("23505", () -> insertSlug(anotherCourse, "COURSE", "fr", slug));
        expectState("23503", () -> insertSlug(anotherCourse, "ACTIVITY", "en", slug));
        var version = version(course, 1);
        var fr = translation(version, "fr");
        var en = translation(version, "en");
        expectState("23505", () -> translation(version, "fr"));
        var frRevision = editorialRevision(fr, 1, "First French snapshot");
        var enRevision = editorialRevision(en, 1, "First English snapshot");
        expectState("23503", () -> jdbc.update("UPDATE content_translations SET current_revision_id = ? WHERE id = ?", enRevision, fr));
        expectState("23514", () -> jdbc.update("UPDATE content_translations SET published_revision_id = ? WHERE id = ?", frRevision, fr));
        freeze(version);
        expectState("23503", () -> jdbc.update("UPDATE content_translations SET published_revision_id = ? WHERE id = ?", enRevision, fr));
        jdbc.update("UPDATE content_translations SET current_revision_id = ?, published_revision_id = ?, editorial_state = 'PUBLISHED' WHERE id = ?", frRevision, frRevision, fr);
        var correctedRevision = editorialRevision(fr, 2, "Minor editorial correction");
        jdbc.update("UPDATE content_translations SET current_revision_id = ?, editorial_state = 'DRAFT', revision = revision + 1 WHERE id = ?", correctedRevision, fr);
        assertThat(jdbc.queryForObject("SELECT published_revision_id FROM content_translations WHERE id = ?", UUID.class, fr)).isEqualTo(frRevision);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM editorial_revisions WHERE translation_id = ?", Integer.class, fr)).isEqualTo(2);
        expectState("23514", () -> jdbc.update("UPDATE editorial_revisions SET title = 'rewritten' WHERE id = ?", frRevision));
        expectState("23514", () -> jdbc.update("DELETE FROM editorial_revisions WHERE id = ?", frRevision));
        expectState("23001", () -> jdbc.update("DELETE FROM content_translations WHERE id = ?", fr));
        var newPedagogy = version(course, 2);
        expectState("23514", () -> jdbc.update("UPDATE content_translations SET pedagogical_version_id = ? WHERE id = ?", newPedagogy, fr));
        assertThat(jdbc.queryForObject("SELECT resource_id FROM pedagogical_versions WHERE id = ?", UUID.class, newPedagogy)).isEqualTo(course);
    }

    @Test @Order(5)
    void compositionAndPedagogyAreImmutableAfterBottomUpFreeze() {
        var course = version(resource("COURSE"), 1);
        var module = version(resource("MODULE"), 1);
        var activity = version(resource("ACTIVITY"), 1);
        var composition = composition(module, activity, 1);
        composition(course, module, 1);
        expectState("23514", () -> composition(course, activity, 2));
        var secondModule = version(resource("MODULE"), 1);
        expectState("23505", () -> composition(course, secondModule, 1));
        expectState("23514", () -> freeze(module));
        freeze(activity);
        expectState("23514", () -> freeze(course));
        freeze(module);
        freeze(course);
        freeze(secondModule);
        expectState("23514", () -> composition(course, secondModule, 2));
        expectState("23514", () -> jdbc.update("UPDATE version_compositions SET position = 2 WHERE id = ?", composition));
        expectState("23514", () -> jdbc.update("DELETE FROM version_compositions WHERE id = ?", composition));
        expectState("23514", () -> jdbc.update("UPDATE pedagogical_versions SET frozen_at = NULL WHERE id = ?", course));
        expectState("23514", () -> jdbc.update("UPDATE pedagogical_versions SET objectives = 'changed' WHERE id = ?", course));
        expectState("23514", () -> jdbc.update("DELETE FROM pedagogical_versions WHERE id = ?", course));
    }

    @Test @Order(6)
    void independentJpaTransactionsRejectAStaleRevisionAndNeverSerializeTheCredentialHash() throws Exception {
        UUID id;
        try (var setup = entityManagers.createEntityManager()) {
            setup.getTransaction().begin();
            var user = new UserAccount("optimistic." + UUID.randomUUID() + "@example.test", "synthetic-test-hash", "Initial");
            setup.persist(user);
            setup.getTransaction().commit();
            id = user.getId();
            assertThat(mapper.writeValueAsString(user)).doesNotContain("passwordHash", "password_hash", "synthetic-test-hash");
        }
        try (var first = entityManagers.createEntityManager(); var second = entityManagers.createEntityManager()) {
            first.getTransaction().begin();
            second.getTransaction().begin();
            var firstCopy = first.find(UserAccount.class, id);
            var staleCopy = second.find(UserAccount.class, id);
            firstCopy.changeDisplayName("Confirmed winner");
            first.getTransaction().commit();
            staleCopy.changeDisplayName("Stale loser");
            var failure = catchThrowable(() -> second.getTransaction().commit());
            assertThat(failure).isNotNull();
            boolean optimistic = false;
            for (var cause = failure; cause != null; cause = cause.getCause()) {
                optimistic |= cause instanceof OptimisticLockException;
            }
            assertThat(optimistic).as("The stale transaction must fail on the real JPA revision comparison").isTrue();
            if (second.getTransaction().isActive()) second.getTransaction().rollback();
        }
        assertThat(jdbc.queryForObject("SELECT display_name FROM user_accounts WHERE id = ?", String.class, id)).isEqualTo("Confirmed winner");
        assertThat(jdbc.queryForObject("SELECT revision FROM user_accounts WHERE id = ?", Long.class, id)).isEqualTo(1);
    }

    @Test @Order(7)
    void explicitDemoImportIsRepeatableAfterManualChangesAndFreezeAndRejectsUuidCollisions() throws Exception {
        migrate("demo_fixture", null);
        var script = new ClassPathResource("devdata/p03-demo.sql").getContentAsString(StandardCharsets.UTF_8);
        try (var connection = connection("demo_fixture")) {
            var database = new JdbcTemplate(new SingleConnectionDataSourceAdapter(connection));
            connection.createStatement().execute(script);
            var manualRevision = UUID.randomUUID();
            database.update("""
                    INSERT INTO editorial_revisions(id,translation_id,revision_number,title,summary,body)
                    VALUES (?,'03400000-0000-4000-8000-000000000001',2,'Manual snapshot retained','','Fictional manual change')
                    """, manualRevision);
            database.update("UPDATE content_translations SET current_revision_id = ?, editorial_state = 'TO_REVIEW', revision = revision + 1 WHERE id = '03400000-0000-4000-8000-000000000001'", manualRevision);
            database.update("UPDATE resource_slugs SET slug = 'manual-slug-retained', revision = revision + 1 WHERE id = '03300000-0000-4000-8000-000000000001'");
            database.update("UPDATE pedagogical_versions SET objectives = 'Manual objectives retained', revision = revision + 1 WHERE id = '03100000-0000-4000-8000-000000000001'");
            for (int index : new int[] {3, 2, 1}) {
                database.update("UPDATE pedagogical_versions SET frozen_at = CURRENT_TIMESTAMP, revision = revision + 1 WHERE id = ?",
                        UUID.fromString("03100000-0000-4000-8000-00000000000" + index));
            }
            connection.createStatement().execute(script);
            assertThat(database.queryForObject("SELECT COUNT(*) FROM learning_resources", Integer.class)).isEqualTo(3);
            assertThat(database.queryForObject("SELECT COUNT(*) FROM editorial_revisions", Integer.class)).isEqualTo(7);
            assertThat(database.queryForObject("SELECT current_revision_id FROM content_translations WHERE id = '03400000-0000-4000-8000-000000000001'", UUID.class)).isEqualTo(manualRevision);
            assertThat(database.queryForObject("SELECT slug FROM resource_slugs WHERE id = '03300000-0000-4000-8000-000000000001'", String.class)).isEqualTo("manual-slug-retained");
            assertThat(database.queryForObject("SELECT objectives FROM pedagogical_versions WHERE id = '03100000-0000-4000-8000-000000000001'", String.class)).isEqualTo("Manual objectives retained");
            assertThat(database.queryForObject("SELECT COUNT(*) FROM content_translations WHERE editorial_state = 'PUBLISHED'", Integer.class)).isZero();
            assertThat(database.queryForObject("SELECT COUNT(*) FROM user_accounts", Integer.class)).isZero();
        }
        migrate("demo_collision", null);
        try (var connection = connection("demo_collision")) {
            connection.createStatement().execute("INSERT INTO learning_resources(id,kind) VALUES ('03000000-0000-4000-8000-000000000001','ACTIVITY')");
            try {
                connection.createStatement().execute(script);
                throw new AssertionError("A conflicting fixture UUID must be rejected");
            } catch (SQLException failure) {
                assertThat(failure.getSQLState()).isEqualTo("P0001");
                assertThat(failure.getMessage()).contains("P03_DEMO_ID_COLLISION");
            } finally {
                connection.createStatement().execute("ROLLBACK");
            }
            assertThat(new JdbcTemplate(new SingleConnectionDataSourceAdapter(connection))
                    .queryForObject("SELECT COUNT(*) FROM learning_resources", Integer.class)).isEqualTo(1);
        }
    }

    @Test @Order(8)
    void aCompositionInsertWaitingOnAConcurrentFreezeCannotSlipIntoTheFrozenVersion() throws Exception {
        var parent = version(resource("COURSE"), 1);
        var child = version(resource("MODULE"), 1);
        freeze(child);
        var executor = Executors.newSingleThreadExecutor();
        try (var freezer = dataSource.getConnection()) {
            freezer.setAutoCommit(false);
            try (var statement = freezer.prepareStatement("UPDATE pedagogical_versions SET frozen_at = CURRENT_TIMESTAMP WHERE id = ?")) {
                statement.setObject(1, parent);
                statement.executeUpdate();
            }
            var started = new CountDownLatch(1);
            var attempt = executor.submit(() -> {
                try (var contender = connection("public"); var statement = contender.prepareStatement(
                        "INSERT INTO version_compositions(id,parent_version_id,child_version_id,position) VALUES (?,?,?,1)")) {
                    contender.setClientInfo("ApplicationName", "p03-freeze-race");
                    statement.setQueryTimeout(10);
                    statement.setObject(1, UUID.randomUUID());
                    statement.setObject(2, parent);
                    statement.setObject(3, child);
                    started.countDown();
                    statement.executeUpdate();
                    return "INSERTED";
                } catch (SQLException failure) { return failure.getSQLState(); }
            });
            assertThat(started.await(3, TimeUnit.SECONDS)).isTrue();
            var deadline = System.nanoTime() + Duration.ofSeconds(3).toNanos();
            boolean waiting;
            do {
                waiting = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'p03-freeze-race' AND wait_event_type = 'Lock')", Boolean.class));
                if (!waiting) Thread.sleep(20);
            } while (!waiting && System.nanoTime() < deadline);
            assertThat(waiting).as("The insert must actually wait on the parent's database row lock").isTrue();
            freezer.commit();
            assertThat(attempt.get(5, TimeUnit.SECONDS)).isEqualTo("23514");
        } finally { executor.shutdownNow(); }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM version_compositions WHERE parent_version_id = ?", Integer.class, parent)).isZero();
    }

    private Flyway migrate(String schema, String target) {
        var configuration = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration").cleanDisabled(true);
        if (target != null) configuration.target(target);
        var flyway = configuration.load();
        flyway.migrate();
        return flyway;
    }

    private Connection connection(String schema) throws SQLException {
        var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        connection.createStatement().execute("SET TIME ZONE 'UTC'");
        connection.setSchema(schema);
        return connection;
    }
    @Test @Order(9)
    void databaseExceptionsKeepSqlStateWithoutLeakingFailingRowDetails() throws Exception {
        var privateEmail = "Private." + UUID.randomUUID() + "@example.test";
        var privateHash = "synthetic-private-hash-" + UUID.randomUUID();
        try (var connection = dataSource.getConnection();
             var statement = connection.prepareStatement("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES (?,?,?,'ACTIVE')")) {
            statement.setObject(1, UUID.randomUUID());
            statement.setString(2, privateEmail);
            statement.setString(3, privateHash);
            var failure = catchThrowable(statement::executeUpdate);
            assertThat(failure).isInstanceOf(SQLException.class);
            assertThat(((SQLException) failure).getSQLState()).isEqualTo("23514");
            assertThat(failure.getMessage()).doesNotContain(privateEmail, privateHash, "Failing row");
        }
    }

    private void insertUser(UUID id, String email) {
        jdbc.update("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES (?,?,'synthetic-test-hash','ACTIVE')", id, email);
    }
    private UUID resource(String kind) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO learning_resources(id,kind) VALUES (?,?)", id, kind);
        return id;
    }
    private UUID version(UUID resource, int number) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO pedagogical_versions(id,resource_id,version_number,objectives,evaluation_definition) VALUES (?,?,?,'Fictional objective','Fictional assessment requirements')", id, resource, number);
        return id;
    }
    private UUID translation(UUID version, String locale) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO content_translations(id,pedagogical_version_id,locale,editorial_state) VALUES (?,?,?,'DRAFT')", id, version, locale);
        return id;
    }
    private UUID editorialRevision(UUID translation, int number, String title) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO editorial_revisions(id,translation_id,revision_number,title,summary,body) VALUES (?,?,?,?,'','Fictional content')", id, translation, number, title);
        return id;
    }
    private UUID composition(UUID parent, UUID child, int position) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO version_compositions(id,parent_version_id,child_version_id,position) VALUES (?,?,?,?)", id, parent, child, position);
        return id;
    }
    private void insertSlug(UUID resource, String kind, String locale, String slug) {
        jdbc.update("INSERT INTO resource_slugs(id,resource_id,resource_kind,locale,slug) VALUES (?,?,?,?,?)", UUID.randomUUID(), resource, kind, locale, slug);
    }
    private void freeze(UUID version) {
        jdbc.update("UPDATE pedagogical_versions SET frozen_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", version);
    }
    private static void expectState(String state, Runnable action) {
        var failure = catchThrowable(action::run);
        assertThat(failure).isNotNull();
        String observed = null;
        for (var cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) { observed = sql.getSQLState(); break; }
        }
        assertThat(observed).isEqualTo(state);
    }

    /** Keeps JdbcTemplate from closing a connection owned by a test's try-with-resources. */
    private static final class SingleConnectionDataSourceAdapter extends org.springframework.jdbc.datasource.SingleConnectionDataSource {
        private SingleConnectionDataSourceAdapter(Connection connection) { super(connection, true); }
    }
}
