#!/usr/bin/env bash
# Additive fiscal schema for existing FDOS PostgreSQL 16 volumes.
set -euo pipefail
cd "$(dirname "$0")/../.."
sql() { docker compose -f compose.postgres.local.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U fdos_dev -d fdos_local "$@"; }
exists="$(printf "SELECT to_regclass('public.fiscal_submissions') IS NOT NULL;\n" | sql -At)"
if [[ "$exists" == "t" ]]; then
  echo "Phase 4 fiscal tables already present. Financial records preserved."
  exit 0
fi
communication="$(printf "SELECT to_regclass('public.communication_outbox') IS NOT NULL;\n" | sql -At)"
if [[ "$communication" != "t" ]]; then
  echo "Run Phase 3 migrations before Phase 4" >&2
  exit 1
fi
{ echo 'BEGIN;'; cat drizzle/migrations/0007_fiscal_etims.sql; echo 'COMMIT;'; } | sql >/dev/null
echo "Phase 4 local fiscal schema ready; no production KRA transmission enabled."
