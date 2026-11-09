#!/bin/sh
# Secrets are read from explicitly mounted files, never command arguments/logs.
set -eu
umask 077

fail() { printf '%s\n' 'API_CONTAINER_CONFIGURATION_INVALID' >&2; exit 2; }

# Only the fixed names below may be expanded. No supplied shell text is evaluated.
secret_file() {
    name=$1
    eval "file=\${${name}_FILE-}"
    eval "direct=\${${name}-}"
    if [ -z "$file" ] && [ -f "/run/secrets/$name" ]; then file="/run/secrets/$name"; fi
    if [ -n "$file" ]; then
        [ "$file" = "/run/secrets/$name" ] || fail
        [ -f "$file" ] && [ -r "$file" ] && [ ! -L "$file" ] || fail
        [ -z "$direct" ] || fail
        value=$(cat "$file") || fail
        # Every supported credential is a single line. A final LF is harmless.
        case "$value" in *'
'*|*"$(printf '\r')"*) fail ;; esac
        export "$name=$value"
    fi
}

required() { eval "value=\${$1-}"; [ -n "$value" ] || fail; }

mode=${1:-serve}
case "$mode" in serve|migrate) [ "$#" -le 1 ] || fail ;; objects) [ "$#" -eq 3 ] || fail ;; *) fail ;; esac
# Prevent JVM/launcher options from turning configuration secrets into command logs.
[ -z "${JAVA_TOOL_OPTIONS-}${JDK_JAVA_OPTIONS-}${_JAVA_OPTIONS-}${LOADER_MAIN-}${LOADER_PATH-}${LOADER_ARGS-}${LOADER_HOME-}${LOADER_CONFIG_LOCATION-}${LOADER_CONFIG_NAME-}${LOADER_SYSTEM-}" ] || fail
if [ "$mode" = objects ]; then
    case "${APP_ENV-}" in staging|production) ;; test) [ "${ISOLATED_OBJECT_SNAPSHOT-false}" = true ] || fail ;; *) fail ;; esac
    case "$2" in export|restore) ;; *) fail ;; esac
    secret_file S3_ACCESS_KEY
    secret_file S3_SECRET_KEY
    for key in S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_PUBLIC_BUCKET S3_PRIVATE_BUCKET; do required "$key"; done
    exec java -XX:MaxRAMPercentage=75 -Dfile.encoding=UTF-8 -Duser.timezone=UTC -Dlogback.configurationFile=/app/cli-logback.xml \
        -Dloader.main=com.chatgptcourses.operations.ObjectSnapshotMain \
        -cp /app/api.jar org.springframework.boot.loader.launch.PropertiesLauncher "$2" "$3"
fi
case "${APP_ENV-}" in staging|production) ;; *) fail ;; esac
secret_file POSTGRES_PASSWORD
for key in POSTGRES_HOST POSTGRES_PORT POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD; do required "$key"; done

if [ "$mode" = migrate ]; then
    required POSTGRES_APP_ROLE
    exec java -Dfile.encoding=UTF-8 -Duser.timezone=UTC -Dlogback.configurationFile=/app/cli-logback.xml \
        -Dloader.main=com.chatgptcourses.operations.SchemaMigrationMain \
        -cp /app/api.jar org.springframework.boot.loader.launch.PropertiesLauncher
fi

for key in NOTIFICATION_OUTBOX_KEY MAIL_USERNAME MAIL_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do secret_file "$key"; done
required NOTIFICATION_OUTBOX_KEY
required APP_PUBLIC_ORIGIN
[ "${SESSION_COOKIE_SECURE-}" = true ] || fail
case "$APP_PUBLIC_ORIGIN" in https://*) ;; *) fail ;; esac
if [ "${STORAGE_ENABLED-false}" = true ]; then required S3_ACCESS_KEY; required S3_SECRET_KEY; fi
if [ "${STRIPE_ENABLED-false}" = true ]; then required STRIPE_SECRET_KEY; required STRIPE_WEBHOOK_SECRET; required STRIPE_ACCOUNT_ID; fi
if [ "${MAIL_SMTP_AUTH-false}" = true ]; then required MAIL_USERNAME; required MAIL_PASSWORD; fi
[ -z "${SPRING_PROFILES_ACTIVE-}" ] || [ "$SPRING_PROFILES_ACTIVE" = "$APP_ENV" ] || fail
export SPRING_PROFILES_ACTIVE="$APP_ENV" API_PORT=8080 DEBUG=false
exec java -XX:MaxRAMPercentage=75 -Dfile.encoding=UTF-8 -Duser.timezone=UTC \
    -jar /app/api.jar --spring.flyway.enabled=false --spring.jpa.hibernate.ddl-auto=validate \
    --spring.sql.init.mode=never --spring.session.jdbc.initialize-schema=never --server.address=0.0.0.0
