#!/usr/bin/env bash

set -e

PRISMA_SCHEMA_PATH="./libraries/nestjs-libraries/src/database/prisma/schema.prisma"
PRISMA_SCHEMA_SYNC_MODE="${PRISMA_SCHEMA_SYNC_MODE:-db-push}"

run_prisma_schema_sync() {
    if [ "${SKIP_PRISMA_SCHEMA_SYNC:-false}" = "true" ] || [ "${SKIP_PRISMA_MIGRATIONS:-false}" = "true" ]; then
        echo "Skipping Prisma schema sync because SKIP_PRISMA_SCHEMA_SYNC=true or SKIP_PRISMA_MIGRATIONS=true."
        return 0
    fi

    case "$PRISMA_SCHEMA_SYNC_MODE" in
        db-push)
            echo "Running Prisma db push for Docker dev/fresh database compatibility."
            echo "Set PRISMA_SCHEMA_SYNC_MODE=migrate to use Prisma migrate deploy instead."
            pnpm run prisma-db-push
            ;;
        migrate)
            echo "Running Prisma migrate deploy because PRISMA_SCHEMA_SYNC_MODE=migrate."
            pnpm dlx prisma@6.5.0 migrate deploy --schema "$PRISMA_SCHEMA_PATH"
            ;;
        *)
            echo "Unsupported PRISMA_SCHEMA_SYNC_MODE=$PRISMA_SCHEMA_SYNC_MODE. Use 'db-push' or 'migrate'." >&2
            exit 1
            ;;
    esac
}

start_pm2_services() {
    pm2 delete all || true
    pnpm run --parallel pm2
    pm2 logs
}

run_prisma_schema_sync
nginx
start_pm2_services
