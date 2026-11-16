import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { database } from "../../server/local/database.mjs";
import { createLocalApiServer } from "../../server/local/api.mjs";
import { guardRuntime, runGuardSandboxTick, deliverGuardOutbox } from "../../server/local/guard-connector.mjs";

const ORIGIN = process.env.FDOS_FRONTEND_ORIGIN || "http://localhost:3000";
const GUARD_URL = "http://127.0.0.1:4080";
const GUARD_TOKEN = process.env.GUARD_ADMIN_TOKEN;
const guardHeaders = { Authorization: "Bearer " + GUARD_TOKEN, "Content-Type": "application/json" };
let server, fdos, cookie, businessId, clientId, invoiceId, guardProjectId, guardKey, finalPaymentId;
async function post(path, body, cookieOverride = cookie) {
  const result = await fetch(fdos + path, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN,
      ...(cookieOverride ? { Cookie: cookieOverride } : {}) },
    body: JSON.stringify(body || {})
  });
  return { status: result.status, data: await result.json(), cookie: result.headers.get("set-cookie") };
}
async function finance(path, body) {
  const result = await post(path, body);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data.data;
}
async function guard(path, method = "GET", body) {
  const response = await fetch(GUARD_URL + path, {
    method, headers: guardHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  return { status: response.status, data };
}
async function decision() {
  const response = await fetch(GUARD_URL + "/v1/license/" + guardProjectId, {
    headers: { "x-guard-project-key": guardKey }
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function invoice() {
  return finance("/api/local/query", {
    table: "invoice_ledger", filters: [{ field: "invoice_id", value: invoiceId }], single: true
  });
}
function daysBefore(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0,10);
}
async function paid(amount) {
  return finance("/api/local/rpc", {
    name: "record_payment_v2",
    args: { _request: {
      business_id: businessId, client_id: clientId, idempotency_key: randomUUID(),
      amount, currency: "KES", channel: "BANK_TRANSFER",
      allocations: [{ invoice_id: invoiceId, amount }]
    } }
  });
}
before(async () => {
  assert.equal(process.env.FDOS_GUARD_MODE, "sandbox");
  assert.equal(process.env.GUARD_DRY_RUN, "YES");
  assert.equal(process.env.GUARD_VERIFIED_EVENTS_ENABLED, "NO");
  server = createLocalApiServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  fdos = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await database.end({ timeout: 5 });
});
test("both independent systems start with safe sandbox modes", async () => {
  assert.equal(guardRuntime().mode, "SANDBOX");
  assert.equal(guardRuntime().verifiedEventsEnabled, false);
  const g = await guard("/healthz");
  assert.equal(g.data.dry_run, true);
  assert.equal(g.data.live_financial_events, false);
  const config = await post("/api/local/guard/config", {}, "");
  assert.equal(config.status, 401, "Guard config requires FDOS sign-in");
});
test("owner creates a real canonical invoice and a linked Guard project", async () => {
  const signup = await post("/api/local/auth/signup", {
    email: "guard-" + randomUUID() + "@example.local",
    password: "guard-integration-password-12345",
    fullName: "Sandbox Guard Owner"
  }, "");
  assert.equal(signup.status, 200, JSON.stringify(signup.data));
  cookie = signup.cookie.split(";")[0];
  const b = await finance("/api/local/rpc", { name: "create_business",
    args: { _name: "Guard Example Business", _base_currency: "KES" } });
  businessId = b.id;
  const c = await finance("/api/local/query", {
    table: "clients", mode: "insert", single: true,
    values: { business_id: businessId, name: "Fictional Contract Client", currency: "KES" }
  });
  clientId = c.id;
  const draft = await finance("/api/local/rpc", { name: "save_document_draft",
    args: {
      _business_id: businessId, _client_id: clientId, _document_id: null,
      _payload: {
        type: "INVOICE",currency: "KES",issue_date: daysBefore(15),
        payment_terms_days: 2,template_id: "executive-atelier",exchange_rate: 1
      },
      _items: [{
        position: 1, description: "Fictional Guard demo project",
        quantity: 1,unit_price:1500,tax_category:"ZERO_RATED",discount_pct:0
      }]
    }
  });
  const issued = await finance("/api/local/rpc", {
    name:"finalize_document",args:{_document_id:draft.id}
  });
  assert.equal(issued.status, "ISSUED");
  invoiceId = issued.id;
  const entry = await guard("/api/projects", "POST", {
    name:"Fictional Guard Test",client_name:"Fictional Contract Client",
    domain:"fictional.example.test",deployment_kind:"nflake_hosted",
    external_invoice_id:invoiceId
  });
  assert.equal(entry.status, 201, JSON.stringify(entry.data));
  guardProjectId = entry.data.project_id;
  guardKey = entry.data.project_key_once;
  const link = await finance("/api/local/guard/link", {
    businessId,invoiceId,guardProjectId
  });
  assert.equal(link.externalInvoiceId,invoiceId);
  const duplicate = await post("/api/local/guard/link", {businessId,invoiceId,guardProjectId});
  assert.equal(duplicate.status,409,"one Guard project/invoice binding only");
});
test("signed overdue snapshot reaches the REAL Guard receiver; duplicate scan is idempotent", async () => {
  const initial = await invoice();
  assert.equal(initial.payment_status,"OVERDUE");
  assert.equal(Number(initial.balance),1500);
  const first = await finance("/api/local/guard/queue", {businessId,invoiceId});
  assert.equal(first.queued,true);
  assert.equal(first.type,"invoice.overdue");
  const second = await finance("/api/local/guard/queue", {businessId,invoiceId});
  assert.equal(second.queued,false);
  assert.equal(second.reason,"UNCHANGED");
  const delivered = await finance("/api/local/guard/dispatch", {businessId,invoiceId});
  assert.equal(delivered.delivered,1);
  const state = await decision();
  assert.equal(state.status,"GRACE");
  assert.equal(state.restrict,false);
  const values = await guard("/api/projects");
  const project = values.data.projects.find(x=>x.id===guardProjectId);
  assert.equal(Number(project.balance_minor),150000);
  assert.equal(project.payment_source,"sandbox");
});
test("partial payment retry is idempotent and cannot change canonical balances", async () => {
  const payment=await paid("600.00");
  assert.ok(payment.payment.id);
  const ledger = await invoice();
  assert.equal(Number(ledger.balance),900);
  const queued=await finance("/api/local/guard/queue",{businessId,invoiceId});
  assert.equal(queued.queued,true);
  const offline=await deliverGuardOutbox({
    env: process.env, businessId, limit:1,
    transport: async () => ({status:503,json:async()=>({error:"unavailable"})})
  });
  assert.equal(offline.retry,1);
  assert.equal(Number((await invoice()).balance),900,"the Guard connector cannot mutate financial truth");
  // Clock advancement is test-only and touches only the disposable outbox.
  await database.unsafe(
    "UPDATE fdos_local.guard_outbox SET next_attempt_at=now() WHERE event_id=$1::uuid",
    [queued.eventId]
  );
  const delivered=await finance("/api/local/guard/dispatch",{businessId,invoiceId});
  assert.equal(delivered.delivered,1);
  assert.equal((await decision()).restrict,false);
  const state=(await guard("/api/projects")).data.projects.find(p=>p.id===guardProjectId);
  assert.equal(Number(state.balance_minor),90000);
});
test("full settlement restores ACTIVE, payment reversal restores overdue GRACE", async () => {
  const last=await paid("900.00");
  finalPaymentId=last.payment.id;
  assert.equal(Number((await invoice()).balance),0);
  const settled=await runGuardSandboxTick();
  assert.equal(settled.queued,1);
  assert.equal(settled.delivered,1);
  assert.equal((await decision()).status,"ACTIVE");
  const reversed=await finance("/api/local/rpc", {
    name:"reverse_payment",
    args:{_payment_id:finalPaymentId,_reason:"Sandbox reversal verification"}
  });
  assert.ok(reversed);
  assert.equal(Number((await invoice()).balance),900);
  const tick=await runGuardSandboxTick();
  assert.equal(tick.queued,1);
  assert.equal(tick.delivered,1);
  const result=await decision();
  assert.equal(result.status,"GRACE");
  assert.equal(result.restrict,false);
});
test("cross-tenant linking and unverified manual enforcement are refused", async () => {
  const second = await post("/api/local/auth/signup", {
    email:"guard-other-"+randomUUID()+"@example.local",
    password:"guard-another-password-88"
  }, "");
  assert.equal(second.status,200);
  const outsider=await post("/api/local/guard/queue",{businessId,invoiceId},second.cookie.split(";")[0]);
  assert.equal(outsider.status,403);
  const policy=await guard("/api/projects/"+guardProjectId+"/policy","POST",{
    contract_reference:"CI-signed-demo",
    contract_accepted_at:"2026-01-01T00:00:00Z",
    restriction_scope:"licensed_marketing_site",grace_days:7,enforcement_enabled:true
  });
  assert.equal(policy.status,200);
  assert.equal(policy.data.license.restrict,false,"sandbox finance events cannot restrict");
  const data=await finance("/api/local/guard/outbox",{businessId});
  assert.ok(data.filter(row=>row.status==="DELIVERED").length>=3);
});
