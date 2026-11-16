#!/usr/bin/env bash
# Schema initialization for a NEW, ISOLATED staging database only.
# Refuses to import, reset or silently upgrade any pre-existing unknown database.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ -f .env.staging ]] || { echo "Missing private .env.staging" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source .env.staging
set +a
: "${FDOS_STAGE_DB_PASSWORD:?Required isolated database password}"
compose=(docker compose --env-file .env.staging -f deploy/staging/compose.yml)
psql_stage(){ "${compose[@]}" exec -T db psql -X -v ON_ERROR_STOP=1 -U fdos_stage -d fdos_staging "$@"; }
businesses="$(printf "SELECT to_regclass('public.businesses') IS NOT NULL;\n" | psql_stage -At)"
marker="$(printf "SELECT to_regclass('public.fdos_stage_migration') IS NOT NULL;\n" | psql_stage -At)"
if [[ "$marker" == "t" ]]; then
  check="$(printf "SELECT to_regclass('public.business_integrations') IS NOT NULL AND to_regclass('fdos_local.users') IS NOT NULL;\n" | psql_stage -At)"
  [[ "$check" == "t" ]] || { echo "Staging schema incomplete; manual remediation required" >&2; exit 1; }
  echo "Existing marked staging schema preserved (no reset, no migration replay)."
  exit 0
fi
if [[ "$businesses" == "t" ]]; then
 echo "Refusing unmarked database with business tables: do not risk customer records" >&2
 exit 1
fi
{
 echo 'BEGIN;'
 cat tests/sql/supabase-auth-shim.sql
 for file in drizzle/migrations/000{0,1,2,3,4,5}_*.sql; do
   [[ -f "$file" ]] || { echo "Missing required SQL $file" >&2; exit 1; }
   cat "$file"
 done
 cat server/local/schema.sql
 for file in drizzle/migrations/000{6,7,8,9}_*.sql drizzle/migrations/0010_business_configuration.sql; do
   [[ -f "$file" ]] || { echo "Missing required SQL $file" >&2; exit 1; }
   cat "$file"
 done
 cat <<'SQL'
CREATE TABLE public.fdos_stage_migration (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only=true)
);
INSERT INTO public.fdos_stage_migration(version) VALUES ('phase8.1-0010');
SQL
 echo 'COMMIT;'
} | psql_stage >/dev/null
echo "Fresh synthetic-only staging schema 0000–0010 installed transactionally."
