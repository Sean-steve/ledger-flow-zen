#!/usr/bin/env node
/**
 * Prevent accidentally targeting the repo's existing non-staging database or
 * a different Supabase project. This script never prints credentials.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const fail = (message) => { console.error("STAGING TARGET REJECTED: " + message); process.exit(1); };
const urlString = process.env.FDOS_STAGING_DATABASE_URL;
const stageId = process.env.FDOS_STAGING_ID;
const projectRef = process.env.FDOS_STAGING_PROJECT_REF;
if (!urlString || !stageId || !projectRef) fail("Missing dedicated staging DB URL, stage ID or project reference.");
if (!/^fdos-staging-[a-z0-9-]{3,50}$/.test(stageId)) fail("FDOS_STAGING_ID must begin with fdos-staging-.");
if (!/^[a-z0-9-]{4,80}$/.test(projectRef)) fail("Invalid staging project reference.");
let url;
try { url = new URL(urlString); } catch { fail("Invalid PostgreSQL connection URL."); }
if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.password || !url.hostname)
  fail("A complete PostgreSQL URL, including credentials, is required.");
if (/[\r\n]/.test(urlString)) fail("Newlines in database URL are forbidden.");

const host = url.hostname.toLowerCase();
const isLocal = ["localhost","127.0.0.1","::1"].includes(host);
if (isLocal) {
  if (process.env.FDOS_STAGING_ALLOW_LOCAL !== "YES" || projectRef !== "local-ci-only")
    fail("Local PostgreSQL is permitted only in explicitly isolated CI.");
} else if (host === `db.${projectRef}.supabase.co`) {
  if (!["require","verify-ca","verify-full"].includes(url.searchParams.get("sslmode")))
    fail("Remote PostgreSQL must use TLS (sslmode=require or stronger).");
} else if (host.endsWith(".pooler.supabase.com") &&
           decodeURIComponent(url.username).endsWith("." + projectRef)) {
  fail("Direct database connections are required for transaction-scoped staging migrations; no poolers.");
} else {
  const approvedHost = process.env.FDOS_STAGING_SELF_HOSTED_HOST;
  if (!approvedHost || host !== approvedHost.toLowerCase() ||
      process.env.FDOS_STAGING_PROVIDER !== "selfhosted" ||
      !["require","verify-ca","verify-full"].includes(url.searchParams.get("sslmode")))
    fail("Hostname does not match the dedicated Supabase project or an explicitly approved TLS self-host.");
}

try {
  const env = readFileSync(resolve(".env"), "utf8");
  const match = env.match(/^\s*(?:VITE_)?SUPABASE_PROJECT_ID\s*=\s*['"]?([^\s'"\r\n]+)/m);
  if (match?.[1] === projectRef) fail("Staging project matches the existing application project; refusing to touch it.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
console.log("Staging URL target validated (credentials redacted).");
