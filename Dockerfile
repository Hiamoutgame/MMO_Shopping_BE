# syntax=docker/dockerfile:1

# =============================================================================
# MMO Shopping Backend - production image (multi-stage)
#
#   base       -> shared Node base image + env
#   build      -> installs ALL deps, compiles TypeScript to dist/
#   prod-deps  -> installs ONLY production dependencies
#   runtime    -> minimal, non-root runtime image (tini + healthcheck)
#   development-> used by docker-compose.dev.yml (full deps, hot reload)
#
# Render deployment: set PORT, DATABASE_URL, and other env vars via
# the Render dashboard or render.yaml.
# =============================================================================

# ---------- base -------------------------------------------------------------
FROM node:24-alpine AS base
WORKDIR /app

# Playwright browsers are never needed inside the image (unit/API tests only).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# ---------- build ------------------------------------------------------------
FROM base AS dev-deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

FROM dev-deps AS build
COPY . .
RUN npm run build

# ---------- production dependencies ------------------------------------------
FROM base AS prod-deps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- development ------------------------------------------------------
# docker-compose.dev.yml targets this stage: full devDependencies + hot reload.
FROM dev-deps AS development
COPY . .
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start:dev"]

# ---------- runtime ----------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# tini reaps zombie processes and forwards signals to Node.
# Works fine on Render and local Docker.
RUN apk add --no-cache tini

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build     --chown=node:node /app/dist         ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

# PORT is injected at runtime by Render (default 10000) or docker-compose (3000).
# EXPOSE is informational only.
EXPOSE 3000

# Healthcheck: Render does its own HTTP health checks, this is for local docker.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
