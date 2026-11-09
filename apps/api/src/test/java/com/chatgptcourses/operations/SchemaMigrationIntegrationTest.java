package com.chatgptcourses.operations;

import static org.assertj.core.api.Assertions.*;
import java.sql.DriverManager;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class SchemaMigrationIntegrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42").asCompatibleSubstituteFor("postgres"));

    @Test void oneShotMigratesAnEmptyDatabaseAndAReplayMakesNoBusinessRows() throws Exception {
        String database = createDatabase();
        var configuration = configuration(database);
        assertThat(SchemaMigrationMain.migrate(configuration)).isEqualTo(19);
        assertThat(SchemaMigrationMain.migrate(configuration)).isZero();
        try (var connection = DriverManager.getConnection(url(database), POSTGRES.getUsername(), POSTGRES.getPassword()); var statement = connection.createStatement()) {
            try (var rows = statement.executeQuery("SELECT count(*) FROM flyway_schema_history WHERE success AND type='SQL'")) { rows.next(); assertThat(rows.getInt(1)).isEqualTo(19); }
            for (String table : new String[]{"user_accounts", "spring_session", "orders", "access_grants", "notification_outbox", "content_translations"}) {
                try (var rows = statement.executeQuery("SELECT count(*) FROM " + table)) { rows.next(); assertThat(rows.getInt(1)).isZero(); }
            }
        }
    }

    @Test void concurrentUpgradeFromV018UsesFlywayLockingAndPreservesExistingRows() throws Exception {
        String database = createDatabase();
        Flyway.configure().dataSource(url(database), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration").target("018").cleanDisabled(true).loggers("slf4j").load().migrate();
        String before;
        try (var connection = DriverManager.getConnection(url(database), POSTGRES.getUsername(), POSTGRES.getPassword()); var statement = connection.createStatement()) {
            statement.executeUpdate("INSERT INTO user_accounts(id,normalized_email,password_hash,status) VALUES(gen_random_uuid(),'isolated-migration@example.invalid','unusable-isolated-test-hash','ACTIVE')");
            try (var rows = statement.executeQuery("SELECT row_to_json(u)::text FROM user_accounts u")) { rows.next(); before = rows.getString(1); }
        }
        var barrier = new CyclicBarrier(2);
        Callable<Integer> migrate = () -> { barrier.await(10, TimeUnit.SECONDS); return SchemaMigrationMain.migrate(configuration(database)); };
        try (var threads = Executors.newFixedThreadPool(2)) {
            var a = threads.submit(migrate); var b = threads.submit(migrate);
            assertThat(a.get(60, TimeUnit.SECONDS) + b.get(60, TimeUnit.SECONDS)).isEqualTo(1);
        }
        try (var connection = DriverManager.getConnection(url(database), POSTGRES.getUsername(), POSTGRES.getPassword()); var statement = connection.createStatement(); var rows = statement.executeQuery("SELECT row_to_json(u)::text FROM user_accounts u")) {
            rows.next(); assertThat(rows.getString(1).equals(before)).isTrue(); assertThat(rows.next()).isFalse();
        }
    }

    private static String createDatabase() throws Exception {
        String database = "migration_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()); var statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE " + database);
            statement.execute("CREATE ROLE app_" + database.substring(10) + " LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
        }
        return database;
    }
    private static String url(String database) { return "jdbc:postgresql://" + POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432) + "/" + database; }
    private static Map<String, String> configuration(String database) {
        var values = new HashMap<String, String>();
        values.put("APP_ENV", "staging"); values.put("POSTGRES_HOST", POSTGRES.getHost()); values.put("POSTGRES_PORT", POSTGRES.getMappedPort(5432).toString());
        values.put("POSTGRES_DB", database); values.put("POSTGRES_USER", POSTGRES.getUsername()); values.put("POSTGRES_PASSWORD", POSTGRES.getPassword());
        values.put("POSTGRES_APP_ROLE", "app_" + database.substring(10));
        return values;
    }
}
