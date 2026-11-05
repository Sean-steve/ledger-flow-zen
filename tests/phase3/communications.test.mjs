import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before,after,test } from "node:test";
import { database } from "../../server/local/database.mjs";
import { createLocalApiServer } from "../../server/local/api.mjs";
import { sendCommunication } from "../../server/local/communications.mjs";
import {
 normalizePhone,resolvePublicBase,providerAvailability,sendToProvider,
} from "../../server/local/communication-providers.mjs";

let server,base,cookie,userId,businessId,clientId,documentId;
const origin=process.env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000";
async function post(path,data={},cookieHeader=cookie){
 const response=await fetch(base+path,{
  method:"POST",headers:{"Content-Type":"application/json","Origin":origin,
    ...(cookieHeader?{"Cookie":cookieHeader}:{})},
  body:JSON.stringify(data),
 });
 return {status:response.status,data:await response.json(),cookie:response.headers.get("set-cookie")};
}
async function ok(path,data={}){
 const response=await post(path,data);
 assert.equal(response.status,200,JSON.stringify(response.data));
 return response.data.data;
}
const comm=(action,data)=>ok("/api/local/communications/"+action,data);
before(async()=>{
 server=createLocalApiServer();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 base="http://127.0.0.1:"+server.address().port;
});
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 await database.end({timeout:5});
});
test("default provider mode never sends and rejects private non-HTTPS public URLs",()=>{
 assert.equal(providerAvailability({FDOS_COMM_MODE:"preview"}).mode,"preview");
 for(const host of ["http://example.com","https://localhost","https://127.0.0.1",
     "https://192.168.1.12","https://example.com/hidden"]) {
   assert.throws(()=>resolvePublicBase({FDOS_PUBLIC_APP_URL:host}));
 }
 assert.equal(resolvePublicBase({FDOS_PUBLIC_APP_URL:"https://docs.example.com"}),"https://docs.example.com");
 assert.equal(normalizePhone("0712 345 678"),"254712345678");
 assert.equal(normalizePhone("+254712345678"),"254712345678");
});
test("creates a local user, owner business, client and issued invoice",async()=>{
 const signup=await post("/api/local/auth/signup",{
  email:"comms-"+randomUUID()+"@example.local",
  password:"valid-local-password-123",fullName:"Communications Test",
 });
 assert.equal(signup.status,200,JSON.stringify(signup.data));
 userId=signup.data.data.id;
 cookie=signup.cookie.split(";")[0];
 const business=await ok("/api/local/rpc",{name:"create_business",
  args:{_name:"Phase 3 Test Co",_base_currency:"KES"}});
 businessId=business.id;
 const client=await ok("/api/local/query",{table:"clients",mode:"insert",single:true,
  values:{business_id:businessId,name:"Paying Customer",
   email:"paying@example.test",phone:"+254712345678",currency:"KES"}});
 clientId=client.id;
 const draft=await ok("/api/local/rpc",{name:"save_document_draft",args:{
  _business_id:businessId,_client_id:clientId,_document_id:null,
  _payload:{type:"INVOICE",currency:"KES",issue_date:"2026-11-05",
   template_id:"executive-atelier",payment_terms_days:30,exchange_rate:1},
  _items:[{position:1,description:"Engineering",quantity:1,unit_price:2500,
    tax_category:"VAT_16",discount_pct:0}],
 }});
 documentId=draft.id;
 const issue=await ok("/api/local/rpc",{name:"finalize_document",args:{_document_id:documentId}});
 assert.equal(issue.status,"ISSUED");
});
test("preview send persists without contacting providers or creating public share",async()=>{
 const beforeLinks=await ok("/api/local/query",{table:"share_links",
   filters:[{field:"document_id",value:documentId}]});
 const requestKey=randomUUID();
 const record=await comm("send",{businessId,documentId,requestKey,channel:"EMAIL"});
 assert.equal(record.status,"PREVIEW");
 assert.equal(record.provider_id,null);
 assert.match(record.preview_text,/Nothing sent/);
 const again=await comm("send",{businessId,documentId,requestKey,channel:"EMAIL"});
 assert.equal(again.id,record.id);
 assert.equal(again.duplicate,true);
 const afterLinks=await ok("/api/local/query",{table:"share_links",
   filters:[{field:"document_id",value:documentId}]});
 assert.equal(afterLinks.length,beforeLinks.length);
 const logs=await comm("outbox",{businessId});
 assert.ok(logs.some(row=>row.id===record.id));
});
test("records WhatsApp consent with source and revokes it",async()=>{
 const old=await comm("preferences",{businessId,clientId});
 assert.equal(old.whatsappOptedIn,false);
 const invalid=await post("/api/local/communications/preferences/update",{
  businessId,clientId,channel:"WHATSAPP",optedIn:true,source:"UNKNOWN",
 });
 assert.equal(invalid.status,400);
 const opted=await comm("preferences/update",{
  businessId,clientId,channel:"WHATSAPP",optedIn:true,source:"DIRECT_REQUEST",
 });
 assert.equal(opted.whatsappOptedIn,true);
 assert.equal(opted.whatsappSource,"DIRECT_REQUEST");
 const optedOut=await comm("preferences/update",{
  businessId,clientId,channel:"WHATSAPP",optedIn:false,
 });
 assert.equal(optedOut.whatsappOptedIn,false);
 const restarted=await comm("preferences/update",{
  businessId,clientId,channel:"WHATSAPP",optedIn:true,source:"WRITTEN",
 });
 assert.equal(restarted.whatsappOptedIn,true);
});
test("validates providers' request payloads without external network access",async()=>{
 const env={
  FDOS_COMM_MODE:"live",FDOS_PUBLIC_APP_URL:"https://fdos.example",
  RESEND_API_KEY:"test-resend-token",
  FDOS_EMAIL_FROM:"FDOS <invoices@example.com>",
  META_WA_TOKEN:"test-meta-token",META_WA_PHONE_NUMBER_ID:"12345678901234",
  META_WA_GRAPH_VERSION:"v23.0",FDOS_WA_TEMPLATE_DOCUMENT:"document_notice",
  FDOS_WA_TEMPLATE_RECEIPT:"receipt_notice",
  FDOS_WA_LANGUAGE:"en_US",
 };
 let calls=[];
 const fake=async (url,config)=>{
  calls.push({url,headers:config.headers,body:JSON.parse(config.body)});
  return {ok:true,status:200,json:async()=>url.includes("resend")?
    {id:"email-id"}:{messages:[{id:"wamid-test"}]}};
 };
 const opts={
  recipient:"paying@example.test",subject:"INVOICE INV-123 from FDOS",
  customerName:"A & B <C>",businessName:"FDOS",
  shareUrl:"https://fdos.example/share/abc",kind:"document",requestKey:randomUUID(),
  reference:"INV-123",
 };
 const mail=await sendToProvider({channel:"EMAIL",...opts},env,fake);
 assert.equal(mail.id,"email-id");
 assert.match(calls[0].body.html,/A &amp; B &lt;C&gt;/);
 assert.equal(calls[0].headers["Idempotency-Key"],opts.requestKey);
 const wa=await sendToProvider({...opts,recipient:"+254712345678",channel:"WHATSAPP"},env,fake);
 assert.equal(wa.id,"wamid-test");
 assert.equal(calls[1].body.type,"template");
 assert.equal(calls[1].body.to,"254712345678");
 assert.equal(calls[1].body.template.name,"document_notice");
 assert.equal(calls[1].body.template.components[0].parameters.length,3);
});
test("live WhatsApp send enforces opt-in; retries return same outbox",async()=>{
 const env={
  FDOS_COMM_MODE:"live",FDOS_PUBLIC_APP_URL:"https://fdos.example",
  RESEND_API_KEY:"test-resend-token",FDOS_EMAIL_FROM:"FDOS <invoices@example.com>",
  META_WA_TOKEN:"test-meta-token",META_WA_PHONE_NUMBER_ID:"12345678901234",
  FDOS_WA_TEMPLATE_DOCUMENT:"document_notice",FDOS_WA_TEMPLATE_RECEIPT:"receipt_notice",
  META_WA_GRAPH_VERSION:"v23.0",
 };
 const key=randomUUID();
 let sends=0;
 const transport=async()=>{sends++;return {ok:true,status:200,json:async()=>({messages:[{id:"wamid-live-test"}]})};};
 const row=await sendCommunication(userId,{
  businessId,documentId,channel:"WHATSAPP",requestKey:key,
 },{env,transport});
 assert.equal(row.status,"ACCEPTED");
 assert.equal(row.delivery_mode,"live");
 assert.equal(row.provider_id,"wamid-live-test");
 assert.equal(sends,1);
 const retry=await sendCommunication(userId,{
  businessId,documentId,channel:"WHATSAPP",requestKey:key,
 },{env,transport});
 assert.equal(retry.duplicate,true);
 assert.equal(sends,1);
 const share=await database`SELECT expires_at>now() AS active FROM public.share_links sl
   JOIN public.communication_outbox o ON o.share_link_id=sl.id
   WHERE o.id=${row.id}::uuid`;
 assert.equal(share[0].active,true);
});
test("receipts can be previewed, but a reversed receipt cannot be sent",async()=>{
 const recorded=await ok("/api/local/rpc",{name:"record_payment_v2",args:{_request:{
  business_id:businessId,client_id:clientId,idempotency_key:randomUUID(),
  amount:"400.00",currency:"KES",channel:"BANK_TRANSFER",
  allocations:[{invoice_id:documentId,amount:"400.00"}],
 }}});
 const receiptId=recorded.receipt.id;
 const preview=await comm("send",{
  businessId,receiptId,channel:"EMAIL",requestKey:randomUUID(),
 });
 assert.equal(preview.status,"PREVIEW");
 assert.match(preview.subject,/RECEIPT/);
 const revoked=await ok("/api/local/rpc",{name:"reverse_payment",args:{
  _payment_id:recorded.payment.id,_reason:"Phase 3 receipt safety validation",
 }});
 assert.ok(revoked);
 const invalid=await post("/api/local/communications/send",{
  businessId,receiptId,channel:"EMAIL",requestKey:randomUUID(),
 });
 assert.equal(invalid.status,400);
 assert.match(invalid.data.error.message,/Voided receipts/);
});
test("live email returns provider-accepted state; rejected/unknown outcomes are never auto-retried",async()=>{
 const env={
  FDOS_COMM_MODE:"live",FDOS_PUBLIC_APP_URL:"https://fdos.example",
  RESEND_API_KEY:"test-resend-token",
  FDOS_EMAIL_FROM:"FDOS <invoices@example.com>",
 };
 let sends=0;
 const payload={businessId,documentId,channel:"EMAIL",requestKey:randomUUID()};
 const accepted=await sendCommunication(userId,payload,{env,transport:async()=>{
  sends++;return {ok:true,status:200,json:async()=>({id:"resend-accepted"})};
 }});
 assert.equal(accepted.status,"ACCEPTED");
 assert.equal(accepted.provider_id,"resend-accepted");
 const repeat=await sendCommunication(userId,payload,{env,transport:async()=>{
  sends++;throw Error("Unexpected duplicate network call");
 }});
 assert.equal(repeat.duplicate,true);
 assert.equal(sends,1);
 const rejected=await sendCommunication(userId,{
  ...payload,requestKey:randomUUID(),
 },{env,transport:async()=>({ok:false,status:422})});
 assert.equal(rejected.status,"FAILED");
 assert.equal(rejected.provider_error_code,"PROVIDER_REJECTED");
 const unknownPayload={...payload,requestKey:randomUUID()};
 let unknownCount=0;
 const uncertain=await sendCommunication(userId,unknownPayload,{env,transport:async()=>{
  unknownCount++;throw Error("connection dropped after send");
 }});
 assert.equal(uncertain.status,"UNKNOWN");
 const repeatUnknown=await sendCommunication(userId,unknownPayload,{env,transport:async()=>{
  unknownCount++;throw Error("Should not retry");
 }});
 assert.equal(repeatUnknown.duplicate,true);
 assert.equal(unknownCount,1);
});
test("email opt-out blocks live delivery and cross tenant outbox reads are RLS restricted",async()=>{
 await comm("preferences/update",{businessId,clientId,channel:"EMAIL",optedIn:false});
 const blocked=await post("/api/local/communications/send",{
  businessId,documentId,channel:"EMAIL",requestKey:randomUUID(),
 });
 assert.equal(blocked.status,400);
 assert.match(blocked.data.error.message,/opted out/i);
 const second=await post("/api/local/auth/signup",{
  email:"other-"+randomUUID()+"@example.local",password:"valid-local-password-123",
 });
 assert.equal(second.status,200);
 const otherCookie=second.cookie.split(";")[0];
 const outbox=await post("/api/local/communications/outbox",{businessId},otherCookie);
 assert.equal(outbox.status,200);
 assert.deepEqual(outbox.data.data,[]);
 const unauthorizedSend=await post("/api/local/communications/send",{
  businessId,documentId,channel:"WHATSAPP",requestKey:randomUUID(),
 },otherCookie);
 assert.equal(unauthorizedSend.status,403);
});
