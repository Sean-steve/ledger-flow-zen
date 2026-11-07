#!/usr/bin/env bash
# Phase 8: read-only logical backup of the existing local PostgreSQL volume.
# Contains financial and password-hash data: protect and encrypt before off-host transfer.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
if [[ ! -f .env.local ]]; then echo "Missing .env.local" >&2; exit 1; fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a
if ! command -v docker >/dev/null; then echo "Docker Compose is required" >&2; exit 1; fi
target_dir="${1:-"$PWD/.backups"}"
mkdir -p -m 700 "$target_dir"
target_dir="$(cd "$target_dir" && pwd -P)"
chmod 700 "$target_dir"
name="fdos-local-$(date -u +'%Y%m%dT%H%M%SZ')-$RANDOM.dump"
target="$target_dir/$name"
tmp="$(mktemp "$target_dir/.fdos-archive-XXXXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
docker compose -f compose.postgres.local.yml exec -T postgres \
  pg_dump -U fdos_dev -d fdos_local -Fc --no-owner --no-acl > "$tmp"
[[ -s "$tmp" ]] || { echo "Backup unexpectedly empty" >&2; exit 1; }
docker compose -f compose.postgres.local.yml exec -T postgres \
  pg_restore -l < "$tmp" >/dev/null
chmod 600 "$tmp"
mv -- "$tmp" "$target"
hash="$(sha256sum "$target" | awk '{print $1}')"
printf '%s  %s\n' "$hash" "$name" > "$target.sha256"
chmod 600 "$target.sha256"
echo "Local financial backup created: $target"
echo "SHA-256 manifest: $target.sha256"
echo "WARNING: Contains sensitive records; encrypt for off-host retention."
