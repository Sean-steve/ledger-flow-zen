#!/usr/bin/env bash
# Safe additive Phase 3 migration for an EXISTING FDOS local PostgreSQL volume.
set -euo pipefail
cd "$(dirname "$0")/../.."
sql() { docker compose -f compose.postgres.local.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U fdos_dev -d fdos_local "$@"; }
has_schema="$(echo "SELECT to_regclass('public.businesses') IS NOT NULL;" | sql -At)"
if [[ "$has_schema" != "t" ]]; then
 echo "Cannot apply Phase 3 before the financial schema is initialized" >&2
 exit 1
fi
has_outbox="$(echo "SELECT to_regclass('public.communication_outbox') IS NOT NULL;" | sql -At)"
if [[ "$has_outbox" == "t" ]]; then
 echo "Phase 3 communication schema already present; no database reset."
 exit 0
fi
{ echo 'BEGIN;'; cat drizzle/migrations/0006_communications.sql; echo 'COMMIT;'; } | sql >/dev/null
echo "Phase 3 communication schema applied; existing financial records preserved."
