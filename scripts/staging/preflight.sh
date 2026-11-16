#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ -f .env.staging ]] || { echo "Create private .env.staging on staging VPS" >&2; exit 1; }
permissions="$(stat -c '%a' .env.staging)"
if (( 8#$permissions & 8#077 )); then
 echo "chmod 600 .env.staging (no group/other permissions)" >&2; exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.staging
set +a
: "${FDOS_STAGE_DOMAIN:?}"
: "${FDOS_STAGE_DB_PASSWORD:?}"
: "${DATABASE_URL:?}"
: "${FDOS_STAGE_BASIC_USER:?}"
: "${FDOS_STAGE_BASIC_HASH:?}"
: "${FDOS_STAGE_ACME_EMAIL:?}"
[[ "$FDOS_STAGE_DOMAIN" != *example* &&
   "$FDOS_STAGE_DOMAIN" == *.* &&
   "$FDOS_STAGE_DOMAIN" != *"/"* ]] ||
  { echo "Set a real dedicated staging DNS name" >&2; exit 1; }
[[ "$FDOS_STAGE_BASIC_HASH" == '$2a$'* ||
   "$FDOS_STAGE_BASIC_HASH" == '$2b$'* ||
   "$FDOS_STAGE_BASIC_HASH" == '$2y$'* ]] ||
  { echo "Use a real Caddy bcrypt password hash" >&2; exit 1; }
[[ "$FDOS_STAGE_DB_PASSWORD" != CHANGE_* ]] ||
  { echo "Replace the database password placeholder" >&2; exit 1; }
# Detect mismatched credential URL and prohibit unsafe managed/private prod URLs.
node --input-type=module -e '
import {assertLocalRuntime} from "./server/local/http-security.mjs";
const config={...process.env,FDOS_STAGING_CONFIRMED:"YES",FDOS_STAGE_DATA_POLICY:"SYNTHETIC_ONLY",
  FDOS_RELEASE_MODE:"staging",FDOS_API_HOST:"0.0.0.0",
  FDOS_LOCAL_ALLOW_SIGNUP:"NO",FDOS_COMM_MODE:"preview",
  FDOS_MPESA_MODE:"preview",FDOS_ETIMS_MODE:"preview",
  FDOS_AUTOMATION_LIVE_ENABLED:"NO",FDOS_AUTOMATION_LIVE_APPROVED:"NO",
  FDOS_FRONTEND_ORIGIN:"https://"+process.env.FDOS_STAGE_DOMAIN};
const runtime=assertLocalRuntime(config);
if(!runtime.stagingOnly||runtime.productionEnabled)process.exit(1);
'
docker compose --env-file .env.staging -f deploy/staging/compose.yml config -q
echo "PASS: isolated staging configuration, disabled external services, private secrets permissions."
