package com.chatgptcourses.operations;

import java.util.Map;
import java.util.Properties;
import java.util.Set;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** One-shot schema migration only. Never starts Spring, a server, schedulers or imports. */
public final class SchemaMigrationMain {
    private SchemaMigrationMain() { }

    public static void main(String[] args) {
        try {
            if (args.length != 0) throw new IllegalArgumentException();
            int executed = migrate(System.getenv());
            System.out.println("SCHEMA_MIGRATION_COMPLETE executed=" + executed);
        } catch (Exception unavailable) {
            // JDBC/Flyway exceptions can contain connection information or SQL values.
            System.err.println("SCHEMA_MIGRATION_FAILED");
            System.exit(1);
        }
    }

    public static int migrate(Map<String, String> environment) throws java.sql.SQLException {
        if (!Set.of("local", "test", "staging", "production").contains(required(environment, "APP_ENV"))) {
            throw new IllegalArgumentException("Unsupported migration environment");
        }
        String host = required(environment, "POSTGRES_HOST");
        String database = required(environment, "POSTGRES_DB");
        if (!host.matches("[A-Za-z0-9][A-Za-z0-9.-]{0,252}") || !database.matches("[A-Za-z0-9_]{1,63}")) {
            throw new IllegalArgumentException("Invalid database location");
        }
        int port = Integer.parseInt(required(environment, "POSTGRES_PORT"));
        if (port < 1 || port > 65535) throw new IllegalArgumentException("Invalid database port");
        var properties = new Properties();
        properties.setProperty("user", required(environment, "POSTGRES_USER"));
        properties.setProperty("password", required(environment, "POSTGRES_PASSWORD"));
        properties.setProperty("connectTimeout", "5");
        properties.setProperty("socketTimeout", "120");
        properties.setProperty("logServerErrorDetail", "false");
        properties.setProperty("options", "-c TimeZone=UTC");
        var source = new DriverManagerDataSource("jdbc:postgresql://" + host + ":" + port + "/" + database, properties);
        var flyway = Flyway.configure().dataSource(source).locations("classpath:db/migration")
                .cleanDisabled(true).baselineOnMigrate(false).validateOnMigrate(true)
                .validateMigrationNaming(true).outOfOrder(false).loggers("slf4j").load();
        int executed = flyway.migrate().migrationsExecuted;
        grantApplicationRole(source, required(environment, "POSTGRES_APP_ROLE"));
        return executed;
    }

    private static void grantApplicationRole(DriverManagerDataSource source, String role) throws java.sql.SQLException {
        if (!role.matches("[a-z_][a-z0-9_]{0,62}")) throw new IllegalArgumentException("Invalid application role");
        try (var connection = source.getConnection()) {
            connection.setAutoCommit(false);
            try (var check = connection.prepareStatement("SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolname<>current_user AND NOT pg_has_role(rolname,current_user,'MEMBER') FROM pg_roles WHERE rolname=?")) {
                check.setString(1, role);
                try (var rows = check.executeQuery()) {
                    if (!rows.next() || !rows.getBoolean(1)) throw new IllegalArgumentException("Application role must be restricted and separate");
                }
            }
            String quoted = '"' + role + '"';
            try (var statement = connection.createStatement()) {
                statement.execute("GRANT USAGE ON SCHEMA public TO " + quoted);
                statement.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO " + quoted);
                statement.execute("REVOKE INSERT,UPDATE,DELETE ON TABLE public.flyway_schema_history FROM " + quoted);
                statement.execute("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO " + quoted);
                statement.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO " + quoted);
                statement.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO " + quoted);
            }
            try (var check = connection.prepareStatement("SELECT has_schema_privilege(?,'public','CREATE') OR has_database_privilege(?,current_database(),'CREATE')")) {
                check.setString(1, role); check.setString(2, role);
                try (var rows = check.executeQuery()) {
                    rows.next(); if (rows.getBoolean(1)) throw new IllegalArgumentException("Application role must not have DDL privileges");
                }
            }
            connection.commit();
        }
    }

    private static String required(Map<String, String> values, String key) {
        String value = values.get(key);
        if (value == null || value.isBlank() || value.indexOf('\0') >= 0 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
            throw new IllegalArgumentException("Missing or invalid migration setting");
        }
        return value;
    }
}
