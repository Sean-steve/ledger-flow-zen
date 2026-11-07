#!/usr/bin/env bash
# One-time, local-only Postgres bootstrap. Never touches remote/cloud databases.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${FDOS_DB_PASSWORD:?Set FDOS_DB_PASSWORD from .env.local}"
: "${FDOS_DB_PORT:=55434}"
export FDOS_DB_PASSWORD FDOS_DB_PORT
command -v docker >/dev/null || { echo "Install Docker first"; exit 1; }
if ! docker compose version >/dev/null 2>&1; then echo "Docker Compose v2 required"; exit 1; fi
docker compose -f compose.postgres.local.yml up -d --wait postgres
sql() { docker compose -f compose.postgres.local.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U fdos_dev -d fdos_local "$@"; }
exists="$(echo "SELECT to_regclass('public.businesses') IS NOT NULL;" | sql -At)"
if [[ "$exists" == "t" ]]; then
  echo "FDOS financial schema already exists; preserving all financial records."
  bash scripts/local/migrate-phase3.sh
  bash scripts/local/migrate-phase4.sh
  bash scripts/local/migrate-phase5.sh
  bash scripts/local/migrate-phase6.sh
  bash scripts/local/migrate-phase7.sh
  exit 0
fi
# The SQL runs inside a single transaction: no half-initialized financial tables.
{
 echo 'BEGIN;'
 cat tests/sql/supabase-auth-shim.sql
 for script in drizzle/migrations/000{0,1,2,3,4,5}_*.sql; do
   [[ -f "$script" ]] || { echo "Missing migration $script" >&2; exit 1; }
   cat "$script"
 done
 cat server/local/schema.sql
 cat drizzle/migrations/0006_communications.sql
 cat drizzle/migrations/0007_fiscal_etims.sql
 cat drizzle/migrations/0008_mpesa_payment_reconciliation.sql
 cat drizzle/migrations/0009_automation_notifications.sql
 cat drizzle/migrations/0010_business_configuration.sql
 echo 'COMMIT;'
} | sql >/dev/null
echo "Local FDOS PostgreSQL schema and local authentication tables ready."
