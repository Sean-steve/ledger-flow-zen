import assert from "node:assert/strict";
import { after,before,test } from "node:test";
import { randomUUID } from "node:crypto";
import { database } from "../../server/local/database.mjs";
import { createLocalApiServer } from "../../server/local/api.mjs";
import {
 mpesaRuntime,saveMpesaProfile,createMpesaRequest,simulateMpesaConfirmation,
 receiveStkCallback,receiveC2bConfirmation,
} from "../../server/local/mpesa-payments.mjs";
import {
 callbackTokenMatches,kenyaPhone,parseStkCallback,parseC2bConfirmation,
 publicCallbackBase,
} from "../../server/local/mpesa-daraja.mjs";
import { sendCommunication } from "../../server/local/communications.mjs";

const ORIGIN=process.env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000";
const testEnv={
 FDOS_MPESA_MODE:"sandbox",FDOS_MPESA_SANDBOX_APPROVED:"YES",
 FDOS_MPESA_SHORTCODE:"174379",FDOS_MPESA_SHORTCODE_TYPE:"PAYBILL",
 FDOS_MPESA_CONSUMER_KEY:"test-key",FDOS_MPESA_CONSUMER_SECRET:"test-secret",
 FDOS_MPESA_PASSKEY:"sandbox-passkey",
 FDOS_MPESA_PUBLIC_BASE:"https://callbacks.example.test",
 FDOS_MPESA_CALLBACK_TOKEN:"a".repeat(48),
};
let server,base,cookie,businessId,clientId,invoiceId,userId,secondInvoiceId;
async function post(path,data={},options={}){
 const response=await fetch(base+path,{method:"POST",headers:{
  "Content-Type":"application/json",Origin:options.origin??ORIGIN,
  ...(options.cookie?{Cookie:options.cookie}:options.noCookie?{}:cookie?{Cookie:cookie}:{})},
  body:JSON.stringify(data)});
 return {status:response.status,data:await response.json(),cookie:response.headers.get("set-cookie")};
}
async function ok(path,data={}){
 const r=await post(path,data);
 assert.equal(r.status,200,JSON.stringify(r.data));
 return r.data.data;
}
const api=(action,body)=>ok("/api/local/mpesa/"+action,body);
async function createInvoice(amount=1000){
 const draft=await ok("/api/local/rpc",{name:"save_document_draft",args:{
 _business_id:businessId,_client_id:clientId,_document_id:null,
 _payload:{type:"INVOICE",currency:"KES",issue_date:"2026-11-06",
  template_id:"executive-atelier",payment_terms_days:30,exchange_rate:1},
 _items:[{position:1,description:"M-Pesa integration test",
  quantity:1,unit_price:amount,tax_category:"ZERO_RATED",discount_pct:0}],
 }});
 const issued=await ok("/api/local/rpc",{name:"finalize_document",args:{_document_id:draft.id}});
 assert.equal(issued.status,"ISSUED");return issued.id;
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
test("production M-Pesa is fail-closed; preview needs no provider credentials",()=>{
 assert.equal(mpesaRuntime({}).mode,"PREVIEW");
 assert.equal(mpesaRuntime({}).productionEnabled,false);
 assert.throws(()=>mpesaRuntime({FDOS_MPESA_MODE:"live"}),/production is disabled/);
 assert.equal(kenyaPhone("0712345678"),"254712345678");
 assert.equal(kenyaPhone("+254712345678"),"254712345678");
 assert.throws(()=>kenyaPhone("+1 212 555 0144"));
 assert.equal(callbackTokenMatches("a".repeat(48),testEnv),true);
 assert.equal(callbackTokenMatches("b".repeat(48),testEnv),false);
 assert.throws(()=>publicCallbackBase({...testEnv,FDOS_MPESA_PUBLIC_BASE:"http://localhost:5012"}));
});
test("creates local business, client, issued invoice and shortcode profile",async()=>{
 const r=await post("/api/local/auth/signup",{
  email:"mpesa-"+randomUUID()+"@example.local",
  password:"secure-phase-five-1234",
 });
 assert.equal(r.status,200);cookie=r.cookie.split(";")[0];
 userId=r.data.data.id;
 const b=await ok("/api/local/rpc",{name:"create_business",args:{
  _name:"M-Pesa QA Business",_base_currency:"KES"}});
 businessId=b.id;
 const c=await ok("/api/local/query",{table:"clients",mode:"insert",single:true,
  values:{business_id:businessId,name:"Lipa Customer",currency:"KES",
   phone:"0712345678",email:"mpesa-customer@example.test"}});
 clientId=c.id;
 invoiceId=await createInvoice(1000);
 const p=await api("profile/update",{
  businessId,shortcode:"174379",shortcodeType:"PAYBILL"});
 assert.equal(p.shortcode,"174379");
 secondInvoiceId=await createInvoice(1000);
});
test("rejects overpayment, bad phone, non-KES and repeated keys with changed details",async()=>{
 const over=await post("/api/local/mpesa/request",{
  businessId,invoiceId,phone:"0712345678",amount:1001,requestKey:randomUUID()});
 assert.equal(over.status,400);
 const bad=await post("/api/local/mpesa/request",{
  businessId,invoiceId,phone:"123",amount:100,requestKey:randomUUID()});
 assert.equal(bad.status,400);
 const key=randomUUID();
 const first=await api("request",{
  businessId,invoiceId,phone:"0712345678",amount:150,requestKey:key});
 assert.equal(first.status,"PREVIEW");
 const same=await api("request",{
  businessId,invoiceId,phone:"0712345678",amount:150,requestKey:key});
 assert.equal(same.id,first.id);
 assert.equal(same.duplicate,true);
 const collision=await post("/api/local/mpesa/request",{
  businessId,invoiceId,phone:"0712345678",amount:151,requestKey:key});
 assert.equal(collision.status,409);
});
test("local simulation uses existing ledger RPC for partial allocation and automatic receipt",async()=>{
 const row=await api("request",{
  businessId,invoiceId,phone:"0712345678",amount:400,requestKey:randomUUID()});
 assert.equal(row.mode,"PREVIEW");
 assert.equal(row.receiptId,null);
 const beforePayments=await ok("/api/local/query",{table:"payments",
  filters:[{field:"business_id",value:businessId}]});
 assert.equal(beforePayments.length,0);
 const confirmed=await api("simulate",{businessId,intentId:row.id});
 assert.equal(confirmed.status,"CONFIRMED");
 assert.match(confirmed.providerReceipt,/^SIM/);
 assert.ok(confirmed.paymentId&&confirmed.receiptId);
 const again=await api("simulate",{businessId,intentId:row.id});
 assert.equal(again.id,confirmed.id);
 assert.equal(again.duplicate,true);
 const result=await ok("/api/local/query",{table:"payments",
  filters:[{field:"id",value:confirmed.paymentId}],single:true});
 assert.equal(Number(result.amount),400);
 assert.match(result.notes,/SIMULATED LOCAL TEST/);
 const rec=await ok("/api/local/query",{table:"receipts",
  filters:[{field:"id",value:confirmed.receiptId}],single:true});
 assert.equal(rec.payment_id,confirmed.paymentId);
 const ledger=await ok("/api/local/query",{table:"invoice_ledger",
  filters:[{field:"invoice_id",value:invoiceId}],single:true});
 assert.equal(Number(ledger.balance),600);
});
test("test receipts cannot be sent via live email or WhatsApp",async()=>{
 const row=(await api("intents",{businessId})).find(x=>x.status==="CONFIRMED"&&x.mode==="PREVIEW");
 await assert.rejects(()=>sendCommunication(userId,{
  businessId,receiptId:row.receiptId,channel:"EMAIL",requestKey:randomUUID(),
 },{env:{FDOS_COMM_MODE:"live",FDOS_PUBLIC_APP_URL:"https://documents.example.com",
  RESEND_API_KEY:"no-call",FDOS_EMAIL_FROM:"FDOS <billing@example.com>"},
  transport:async()=>{throw Error("should never make provider request");}
 }),/Test receipts cannot be delivered/);
});
test("sandbox mode requires approved credentials; STK acknowledgment is not payment",async()=>{
 await assert.rejects(()=>createMpesaRequest(userId,{
  businessId,invoiceId:secondInvoiceId,phone:"0712345678",amount:300,
  requestKey:randomUUID(),
 },{env:{FDOS_MPESA_MODE:"sandbox"}}),/sandbox credentials/);
 let calls=[];
 const transport=async (url,opts)=>{
  calls.push({url,opts});
  if(url.includes("oauth"))return {ok:true,json:async()=>({access_token:"sandbox-token"})};
  if(url.includes("stkpush/v1/processrequest"))return {ok:true,json:async()=>({
   ResponseCode:"0",MerchantRequestID:"MRTEST0001",CheckoutRequestID:"CHKTEST00001",
  })};
  throw Error("Unknown external transport");
 };
 const row=await createMpesaRequest(userId,{
  businessId,invoiceId:secondInvoiceId,phone:"0712345678",amount:300,requestKey:randomUUID(),
 },{env:testEnv,transport});
 assert.equal(row.status,"PENDING");
 assert.equal(row.paymentId,null);
 assert.equal(row.checkoutRequestId,"CHKTEST00001");
 assert.equal(calls.length,2);
 const sent=JSON.parse(calls[1].opts.body);
 assert.equal(sent.PhoneNumber,"254712345678");
 assert.equal(sent.BusinessShortCode,"174379");
 assert.equal(sent.CallBackURL,"https://callbacks.example.test/api/provider/mpesa/stk/"+"a".repeat(48));
 const ledger=await ok("/api/local/query",{table:"invoice_ledger",
  filters:[{field:"invoice_id",value:secondInvoiceId}],single:true});
 assert.equal(Number(ledger.balance),1000);
});
test("mismatched STK confirmation is quarantined, not financially posted",async()=>{
 const cb={Body:{stkCallback:{
  CheckoutRequestID:"CHKTEST00001",MerchantRequestID:"MRTEST0001",
  ResultCode:0,CallbackMetadata:{Item:[
    {Name:"Amount",Value:500},{Name:"MpesaReceiptNumber",Value:"NLJ7RT61SV"},
    {Name:"PhoneNumber",Value:254712345678},
  ]},
 }}};
 const row=await receiveStkCallback(cb,testEnv,{transport:async()=>{throw Error("No query for mismatch")}});
 assert.equal(row.status,"REVIEW_REQUIRED");
 assert.equal(row.paymentId,null);
});
test("STK status query verifies callback result and posted payment exactly once",async()=>{
 const transport=async(url)=>{
  if(url.includes("oauth"))return {ok:true,json:async()=>({access_token:"token"})};
  if(url.includes("stkpush/v1/processrequest"))return {ok:true,json:async()=>({
    ResponseCode:"0",MerchantRequestID:"MRTEST0002",CheckoutRequestID:"CHKTEST00002",
  })};
  if(url.includes("stkpushquery"))return {ok:true,json:async()=>({
    ResponseCode:"0",ResultCode:"0",CheckoutRequestID:"CHKTEST00002",
  })};
  throw Error("Invalid request");
 };
 const pending=await createMpesaRequest(userId,{
  businessId,invoiceId:secondInvoiceId,phone:"0712345678",amount:500,requestKey:randomUUID(),
 },{env:testEnv,transport});
 assert.equal(pending.status,"PENDING");
 const cb={Body:{stkCallback:{
  CheckoutRequestID:"CHKTEST00002",MerchantRequestID:"MRTEST0002",
  ResultCode:0,CallbackMetadata:{Item:[
    {Name:"Amount",Value:500},{Name:"MpesaReceiptNumber",Value:"NLJ7RT61SW"},
    {Name:"PhoneNumber",Value:254712345678},
  ]},
 }}};
 assert.equal(parseStkCallback(cb).receipt,"NLJ7RT61SW");
 const verified=await receiveStkCallback(cb,testEnv,{transport});
 assert.equal(verified.status,"CONFIRMED");
 assert.equal(verified.providerReceipt,"NLJ7RT61SW");
 assert.ok(verified.paymentId&&verified.receiptId);
 const replay=await receiveStkCallback(cb,testEnv,{transport});
 assert.equal(replay.duplicate,true);
 const ledger=await ok("/api/local/query",{table:"invoice_ledger",
  filters:[{field:"invoice_id",value:secondInvoiceId}],single:true});
 assert.equal(Number(ledger.balance),500);
 const payment=await ok("/api/local/query",{table:"payments",
  filters:[{field:"id",value:verified.paymentId}],single:true});
 assert.match(payment.notes,/DARAJA SANDBOX TEST/);
});
test("failed and unknown STK query outcomes never create a payment or receipt",async()=>{
 const transport=async(url)=>{
  if(url.includes("oauth"))return {ok:true,json:async()=>({access_token:"token"})};
  if(url.includes("stkpush/v1/processrequest"))return {ok:true,json:async()=>({
    ResponseCode:"0",MerchantRequestID:"MRTEST0003",CheckoutRequestID:"CHKTEST00003",
  })};
  if(url.includes("stkpushquery"))return {ok:true,json:async()=>({ResponseCode:"0"})};
  throw Error("Invalid request");
 };
 const pending=await createMpesaRequest(userId,{
  businessId,invoiceId:secondInvoiceId,phone:"0712345678",amount:100,requestKey:randomUUID(),
 },{env:testEnv,transport});
 const cb={Body:{stkCallback:{
  CheckoutRequestID:"CHKTEST00003",MerchantRequestID:"MRTEST0003",
  ResultCode:0,CallbackMetadata:{Item:[
    {Name:"Amount",Value:100},{Name:"MpesaReceiptNumber",Value:"NLJ7RT61SX"},
    {Name:"PhoneNumber",Value:254712345678},
  ]},
 }}};
 const uncertain=await receiveStkCallback(cb,testEnv,{transport});
 assert.equal(uncertain.status,"UNKNOWN");
 assert.equal(uncertain.paymentId,null);
 const retry=await createMpesaRequest(userId,{
  businessId,invoiceId:secondInvoiceId,phone:"0712345678",amount:100,requestKey:pending.id
 },{env:testEnv,transport});
 assert.notEqual(retry.status,"CONFIRMED");
});
test("C2B Paybill callbacks are inbox-only and deduplicated; never auto-settle invoices",async()=>{
 assert.throws(()=>parseC2bConfirmation({BusinessShortCode:"174379",TransID:"bad",TransAmount:"abc"}));
 const body={
  BusinessShortCode:"174379",TransID:"SGJ83JS29K",TransAmount:"725.00",
  BillRefNumber:"INV-LOCAL-1",MSISDN:"254712345678",
 };
 const first=await receiveC2bConfirmation(body,testEnv);
 assert.equal(first.status,"REVIEW_REQUIRED");
 assert.equal(first.duplicate,false);
 const second=await receiveC2bConfirmation(body,testEnv);
 assert.equal(second.duplicate,true);
 const inbox=await api("inbox",{businessId});
 assert.ok(inbox.some(x=>x.provider_receipt==="SGJ83JS29K"&&x.status==="REVIEW_REQUIRED"));
 const noPay=await database`SELECT COUNT(*)::int AS count FROM public.payments
   WHERE channel_txn_id='SGJ83JS29K'`;
 assert.equal(noPay[0].count,0);
});
test("callback is secret-gated and cannot bypass browser Origin or tenant role",async()=>{
 const webhook=await post("/api/provider/mpesa/stk/bad",{Body:{}});
 assert.equal(webhook.status,404);
 const unauthorized=await post("/api/local/mpesa/request",{
  businessId,invoiceId,phone:"0712345678",amount:25,requestKey:randomUUID()
 },{noCookie:true});
 assert.equal(unauthorized.status,401);
 const evil=await post("/api/local/mpesa/request",{
  businessId,invoiceId,phone:"0712345678",amount:25,requestKey:randomUUID()
 },{origin:"https://evil.example"});
 assert.equal(evil.status,403);
 const newuser=await post("/api/local/auth/signup",{
  email:"other-"+randomUUID()+"@example.local",password:"new-user-password-555",
 });
 const cookie2=newuser.cookie.split(";")[0];
 const list=await post("/api/local/mpesa/intents",{businessId},{cookie:cookie2});
 assert.equal(list.status,200);assert.deepEqual(list.data.data,[]);
 const send=await post("/api/local/mpesa/request",{
  businessId,invoiceId,phone:"0712345678",amount:25,requestKey:randomUUID(),
 },{cookie:cookie2});
 assert.equal(send.status,403);
});
