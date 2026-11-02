#!/usr/bin/env node
// Safe, anonymous staging gateway probe. Never prints tokens or customer data.
// This is reachability/RLS smoke coverage, NOT authenticated app E2E.
const env = process.env;
function fail(message) {
  console.error("STAGING API CHECK FAILED: " + message);
  process.exit(1);
}
const endpoint = env.FDOS_STAGING_API_URL;
const project = env.FDOS_STAGING_PROJECT_REF;
const key = env.FDOS_STAGING_PUBLISHABLE_KEY;
if (!endpoint || !project || !key) fail("Staging API URL, project reference and public API key are required.");
if (key.startsWith("sb_secret_")) fail("Privileged secret API keys are forbidden.");
const pieces = key.split(".");
if (pieces.length === 3) {
  let payload;
  try { payload = JSON.parse(Buffer.from(pieces[1], "base64url").toString("utf8")); }
  catch { fail("Invalid JWT-format API key."); }
  if (["service_role", "supabase_admin"].includes(payload.role)) fail("Privileged JWTs are forbidden.");
}
let url;
try { url = new URL(endpoint); } catch { fail("Invalid API URL."); }
if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || !["/", ""].includes(url.pathname)) fail("Use a plain HTTPS staging API origin.");
const custom = env.FDOS_STAGING_PROVIDER === "selfhosted"
  && url.hostname === env.FDOS_STAGING_SELF_HOSTED_API_HOST;
if (url.hostname !== project + ".supabase.co" && !custom) {
  fail("API hostname does not belong to the dedicated staging project.");
}
const headers = { apikey: key, accept: "application/json" };
async function request(path) {
  return await fetch(url.origin + path, {
    method: "GET", headers, signal: AbortSignal.timeout(15000), redirect: "error",
  });
}
try {
  const auth = await request("/auth/v1/health");
  if (!auth.ok) fail("Supabase Auth health is not ready (HTTP " + auth.status + ").");
  const business = await request("/rest/v1/businesses?select=id&limit=1");
  if ([401, 403].includes(business.status)) {
    console.log("Staging Auth reachable; anonymous business reads correctly denied.");
  } else if (business.status === 200) {
    const result = await business.json();
    if (!Array.isArray(result) || result.length !== 0)
      fail("Anonymous request unexpectedly exposed business records.");
    console.log("Staging Auth reachable; anonymous business RLS returned no data.");
  } else {
    fail("Staging Data API is not ready (HTTP " + business.status + ").");
  }
} catch (error) {
  fail("Staging connectivity or transport verification failed.");
}
