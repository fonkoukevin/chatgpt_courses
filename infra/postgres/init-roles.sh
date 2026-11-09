#!/bin/sh
set -eu
# Fresh cluster only. Passwords never enter argv or SQL source text.
psql -X --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
SET log_error_verbosity = 'terse';
DO $$ BEGIN
 EXECUTE format('CREATE ROLE courses_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', btrim(pg_read_file('/run/secrets/POSTGRES_MIGRATION_PASSWORD'), E'\r\n'));
 EXECUTE format('CREATE ROLE courses_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', btrim(pg_read_file('/run/secrets/POSTGRES_APP_PASSWORD'), E'\r\n'));
 EXECUTE format('ALTER DATABASE %I OWNER TO courses_owner', current_database());
 EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO courses_app', current_database());
END $$;
SQL
