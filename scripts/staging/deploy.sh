#!/usr/bin/env bash
# Explicit operator-only staging activation from a PRECHECKED revision.
set -euo pipefail
cd "$(dirname "$0")/../.."
expected="${1:-}"
[[ "$expected" =~ ^[0-9a-f]{40}$ ]] || { echo "Usage: deploy.sh <reviewed-git-commit-sha>" >&2; exit 1; }
actual="$(git rev-parse HEAD)"
[[ "$actual" == "$expected" ]] ||
  { echo "Refusing staging deploy: checked out commit differs from approved SHA" >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] ||
  { echo "Refusing staging deploy from a dirty working tree" >&2; exit 1; }
bash scripts/staging/preflight.sh
compose=(docker compose --env-file .env.staging -f deploy/staging/compose.yml)
"${compose[@]}" up -d --wait db
bash scripts/staging/migrate.sh
"${compose[@]}" up -d --build --wait api frontend edge
bash scripts/staging/verify.sh "$actual"
