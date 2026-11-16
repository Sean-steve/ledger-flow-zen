#!/usr/bin/env bash
# Full staging restore drill into a DISPOSABLE database in the isolated cluster.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
[[ $# -eq 1 && -f "$1" ]] ||
  { echo "Usage: verify-restore.sh /absolute/path/to/fdos-staging-...dump" >&2; exit 1; }
archive="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
(
  cd "$(dirname "$archive")"
  sha256sum --check --status -- "$(basename "$archive").sha256"
) || { echo "Staging backup checksum failed" >&2; exit 1; }
bash scripts/staging/preflight.sh >/dev/null
compose=(docker compose --env-file .env.staging -f deploy/staging/compose.yml)
db="fdos_stage_drill_$(date -u +%s)_$RANDOM"
[[ "$db" =~ ^fdos_stage_drill_[0-9]+_[0-9]+$ ]] || exit 1
cleanup(){
 "${compose[@]}" exec -T db dropdb -U fdos_stage --if-exists --force "$db" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${compose[@]}" exec -T db pg_restore -l < "$archive" >/dev/null
"${compose[@]}" exec -T db createdb -U fdos_stage -T template0 "$db"
"${compose[@]}" exec -T db pg_restore -U fdos_stage -d "$db" \
  --clean --if-exists --no-owner --no-acl --exit-on-error < "$archive" >/dev/null
result="$("${compose[@]}" exec -T db psql -X -At -v ON_ERROR_STOP=1 -U fdos_stage -d "$db" -c "
 SELECT to_regclass('public.fdos_stage_migration') IS NOT NULL
    AND to_regclass('public.businesses') IS NOT NULL
    AND to_regclass('public.payments') IS NOT NULL
    AND to_regclass('public.business_integrations') IS NOT NULL
    AND to_regclass('fdos_local.users') IS NOT NULL;")"
[[ "$result" == "t" ]] || { echo "Staging restore missing required schema" >&2; exit 1; }
echo "PASS: checksum and complete disposable staging database restore."
echo "Live fdos_staging volume never overwritten or reset."
