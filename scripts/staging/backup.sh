#!/usr/bin/env bash
# Isolated synthetic staging PostgreSQL backup; never reads production DB.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
bash scripts/staging/preflight.sh >/dev/null
compose=(docker compose --env-file .env.staging -f deploy/staging/compose.yml)
dir="${1:-"$PWD/.staging-backups"}"
mkdir -p -m 700 "$dir"
dir="$(cd "$dir" && pwd -P)"
chmod 700 "$dir"
name="fdos-staging-$(date -u +'%Y%m%dT%H%M%SZ')-$RANDOM.dump"
tmp="$(mktemp "$dir/.fdos-stage-archive-XXXXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
"${compose[@]}" exec -T db pg_dump -U fdos_stage -d fdos_staging -Fc --no-owner --no-acl > "$tmp"
[[ -s "$tmp" ]] || { echo "Empty staging database backup" >&2; exit 1; }
"${compose[@]}" exec -T db pg_restore -l < "$tmp" >/dev/null
chmod 600 "$tmp"
mv -- "$tmp" "$dir/$name"
( cd "$dir"; sha256sum "$name" > "$name.sha256" )
chmod 600 "$dir/$name.sha256"
echo "STAGING BACKUP: $dir/$name"
echo "Staging data is synthetic; encrypt before external retention."
