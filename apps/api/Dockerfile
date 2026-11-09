# Build context: repository root. Base tags and OCI index digests verified against
# docker-library/official-images and registry-1.docker.io on 2026-11-09.
FROM eclipse-temurin:21.0.13_9-jdk-noble@sha256:114cabb73033ca4ce7ceec3deb62396bc1b716282bae051ed3c1d82e38fcab2d AS build
# Without unzip the wrapper switches to tar.gz, whose hash differs from its pinned ZIP.
# Ubuntu Noble official package version verified 2026-11-09; builder only.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends unzip=6.0-28ubuntu4.1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY apps/api/.mvn/ .mvn/
COPY apps/api/mvnw apps/api/pom.xml ./
COPY apps/api/src/main/ src/main/
COPY scripts/container/HealthProbe.java /build/probe/HealthProbe.java
# The checked-in wrapper verifies its pinned Maven 3.10.0 distribution checksum.
# PostgreSQL integration tests run in the release checks, outside the image build.
RUN chmod 0555 mvnw \
    && ./mvnw --batch-mode --no-transfer-progress -Dmaven.test.skip=true package \
    && javac --release 21 -d /build/probe/classes /build/probe/HealthProbe.java

FROM eclipse-temurin:21.0.13_9-jre-noble@sha256:0eda5830ed7b669abc246a8dc520ea8a23cab06f9a8d4b6964109e2f2394e46f AS runtime
# The base contains download/signature tools; they are not required by the API.
RUN apt-get purge --yes --auto-remove curl wget gnupg \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 courses \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin courses \
    && install -d -m 0555 /app /app/probe
WORKDIR /app
COPY --from=build --chmod=0444 /build/target/chatgpt-courses-api.jar /app/api.jar
COPY --from=build --chmod=0444 /build/probe/classes/HealthProbe.class /app/probe/HealthProbe.class
COPY --chmod=0555 scripts/container/api-entrypoint.sh /app/entrypoint.sh
COPY --chmod=0444 scripts/container/cli-logback.xml /app/cli-logback.xml
ARG VCS_REF
LABEL org.opencontainers.image.title="ChatGPT Courses API" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.description="Java 21 API and one-shot Flyway migration; no embedded environment secrets"
ENV API_PORT=8080 TZ=UTC
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --start-period=60s --retries=3 \
  CMD ["java", "-cp", "/app/probe", "HealthProbe"]
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["serve"]
