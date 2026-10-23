#!/bin/sh
# =============================================================================
# Container entrypoint for MMO Shopping Backend
#
#   RUN_MIGRATIONS=true   -> run TypeORM migrations before starting
#   RUN_SEED_ADMIN=true   -> seed the admin account (needs SEED_ADMIN_* env)
#
# Development (NODE_ENV=development) uses ts-node; production uses the
# compiled data source in dist/.
# =============================================================================
set -eu

log() {
  printf '[entrypoint] %s\n' "$*"
}

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  if [ "${NODE_ENV:-production}" = "development" ]; then
    log "Running migrations (ts-node / src/database/data-source.ts)"
    npm run typeorm:migration:run
  else
    log "Running migrations (compiled / dist/database/data-source.js)"
    node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
  fi
fi

if [ "${RUN_SEED_ADMIN:-false}" = "true" ]; then
  log "Seeding admin account"
  node scripts/seed-admin.js
fi

log "Starting: $*"
exec "$@"
