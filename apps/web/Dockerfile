# Build from the repository root: docker build -f apps/web/Dockerfile .
# Official Node index digest verified against registry manifest bytes.
FROM node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json ./apps/web/package.json
RUN test "$(node --version)" = "v24.22.2" \
    && test "$(npm --version)" = "11.19.1" \
    && npm ci --include=dev --no-audit --no-fund

FROM dependencies AS builder
# Explicit inputs exclude host .env, native node_modules/.next and the user's
# generated next-env.d.ts. Next generates its own declarations in this stage.
COPY apps/web/src ./apps/web/src
COPY references/design-tokens.css ./references/design-tokens.css
COPY apps/web/next.config.ts apps/web/postcss.config.mjs apps/web/tsconfig.json ./apps/web/
# There are currently no public/ assets. Keep an empty deployment directory;
# local static imports are emitted into .next/static by Next itself.
RUN mkdir -p apps/web/public \
    && COURSES_BUILD_STANDALONE=1 APP_ENV=test \
       APP_PUBLIC_ORIGIN=http://127.0.0.1:3000 API_INTERNAL_URL=http://127.0.0.1:8080 \
       APP_PUBLISHED_LOCALES= npm --workspace @chatgpt-courses/web run build

FROM node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS runtime
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="ChatGPT Courses web" \
      org.opencontainers.image.revision="${VCS_REF}"
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --gid 10001 courses \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin courses \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/include/node /opt/yarn-* \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
       /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx
COPY --from=builder --chown=10001:10001 /app/apps/web/.next/standalone ./
COPY --from=builder --chown=10001:10001 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=10001:10001 /app/apps/web/public ./apps/web/public
COPY --chown=10001:10001 scripts/container/web-entrypoint.mjs scripts/container/web-healthcheck.mjs ./
RUN mkdir -p /app/apps/web/.next/cache \
    && chown 10001:10001 /app/apps/web/.next/cache \
    && chmod 0444 /app/web-entrypoint.mjs /app/web-healthcheck.mjs
USER 10001:10001
WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=6s --start-period=30s --retries=3 CMD ["node", "--no-warnings", "/app/web-healthcheck.mjs"]
# Warning events are still handled; Node's parallel raw warning output is off.
ENTRYPOINT ["node", "--no-warnings", "/app/web-entrypoint.mjs"]
