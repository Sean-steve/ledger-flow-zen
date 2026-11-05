import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before,after,test } from "node:test";
import { database } from "../../server/local/database.mjs";
import { createLocalApiServer } from "../../server/local/api.mjs";
import {
 fiscalConfig,getFiscalProfile,prepareFiscalSubmission,
} from "../../server/local/fiscal-etims.mjs";
import {
 fiscalRuntime,validateKraPin,callOsCuSandbox,
} from "../../server/local/fiscal-oscu-bridge.mjs";

let server,base,cookie,userId,businessId,clientId,invoiceId,creditId;
const ORIGIN=process.env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000";
async function post(path,body={},cookieOverride=cookie){
 const response=await fetch(base+path,{method:"POST",
  headers:{"Content-Type":"application/json",Origin:ORIGIN,
   ...(cookieOverride?{Cookie:cookieOverride}:{})},
  body:JSON.stringify(body)});
 return {status:response.status,body:await response.json(),cookie:response.headers.get("set-cookie")};
}
async function ok(path,body={}){
 const response=await post(path,body);
 assert.equal(response.status,200,JSON.stringify(response.body));
 return response.body.data;
}
const fiscal=(path,body)=>ok("/api/local/fiscal/"+path,body);
const sandboxEnv={
 FDOS_ETIMS_MODE:"sandbox",FDOS_ETIMS_APPROVED_SANDBOX:"YES",
 FDOS_ETIMS_BRIDGE_URL:"http://127.0.0.1:5056",
 FDOS_ETIMS_BRIDGE_TOKEN:"long-local-authorized-test-bridge-key",
 FDOS_ETIMS_KRA_CERTIFIED:"NO",
};
function approvedResponse(reference="SBOX-RECEIPT-1"){
 return {ok:true,status:200,json:async()=>({
  contract:"fdos-oscu-sandbox-v1",environment:"SANDBOX",solution:"OSCU",
  status:"ACCEPTED",scuId:"SANDBOX-DEVICE-TEST",
  receiptNumber:reference,signature:"TEST_SIGNATURE_NOT_REAL",
  internalData:"TEST_NONPRODUCTION_INTERNAL",bridgeReference:"TEST-BRIDGE-1",
 })};
}
async function createInvoice(type="INVOICE",extra={}){
 const draft=await ok("/api/local/rpc",{name:"save_document_draft",args:{
  _business_id:businessId,_client_id:clientId,_document_id:null,
  _payload:{type,currency:"KES",issue_date:"2026-11-05",
   template_id:"executive-atelier",payment_terms_days:30,
   exchange_rate:1,...extra},
  _items:[{position:1,description:"Services",
    quantity:1,unit_price:1000,tax_category:"VAT_16",discount_pct:0}],
 }});
 const issued=await ok("/api/local/rpc",{name:type==="CREDIT_NOTE"?
  "issue_credit_note":"finalize_document",args:{
   [type==="CREDIT_NOTE"?"_credit_note_id":"_document_id"]:draft.id,
 }});
 assert.equal(issued.status,"ISSUED");
 return issued.id;
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
test("preview mode is fail closed; OSCU never claims production eTIMS",async()=>{
 assert.equal(fiscalRuntime({}).mode,"PREVIEW");
 assert.equal(fiscalRuntime({FDOS_ETIMS_MODE:"production"}).productionEnabled,undefined);
});
test("validates KRA PIN and the sandbox bridge cannot connect over public HTTP",async()=>{
 assert.equal(validateKraPin("p123456789z"),"P123456789Z");
 assert.throws(()=>validateKraPin("X123456789Z"));
 assert.throws(()=>validateKraPin(""));
 assert.equal(validateKraPin(null,true),null);
 await assert.rejects(()=>callOsCuSandbox({},"foo",{
  ...sandboxEnv,FDOS_ETIMS_BRIDGE_URL:"http://example.com",
 }),/OSCU bridge/);
});
test("creates a business, stores valid KRA PIN and issued invoice",async()=>{
 const signup=await post("/api/local/auth/signup",{
  email:"kra-"+randomUUID()+"@example.local",
  password:"local-fiscal-password-99",fullName:"Fiscal Tester",
 });
 assert.equal(signup.status,200,JSON.stringify(signup.body));
 userId=signup.body.data.id;cookie=signup.cookie.split(";")[0];
 const business=await ok("/api/local/rpc",{name:"create_business",
   args:{_name:"Sandbox Fiscal Test",_base_currency:"KES"}});
 businessId=business.id;
 const updated=await ok("/api/local/query",{table:"businesses",mode:"update",
  filters:[{field:"id",value:businessId}],
  values:{kra_pin:"P123456789Z"},single:true});
 assert.equal(updated.kra_pin,"P123456789Z");
 const client=await ok("/api/local/query",{table:"clients",mode:"insert",single:true,
  values:{business_id:businessId,name:"Fiscal Client",email:"fiscal@example.test",
   kra_pin:"A123456789Z",currency:"KES"}});
 clientId=client.id;
 invoiceId=await createInvoice("INVOICE");
});
test("preview creates a fingerprinted record without KRA codes or bridge network",async()=>{
 const runtime=await fiscal("config");
 assert.equal(runtime.mode,"PREVIEW");
 const preview=await fiscal("prepare",{
  businessId,documentId:invoiceId,requestKey:randomUUID(),mode:"PREVIEW",
 });
 assert.equal(preview.status,"PREVIEW");
 assert.equal(preview.sandboxReceiptNumber,null);
 assert.match(preview.snapshotSha256,/^[a-f0-9]{64}$/);
 const rows=await fiscal("document",{businessId,documentId:invoiceId});
 assert.equal(rows.length,1);assert.equal(rows[0].status,"PREVIEW");
 const doc=await ok("/api/local/query",{table:"documents",
  filters:[{field:"id",value:invoiceId}],single:true});
 assert.equal(doc.kra_status,"NOT_CONFIGURED");
 assert.equal(doc.kra_control_code,null);
 const snap=await database`SELECT snapshot FROM public.fiscal_submissions
  WHERE document_id=${invoiceId}::uuid AND mode='PREVIEW'`;
 assert.equal(snap[0].snapshot.taxpayerPin,"P123456789Z");
 assert.equal(snap[0].snapshot.items.length,1);
 assert.equal(snap[0].snapshot.total,"1160.00");
});
test("preview idempotency blocks conflicting key use",async()=>{
 const key=randomUUID();
 const first=await fiscal("prepare",{
  businessId,documentId:invoiceId,requestKey:key,mode:"PREVIEW",
 });
 assert.equal(first.duplicate,true);
 const other=await createInvoice();
 const replay=await post("/api/local/fiscal/prepare",{
  businessId,documentId:other,requestKey:key,mode:"PREVIEW",
 });
 // Since the first invocation returned an existing record with a different
 // requestKey, it did not reserve the key. The other document may claim it.
 assert.equal(replay.status,200);
 const wrong=await post("/api/local/fiscal/prepare",{
  businessId,documentId:invoiceId,requestKey:key,mode:"PREVIEW",
 });
 assert.equal(wrong.status,409);
});
test("business owner can configure tax codes but cannot mark certification",async()=>{
 const bad=await post("/api/local/fiscal/profile/update",{
  businessId,branchId:"illegal",deviceSerial:"DEV1234",taxMapping:{VAT_16:"B"},
 });
 assert.equal(bad.status,400);
 const profile=await fiscal("profile/update",{
  businessId,branchId:"00",deviceSerial:"OSCU-TEST-DEVICE",
  taxMapping:{VAT_16:"B",ZERO_RATED:"A",EXEMPT:"D",VAT_8:"C"},
  certificationState:"CERTIFIED",
 });
 assert.equal(profile.branchId,"00");
 assert.equal(profile.deviceSerial,"OSCU-TEST-DEVICE");
 assert.equal(profile.certificationState,"UNVERIFIED");
 const saved=await getFiscalProfile(userId,{businessId});
 assert.equal(saved.taxMapping.VAT_16,"B");
});
test("sandbox blocked unless operator explicitly enables approved sidecar",async()=>{
 const blocked=await post("/api/local/fiscal/prepare",{
  businessId,documentId:invoiceId,requestKey:randomUUID(),mode:"SANDBOX",
 });
 assert.equal(blocked.status,403);
 assert.equal((await fiscal("document",{businessId,documentId:invoiceId})).length,1);
});
test("mock OSCU sandbox acceptance creates test evidence, not fiscalized invoice",async()=>{
 let calls=0;
 const receipt=await prepareFiscalSubmission(userId,{
  businessId,documentId:invoiceId,mode:"SANDBOX",requestKey:randomUUID(),
 },{env:sandboxEnv,transport:async(url,init)=>{
  calls++;
  assert.equal(url,"http://127.0.0.1:5056/v1/fiscalize");
  const data=JSON.parse(init.body);
  assert.equal(data.environment,"SANDBOX");
  assert.equal(data.fiscalSnapshot.taxpayerPin,"P123456789Z");
  assert.equal(data.fiscalSnapshot.items[0].taxCode,"B");
  return approvedResponse();
 }});
 assert.equal(receipt.status,"SANDBOX_ACKNOWLEDGED");
 assert.equal(receipt.sandboxReceiptNumber,"SBOX-RECEIPT-1");
 const another=await prepareFiscalSubmission(userId,{
  businessId,documentId:invoiceId,mode:"SANDBOX",requestKey:randomUUID(),
 },{env:sandboxEnv,transport:async()=>{calls++;throw Error("Duplicate call");}});
 assert.equal(another.duplicate,true);
 assert.equal(calls,1);
 const doc=await ok("/api/local/query",{table:"documents",
  filters:[{field:"id",value:invoiceId}],single:true});
 assert.equal(doc.kra_status,"NOT_CONFIGURED");
 assert.equal(doc.kra_control_code,null);
});
test("credit note cannot claim a sandbox receipt from another original invoice",async()=>{
 creditId=await createInvoice("CREDIT_NOTE",{
  parent_document_id:invoiceId,reason:"Services partly returned",
 });
 const preview=await fiscal("prepare",{
  businessId,documentId:creditId,mode:"PREVIEW",requestKey:randomUUID(),
 });
 assert.equal(preview.status,"PREVIEW");
 const record=await prepareFiscalSubmission(userId,{
  businessId,documentId:creditId,mode:"SANDBOX",requestKey:randomUUID(),
 },{env:sandboxEnv,transport:async()=>approvedResponse("SANDBOX-CREDIT-1")});
 assert.equal(record.status,"SANDBOX_ACKNOWLEDGED");
 const payload=await database`SELECT snapshot FROM public.fiscal_submissions
    WHERE document_id=${creditId}::uuid AND mode='SANDBOX'`;
 assert.equal(payload[0].snapshot.receiptLabel,"NC");
 assert.equal(payload[0].snapshot.original.sandboxReceiptNumber,"SBOX-RECEIPT-1");
 assert.equal(payload[0].snapshot.total,"-1160.00");
});
test("uncertain responses preserve review-only state with no fake signature",async()=>{
 const id=await createInvoice();
 const pending=await prepareFiscalSubmission(userId,{
  businessId,documentId:id,mode:"SANDBOX",requestKey:randomUUID(),
 },{env:sandboxEnv,transport:async()=>({
  ok:true,status:200,json:async()=>({status:"ACCEPTED",environment:"PRODUCTION",solution:"OSCU"}),
 })});
 assert.equal(pending.status,"UNKNOWN");
 assert.equal(pending.errorCode,"UNVERIFIED_BRIDGE_PROVENANCE");
 assert.equal(pending.sandboxScuId,null);
 const events=await database`SELECT event_type FROM public.fiscal_events
   WHERE submission_id=${pending.id}::uuid ORDER BY id`;
 assert.deepEqual(events.map(x=>x.event_type),["SANDBOX_SUBMITTED","SANDBOX_UNKNOWN"]);
});
test("cross-business member cannot read fiscal records or send requests",async()=>{
 const user=await post("/api/local/auth/signup",{
  email:"stranger-"+randomUUID()+"@example.local",password:"different-fiscal-password-99",
 });
 assert.equal(user.status,200);
 const otherCookie=user.cookie.split(";")[0];
 const list=await post("/api/local/fiscal/submissions",{businessId},otherCookie);
 assert.equal(list.status,200);
 assert.deepEqual(list.body.data,[]);
 const details=await post("/api/local/fiscal/profile",{businessId},otherCookie);
 assert.equal(details.status,403);
 const blocked=await post("/api/local/fiscal/prepare",{
  businessId,documentId:invoiceId,mode:"PREVIEW",requestKey:randomUUID(),
 },otherCookie);
 assert.equal(blocked.status,403);
});
