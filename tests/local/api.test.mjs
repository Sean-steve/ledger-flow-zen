import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { database } from "../../server/local/database.mjs";
import { createLocalApiServer } from "../../server/local/api.mjs";

const ORIGIN=process.env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000";
let server,base,cookie,businessId,clientId,invoiceId,paymentId,receiptId;
async function post(path,data={},options={}) {
  const resp=await fetch(base+path,{
    method:"POST",
    headers:{"Content-Type":"application/json",Origin:options.origin??ORIGIN,
      ...(options.noCookie?{}:cookie?{Cookie:cookie}:{})},
    body:JSON.stringify(data),
  });
  return {status:resp.status,body:await resp.json(),cookie:resp.headers.get("set-cookie")};
}
before(async()=>{
 server=createLocalApiServer();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
 if(server) await new Promise(resolve=>server.close(resolve));
 await database.end({timeout:5});
});
test("health responds for local PostgreSQL",async()=>{
 const r=await fetch(base+"/api/local/health");
 assert.equal(r.status,200);
 assert.equal((await r.json()).backend,"local-postgres");
});
test("session must exist for financial records and cross-origin writes are rejected",async()=>{
 let r=await post("/api/local/query",{table:"businesses"}, {noCookie:true});
 assert.equal(r.status,401);
 r=await post("/api/local/auth/signup",{email:"x@local.test",password:"strong-password-123"},{origin:"https://elsewhere.invalid"});
 assert.equal(r.status,403);
});
test("create and persist a local user without Supabase",async()=>{
 const email=`local-${randomUUID()}@example.local`;
 const r=await post("/api/local/auth/signup",{email,password:"correct-horse-local-987",fullName:"Local Developer"});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.ok(r.body.data?.id);
 assert.match(r.cookie??"",/HttpOnly; SameSite=Strict/);
 cookie=r.cookie.split(";")[0];
 const user=await fetch(base+"/api/local/auth/user",{headers:{Cookie:cookie}});
 assert.equal((await user.json()).data.email,email);
});
test("business/client creation is tenant scoped",async()=>{
 const b=await post("/api/local/rpc",{name:"create_business",args:{_name:"Local Invoicing",_base_currency:"KES"}});
 assert.equal(b.status,200,JSON.stringify(b.body));
 businessId=b.body.data.id;assert.ok(businessId);
 const c=await post("/api/local/query",{table:"clients",mode:"insert",
    values:{business_id:businessId,name:"Local Client",currency:"KES",email:"client@example.test"},
    single:true});
 assert.equal(c.status,200,JSON.stringify(c.body));
 clientId=c.body.data.id;
 const list=await post("/api/local/query",{table:"clients",filters:[{field:"business_id",value:businessId}]});
 assert.equal(list.status,200);
 assert.equal(list.body.data.length,1);
});
test("create draft, issue, allocate, receipt and reverse using authoritative PostgreSQL",async()=>{
 const draft=await post("/api/local/rpc",{name:"save_document_draft",args:{
   _business_id:businessId,_client_id:clientId,_document_id:null,
   _payload:{type:"INVOICE",currency:"KES",issue_date:"2026-11-03",
     template_id:"executive-atelier",payment_terms_days:30,exchange_rate:1},
   _items:[{position:1,description:"Hosting setup",quantity:1,unit_price:1000,
     tax_category:"VAT_16",discount_pct:0}],
 }});
 assert.equal(draft.status,200,JSON.stringify(draft.body));
 invoiceId=draft.body.data.id;
 assert.equal(Number(draft.body.data.total_amount),1160);
 const issue=await post("/api/local/rpc",{name:"finalize_document",args:{_document_id:invoiceId}});
 assert.equal(issue.status,200,JSON.stringify(issue.body));
 assert.equal(issue.body.data.status,"ISSUED");
 const key=randomUUID();
 const payload={business_id:businessId,client_id:clientId,idempotency_key:key,
  amount:"400.00",currency:"KES",channel:"BANK_TRANSFER",
  allocations:[{invoice_id:invoiceId,amount:"400.00"}]};
 const payment=await post("/api/local/rpc",{name:"record_payment_v2",args:{_request:payload}});
 assert.equal(payment.status,200,JSON.stringify(payment.body));
 paymentId=payment.body.data.payment.id;
 receiptId=payment.body.data.receipt.id;
 const replay=await post("/api/local/rpc",{name:"record_payment_v2",args:{_request:payload}});
 assert.equal(replay.status,200,JSON.stringify(replay.body));
 assert.equal(replay.body.data.payment.id,paymentId);
 assert.equal(replay.body.data.idempotent,true);
 const ledger=await post("/api/local/query",{table:"invoice_ledger",
  filters:[{field:"invoice_id",value:invoiceId}],single:true});
 assert.equal(ledger.status,200,JSON.stringify(ledger.body));
 assert.equal(Number(ledger.body.data.balance),760);
 const reverse=await post("/api/local/rpc",{name:"reverse_payment",
  args:{_payment_id:paymentId,_reason:"Local integration test reversal"}});
 assert.equal(reverse.status,200,JSON.stringify(reverse.body));
 const refreshed=await post("/api/local/query",{table:"invoice_ledger",
  filters:[{field:"invoice_id",value:invoiceId}],single:true});
 assert.equal(Number(refreshed.body.data.balance),1160);
 const receipts=await post("/api/local/query",{table:"receipts",
  filters:[{field:"id",value:receiptId}],single:true});
 assert.equal(receipts.status,200,JSON.stringify(receipts.body));
 assert.ok(receipts.body.data.voided_at);
});
test("public document shares reveal allowlisted information only",async()=>{
 const token=randomUUID().replaceAll("-","")+randomUUID().replaceAll("-","").slice(0,16);
 const link=await post("/api/local/query",{table:"share_links",mode:"insert",single:true,
  values:{business_id:businessId,document_id:invoiceId,token}});
 assert.equal(link.status,200,JSON.stringify(link.body));
 const shared=await post("/api/local/rpc",{name:"get_shared_document",args:{_token:token}},{noCookie:true});
 assert.equal(shared.status,200,JSON.stringify(shared.body));
 assert.equal(shared.body.data.kind,"document");
 assert.equal(shared.body.data.business.owner_id,undefined);
 assert.equal(shared.body.data.document.created_by,undefined);
});
test("bad SQL identifiers and untrusted table writes are rejected",async()=>{
 const bad=await post("/api/local/query",{table:"payments",mode:"insert",
   values:{business_id:businessId,client_id:clientId,amount:10}});
 assert.equal(bad.status,400);
 const injection=await post("/api/local/query",{table:"clients",filters:[{
   field:"business_id; DROP TABLE public.payments;",value:businessId,
 }]});
 assert.equal(injection.status,400);
});
