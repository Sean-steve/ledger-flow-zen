// Sandboxed, local-only Financial Document OS -> Nflake Guard connector.
// Financial Document OS PostgreSQL invoice_ledger is the ONLY balance authority.
// No automatic provider settlement assertions and NO real-site restrictions.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { database, withUser } from "./database.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}
function uuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value))
    throw invalid("Invalid " + label);
  return value.toLowerCase();
}
function moneyToMinor(value) {
  // The canonical ledger is numeric(18,2). Do NOT use floating point conversions.
  const text = String(value);
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text))
    throw invalid("Invalid nonnegative invoice balance");
  const parts = text.split(".");
  const minor = BigInt(parts[0]) * 100n + BigInt((parts[1] || "").padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw invalid("Invoice balance exceeds safe minor units");
  return Number(minor);
}
function guardEndpoint(env) {
  if (env.FDOS_GUARD_MODE !== "sandbox")
    throw invalid("Guard sandbox delivery is disabled", 403);
  let url;
  try { url = new URL(env.FDOS_GUARD_BASE_URL); }
  catch { throw invalid("Invalid Guard sandbox endpoint"); }
  if (url.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw invalid("Guard sandbox endpoint must be loopback HTTP without credentials or paths");
  const secret = env.FDOS_GUARD_CONNECTOR_SECRET;
  if (typeof secret !== "string" || secret.length < 32)
    throw invalid("Guard sandbox signing secret is missing");
  return { url: url.origin + "/webhooks/financial", secret };
}
export function guardRuntime(env = process.env) {
  return {
    mode: env.FDOS_GUARD_MODE === "sandbox" ? "SANDBOX" : "PREVIEW",
    deliveryEnabled: env.FDOS_GUARD_MODE === "sandbox" &&
      typeof env.FDOS_GUARD_CONNECTOR_SECRET === "string" &&
      env.FDOS_GUARD_CONNECTOR_SECRET.length >= 32 &&
      (() => { try { guardEndpoint(env); return true; } catch { return false; } })(),
    verifiedEventsEnabled: false,
    description: "Only signed sandbox snapshots. No merchant settlement verification or client-site restriction."
  };
}
export function signedHeaders({ secret, eventId, timestamp, body }) {
  if (typeof secret !== "string" || secret.length < 32) throw invalid("Signing secret missing");
  const signature = createHmac("sha256", secret)
    .update(String(timestamp) + "." + body).digest("hex");
  return {
    "Content-Type": "application/json",
    "x-guard-event-id": eventId,
    "x-guard-timestamp": String(timestamp),
    "x-guard-signature": signature
  };
}
async function assertOwner(userId, businessId) {
  const rows = await withUser(userId, tx => tx.unsafe(
    "SELECT role::text AS role FROM public.business_members WHERE business_id=$1::uuid AND user_id=$2::uuid",
    [businessId, userId]));
  if (!rows.some(row => row.role === "OWNER"))
    throw invalid("Only the business owner can manage Guard links", 403);
}
async function invoiceForLink(db, businessId, invoiceId) {
  const rows = await db.unsafe(
    "SELECT l.invoice_id::text AS invoice_id, l.currency, l.status::text AS status, " +
    "l.balance::text AS balance, l.due_date::text AS due_day, " +
    "(l.due_date IS NOT NULL AND l.due_date < CURRENT_DATE) AS overdue " +
    "FROM public.invoice_ledger l WHERE l.business_id=$1::uuid AND l.invoice_id=$2::uuid",
    [businessId, invoiceId]);
  if (rows.length !== 1 || rows[0].status !== "ISSUED")
    throw invalid("Only an issued invoice from the selected business can be linked or synced", 409);
  if (rows[0].currency !== "KES")
    throw invalid("Guard sandbox currently accepts KES invoices only", 409);
  return rows[0];
}
export async function registerGuardLink(userId, input) {
  const businessId = uuid(input?.businessId, "business ID");
  const invoiceId = uuid(input?.invoiceId, "invoice ID");
  const projectId = uuid(input?.guardProjectId, "Guard project ID");
  await assertOwner(userId, businessId);
  await invoiceForLink(database, businessId, invoiceId);
  // One link per canonical issued invoice; never infer identity from client names.
  const rows = await database.unsafe(
    "INSERT INTO fdos_local.guard_links (business_id,invoice_id,guard_project_id) " +
    "VALUES ($1::uuid,$2::uuid,$3::uuid) ON CONFLICT DO NOTHING RETURNING *",
    [businessId, invoiceId, projectId]);
  if (!rows.length) throw invalid("Invoice or Guard project is already linked", 409);
  return {
    id: rows[0].id, invoiceId, guardProjectId: projectId,
    externalInvoiceId: invoiceId,
    warning: "The Guard project must use this exact invoice UUID as external_invoice_id."
  };
}
function snapshotFor(invoice, link) {
  const balanceMinor = moneyToMinor(invoice.balance);
  const overdue = Boolean(invoice.overdue) && balanceMinor > 0;
  const type = balanceMinor === 0 ? "invoice.settled" :
    overdue ? "invoice.overdue" : "invoice.balance_updated";
  const payload = JSON.stringify({
    type, source: "sandbox",
    external_invoice_id: link.invoice_id,
    project_id: link.guard_project_id,
    balance_minor: balanceMinor,
    due_at: invoice.due_day ? invoice.due_day + "T00:00:00Z" : null
  });
  return { type, payload, hash: createHash("sha256").update(payload).digest("hex") };
}
async function queueSnapshot(linkId) {
  return database.begin(async tx => {
    const found = await tx.unsafe(
      "SELECT * FROM fdos_local.guard_links WHERE id=$1::uuid FOR UPDATE",
      [linkId]);
    const link = found[0];
    if (!link || !link.enabled) return { queued: false, reason: "LINK_DISABLED" };
    const invoice = await invoiceForLink(tx, link.business_id, link.invoice_id);
    const snap = snapshotFor(invoice, link);
    if (snap.hash === link.last_snapshot_hash)
      return { queued: false, reason: "UNCHANGED", linkId: link.id };
    const sequence = Number(link.last_sequence) + 1;
    if (!Number.isSafeInteger(sequence)) throw invalid("Guard event sequence exhausted", 409);
    const eventId = randomUUID();
    const [row] = await tx.unsafe(
      "INSERT INTO fdos_local.guard_outbox (link_id,event_id,sequence,payload,payload_hash) " +
      "VALUES ($1::uuid,$2::uuid,$3,$4,$5) RETURNING id",
      [link.id, eventId, sequence, snap.payload, snap.hash]);
    await tx.unsafe(
      "UPDATE fdos_local.guard_links SET last_sequence=$1,last_snapshot_hash=$2,updated_at=now() WHERE id=$3::uuid",
      [sequence, snap.hash, link.id]);
    return { queued: true, id: row.id, eventId, sequence, type: snap.type,
      invoiceId: link.invoice_id, source: "sandbox" };
  });
}
export async function queueGuardPreview(userId, input) {
  const businessId = uuid(input?.businessId, "business ID");
  const invoiceId = uuid(input?.invoiceId, "invoice ID");
  await assertOwner(userId, businessId);
  const links = await database.unsafe(
    "SELECT id FROM fdos_local.guard_links WHERE business_id=$1::uuid AND invoice_id=$2::uuid",
    [businessId, invoiceId]);
  if (!links.length) throw invalid("Guard invoice link not found", 404);
  return queueSnapshot(links[0].id);
}
export async function listGuardOutbox(userId, input) {
  const businessId = uuid(input?.businessId, "business ID");
  await assertOwner(userId, businessId);
  const links = await database.unsafe(
    "SELECT l.id,l.invoice_id,l.guard_project_id,l.enabled,l.last_sequence, " +
    "o.id AS event_row_id,o.event_id,o.sequence,o.status,o.attempts,o.last_http_status,o.created_at " +
    "FROM fdos_local.guard_links l LEFT JOIN LATERAL " +
    "(SELECT * FROM fdos_local.guard_outbox o WHERE o.link_id=l.id " +
    "ORDER BY sequence DESC LIMIT 10) o ON true " +
    "WHERE l.business_id=$1::uuid ORDER BY l.created_at DESC,o.sequence DESC LIMIT 100",
    [businessId]);
  return links.map(row => ({
    linkId: row.id, invoiceId: row.invoice_id, guardProjectId: row.guard_project_id,
    enabled: row.enabled, latestSequence: Number(row.last_sequence),
    eventId: row.event_id ?? null, eventRowId: row.event_row_id ?? null,
    sequence: row.sequence == null ? null : Number(row.sequence),
    status: row.status ?? null, attempts: row.attempts ?? null,
    lastHttpStatus: row.last_http_status ?? null, createdAt: row.created_at ?? null
  }));
}
async function transmitOne(row, env = process.env, transport = fetch) {
  const endpoint = guardEndpoint(env);
  const stamp = Math.floor(Date.now() / 1000);
  const response = await transport(endpoint.url, {
    method: "POST",
    headers: signedHeaders({
      secret: endpoint.secret, eventId: row.event_id,
      timestamp: stamp, body: row.payload
    }),
    body: row.payload,
    signal: AbortSignal.timeout(2500),
    redirect: "error",
    cache: "no-store"
  });
  if (![200,202].includes(response.status))
    return { delivered: false, httpStatus: response.status };
  let parsed;
  try { parsed = await response.json(); } catch {
    return { delivered: false, httpStatus: response.status };
  }
  if (!["accepted","duplicate"].includes(parsed?.status))
    return { delivered: false, httpStatus: response.status };
  return { delivered: true, httpStatus: response.status };
}
export async function deliverGuardOutbox({ limit = 10, env = process.env, transport = fetch } = {}) {
  guardEndpoint(env); // Fail before attempting any delivery when not in approved local sandbox.
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw invalid("Invalid Guard dispatch limit");
  let delivered = 0, held = 0, retry = 0;
  // Per-row locking makes concurrent workers safe. Earlier unresolved events block later ones.
  for (let i = 0; i < limit; i++) {
    const outcome = await database.begin(async tx => {
      const rows = await tx.unsafe(
        "SELECT o.* FROM fdos_local.guard_outbox o JOIN fdos_local.guard_links l ON l.id=o.link_id " +
        "WHERE l.enabled AND o.status IN ('PENDING','RETRY') " +
        "AND o.next_attempt_at <= now() AND NOT EXISTS (SELECT 1 FROM fdos_local.guard_outbox older " +
        "WHERE older.link_id=o.link_id AND older.sequence < o.sequence AND older.status <> 'DELIVERED') " +
        "ORDER BY o.created_at,o.sequence LIMIT 1 FOR UPDATE OF o SKIP LOCKED");
      if (!rows.length) return "EMPTY";
      const row = rows[0];
      let result;
      try { result = await transmitOne(row, env, transport); }
      catch { result = { delivered: false, httpStatus: null }; }
      const attempts = row.attempts + 1;
      if (result.delivered) {
        await tx.unsafe(
          "UPDATE fdos_local.guard_outbox SET status='DELIVERED',attempts=$1,last_http_status=$2,delivered_at=now() WHERE id=$3::uuid",
          [attempts, result.httpStatus, row.id]);
        return "DELIVERED";
      }
      // No secret, raw response, customer details, or URL is recorded.
      const nextStatus = attempts >= 8 ? "HELD" : "RETRY";
      const backoff = Math.min(3600, Math.pow(2, Math.min(attempts, 9)));
      await tx.unsafe(
        "UPDATE fdos_local.guard_outbox SET status=$1,attempts=$2,last_http_status=$3," +
        "next_attempt_at=now()+($4::int * interval '1 second') WHERE id=$5::uuid",
        [nextStatus, attempts, result.httpStatus, backoff, row.id]);
      return nextStatus;
    });
    if (outcome === "EMPTY") break;
    if (outcome === "DELIVERED") delivered++;
    if (outcome === "RETRY") retry++;
    if (outcome === "HELD") held++;
  }
  return { delivered, retry, held, mode: "SANDBOX", verified: false };
}
export async function dispatchGuardPreview(userId, input, options) {
  const businessId = uuid(input?.businessId, "business ID");
  await assertOwner(userId, businessId);
  const invoiceId = uuid(input?.invoiceId, "invoice ID");
  const found = await database.unsafe(
    "SELECT id FROM fdos_local.guard_links WHERE invoice_id=$1::uuid AND business_id=$2::uuid",
    [invoiceId, businessId]);
  if (!found.length) throw invalid("Guard link not found", 404);
  // A global dispatcher is safe because only owners can create links and all
  // events are SANDBOX; this endpoint never operates in production.
  return deliverGuardOutbox({limit: 10, ...options});
}
export async function runGuardSandboxTick({ env = process.env, transport = fetch, limit = 25 } = {}) {
  guardEndpoint(env);
  const links = await database.unsafe(
    "SELECT id FROM fdos_local.guard_links WHERE enabled ORDER BY created_at ASC LIMIT $1",
    [Math.max(1, Math.min(Number(limit)||25, 50))]);
  const synced = [];
  for (const link of links) {
    try { synced.push(await queueSnapshot(link.id)); }
    catch { synced.push({queued:false,reason:"LINK_REQUIRES_REVIEW"}); }
  }
  const sent = await deliverGuardOutbox({ env, transport, limit: 25 });
  return { inspected: links.length, queued: synced.filter(s=>s.queued).length, ...sent };
}
