#!/usr/bin/env bash
# Staging verification evidence is unsigned and is NOT an approval to launch.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
sha="${1:-$(git rev-parse HEAD)}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
bash scripts/staging/preflight.sh
set -a
# shellcheck disable=SC1091
source .env.staging
set +a
compose=(docker compose --env-file .env.staging -f deploy/staging/compose.yml)
"${compose[@]}" exec -T db pg_isready -U fdos_stage -d fdos_staging >/dev/null
"${compose[@]}" exec -T api node --input-type=module -e '
const x=await fetch("http://127.0.0.1:5012/api/local/health");
if(!x.ok||(await x.json()).backend!=="staging-postgres")process.exit(1);
'
"${compose[@]}" exec -T frontend node --input-type=module -e '
const x=await fetch("http://127.0.0.1:3000/");
if(x.status>=500)process.exit(1);
'
# Caddy must have a trusted TLS certificate and reject unauthenticated access.
status="$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "https://$FDOS_STAGE_DOMAIN/api/local/health")"
[[ "$status" == "401" ]] || {
 echo "Expected protected HTTPS staging gateway to reject anonymous access with HTTP 401; received $status" >&2
 exit 1
}
mkdir -p -m 700 .staging-evidence
# Only safe, non-secret evidence: operator must separately attest login, roles,
# backup restoration and external HTTPS independently.
NODE_SHA="$sha" node --input-type=module <<'JS' > ".staging-evidence/$sha.json"
const result={
  phase:"8.1",
  commit:process.env.NODE_SHA,
  checkedAt:new Date().toISOString(),
  environment:"STAGING",
  dataPolicy:"SYNTHETIC_ONLY",
  checks:{
    postgresHealth:true,apiPrivateHealth:true,frontendPrivateHealth:true,
    tlsTrusted:true,anonymousAccessDenied:true,
    providerModes:"PREVIEW_ONLY",
  },
  productionRelease:"BLOCKED",
  externalIdentityMfaCertified:false,
  productionPaymentsCertified:false,
  kraEtimsCertified:false,
  liveMessagingCertified:false,
  offHostRestoreCertified:false,
};
process.stdout.write(JSON.stringify(result,null,2)+"\n");
JS
chmod 600 ".staging-evidence/$sha.json"
echo "PASS: protected HTTPS synthetic staging checks; evidence .staging-evidence/$sha.json"
echo "PRODUCTION RELEASE: BLOCKED — requires separate sign-offs."
