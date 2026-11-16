import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {before,after,test} from "node:test";
import {database} from "../../server/local/database.mjs";
import {createLocalApiServer} from "../../server/local/api.mjs";
import {assertLocalRuntime} from "../../server/local/http-security.mjs";
const ORIGIN=process.env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000";
let server,base,cookie,businessId,userId,invoiceId;
async function post(path,payload={},auth=cookie,origin=ORIGIN,contentType="application/json"){
 const response=await fetch(base+path,{method:"POST",headers:{
  Origin:origin,"Content-Type":contentType,
  ...(auth?{Cookie:auth}:{})
 },body:contentType==="application/json"?JSON.stringify(payload):String(payload)});
 return {status:response.status,response,body:await response.json(),cookie:response.headers.get("set-cookie")};
}
async function ok(path,payload={},auth=cookie){
 const result=await post(path,payload,auth);
 assert.equal(result.status,200,JSON.stringify(result.body));
 return result.body.data;
}
async function signup(email){
 const r=await post("/api/local/auth/signup",{email,
  password:"phase-eight-password-12345",fullName:"Phase Eight Reviewer"},null);
 assert.equal(r.status,200,JSON.stringify(r.body));
 return {id:r.body.data.id,cookie:r.cookie.split(";")[0]};
}
before(async()=>{
 server=createLocalApiServer();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 base="http://127.0.0.1:"+server.address().port;
});
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 await database.end({timeout:5});
});
test("local-only runtime blocks production and remote frontend/database URLs",()=>{
 const env={DATABASE_URL:process.env.DATABASE_URL,
  FDOS_FRONTEND_ORIGIN:ORIGIN,FDOS_API_HOST:"127.0.0.1"};
 assert.equal(assertLocalRuntime(env).localOnly,true);
 assert.throws(()=>assertLocalRuntime({...env,NODE_ENV:"production"}),/cannot start/);
 assert.throws(()=>assertLocalRuntime({...env,FDOS_RELEASE_MODE:"production"}),/cannot start/);
 assert.throws(()=>assertLocalRuntime({...env,FDOS_API_HOST:"0.0.0.0"}),/cannot start/);
 assert.throws(()=>assertLocalRuntime({...env,
  FDOS_FRONTEND_ORIGIN:"https://docs.example.test"}),/frontend origin/);
 assert.throws(()=>assertLocalRuntime({...env,
  DATABASE_URL:"postgresql://root:password@example.net/test"}),/local PostgreSQL/);
});
test("public health discloses no data and applies strict security headers",async()=>{
 const response=await fetch(base+"/api/local/health");
 assert.equal(response.status,200);
 assert.equal((await response.json()).backend,"local-postgres");
 assert.equal(response.headers.get("x-content-type-options"),"nosniff");
 assert.equal(response.headers.get("x-frame-options"),"DENY");
 assert.equal(response.headers.get("cross-origin-resource-policy"),"same-origin");
 assert.equal(response.headers.get("referrer-policy"),"no-referrer");
 assert.equal(response.headers.get("cache-control"),"no-store");
 assert.match(response.headers.get("x-request-id"),/^[0-9a-f-]{36}$/);
 const missing=await post("/api/local/ops/readiness",{businessId:randomUUID()},null);
 assert.equal(missing.status,401);
});
test("body parser rejects non-JSON, scalar, malformed, oversized and wrong origins",async()=>{
 const wrong=await post("/api/local/auth/signin","hello",null,ORIGIN,"text/plain");
 assert.equal(wrong.status,415);
 const tooBig=await post("/api/local/auth/signin",{noise:"x".repeat(270000)},null);
 assert.equal(tooBig.status,413);
 const malformed=await fetch(base+"/api/local/auth/signin",{method:"POST",
  headers:{Origin:ORIGIN,"Content-Type":"application/json"},body:"{invalid"});
 assert.equal(malformed.status,400);
 const scalar=await fetch(base+"/api/local/auth/signin",{method:"POST",
  headers:{Origin:ORIGIN,"Content-Type":"application/json"},body:"[1,2,3]"});
 assert.equal(scalar.status,400);
 const origin=await post("/api/local/auth/signin",{},null,"http://wrong-localhost:3000");
 assert.equal(origin.status,403);
});
test("financial workflow creates business, client, issued invoice, payment and receipt",async()=>{
 const user=await signup("phase8-owner-"+randomUUID()+"@example.local");
 cookie=user.cookie;userId=user.id;
 const business=await ok("/api/local/rpc",{name:"create_business",
  args:{_name:"Phase Eight Certifying Business",_base_currency:"KES"}});
 businessId=business.id;
 const client=await ok("/api/local/query",{table:"clients",mode:"insert",single:true,
  values:{business_id:businessId,name:"Certification Client",
   email:"test@example.local",currency:"KES"}});
 const draft=await ok("/api/local/rpc",{name:"save_document_draft",args:{
  _business_id:businessId,_client_id:client.id,_document_id:null,
  _payload:{type:"INVOICE",currency:"KES",issue_date:"2026-11-07",
   payment_terms_days:30,template_id:"executive-atelier",exchange_rate:1},
  _items:[{position:1,description:"Certification service",
   quantity:1,unit_price:1000,discount_pct:0,tax_category:"ZERO_RATED"}],
 }});
 const invoice=await ok("/api/local/rpc",{name:"finalize_document",
  args:{_document_id:draft.id}});
 assert.equal(invoice.status,"ISSUED");invoiceId=invoice.id;
 const payment=await ok("/api/local/rpc",{name:"record_payment_v2",args:{_request:{
  business_id:businessId,client_id:client.id,idempotency_key:randomUUID(),
  amount:"200.00",currency:"KES",channel:"BANK_TRANSFER",
  allocations:[{invoice_id:invoiceId,amount:"200.00"}],
 }}});
 assert.ok(payment.payment.id);
 const receipts=await ok("/api/local/query",{table:"receipts",
  filters:[{field:"business_id",value:businessId}]});
 assert.ok(receipts.some(r=>r.payment_id===payment.payment.id));
 const ledger=await ok("/api/local/query",{table:"invoice_ledger",
  filters:[{field:"invoice_id",value:invoiceId}]});
 assert.equal(ledger.length,1);
 assert.equal(Number(ledger[0].balance),800);
});
test("readiness is owner/admin scoped, fails the production gate and never leaks credentials",async()=>{
 const data=await ok("/api/local/ops/readiness",{businessId});
 assert.equal(data.releaseGate,"BLOCKED");
 assert.equal(data.certification,"LOCAL_TESTING_ONLY");
 assert.equal(data.runtime.productionEnabled,false);
 assert.equal(data.database.postgresMajor>=16,true);
 assert.equal(data.database.moduleReady,true);
 assert.ok(data.productionBlockers.some(x=>x.includes("KRA")));
 assert.ok(data.productionBlockers.some(x=>x.includes("off-host")));
 assert.ok(data.financialWorklist.invoicesWithoutEtims>=1);
 const raw=JSON.stringify(data);
 assert.equal(raw.includes(process.env.DATABASE_URL),false);
 assert.equal(raw.includes("phase-eight-password-12345"),false);
 const viewer=await signup("phase8-viewer-"+randomUUID()+"@example.local");
 const invite=await ok("/api/local/config/team/invite",{businessId,
  email:(await database`SELECT email FROM fdos_local.users WHERE id=${viewer.id}::uuid`)[0].email,
  role:"VIEWER"});
 await ok("/api/local/config/team/accept",{token:invite.token},viewer.cookie);
 const denied=await post("/api/local/ops/readiness",{businessId},viewer.cookie);
 assert.equal(denied.status,403);
 const alien=await signup("phase8-alien-"+randomUUID()+"@example.local");
 const cross=await post("/api/local/ops/readiness",{businessId},alien.cookie);
 assert.equal(cross.status,403);
});
test("global session revocation deletes active server sessions and invalidates the browser cookie",async()=>{
 const user=await fetch(base+"/api/local/auth/user",{headers:{Cookie:cookie}});
 assert.equal((await user.json()).data.id,userId);
 const revoked=await post("/api/local/ops/revoke-sessions",{},cookie);
 assert.equal(revoked.status,200,JSON.stringify(revoked.body));
 assert.ok(revoked.body.data.revokedCount>=1);
 assert.match(revoked.cookie,/Max-Age=0/);
 const afterLogout=await fetch(base+"/api/local/auth/user",{headers:{Cookie:cookie}});
 assert.equal((await afterLogout.json()).data,null);
 const denied=await post("/api/local/ops/readiness",{businessId},cookie);
 assert.equal(denied.status,401);
});
