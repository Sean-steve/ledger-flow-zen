#!/usr/bin/env bash
# Phase 8: NON-DESTRUCTIVE restore drill into an automatically named disposable DB.
# Never targets fdos_local or any caller-provided database.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
if [[ ! -f .env.local ]]; then echo "Missing .env.local" >&2; exit 1; fi
if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage: bash scripts/recovery/verify-local-backup.sh /absolute/path/to/file.dump" >&2; exit 1
fi
archive="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
manifest="$archive.sha256"
if [[ ! -f "$manifest" ]]; then echo "Missing .sha256 manifest" >&2; exit 1; fi
(
  cd "$(dirname "$archive")"
  sha256sum --check --status -- "$(basename "$manifest")"
) || { echo "Backup SHA-256 verification failed" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source .env.local
set +a
database_name="fdos_restore_$(date -u +%s)_$RANDOM"
[[ "$database_name" =~ ^fdos_restore_[0-9]+_[0-9]+$ ]] || exit 1
docker_exec(){ docker compose -f compose.postgres.local.yml exec -T postgres "$@"; }
cleanup(){
  docker_exec dropdb -U fdos_dev --if-exists --force "$database_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# Confirm archive can be listed as an authentic custom-format pg_dump.
docker_exec pg_restore -l < "$archive" >/dev/null
docker_exec createdb -U fdos_dev -T template0 "$database_name"
docker_exec pg_restore -U fdos_dev -d "$database_name" \
  --clean --if-exists --no-owner --no-acl --exit-on-error < "$archive" >/dev/null
check="$(docker_exec psql -X -At -v ON_ERROR_STOP=1 -U fdos_dev -d "$database_name" \
  -c "SELECT to_regclass('public.businesses') IS NOT NULL AND
             to_regclass('public.documents') IS NOT NULL AND
             to_regclass('public.payments') IS NOT NULL AND
             to_regclass('public.receipts') IS NOT NULL AND
             to_regclass('public.business_integrations') IS NOT NULL AND
             to_regclass('fdos_local.users') IS NOT NULL;")"
if [[ "$check" != "t" ]]; then echo "Restore structural checks failed" >&2; exit 1; fi
echo "PASS: checksum, full disposable database restore and required financial/auth modules."
echo "Original fdos_local was not modified. Disposable restore database will be deleted."
