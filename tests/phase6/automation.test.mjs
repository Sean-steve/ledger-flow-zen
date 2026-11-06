import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {before,after,test} from "node:test";
import {database} from "../../server/local/database.mjs";
import {createLocalApiServer} from "../../server/local/api.mjs";
import {
 automationRuntime,reminderMilestone,runAutomationWorker,dispatchAutomationJob,
} from "../../server/local/automation.mjs";
const ORIGIN=process.env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000";
let server,base,cookie,userId,businessId,clientId,soonId,dueTodayId,lateId;
function localToday(){
 const ps=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Nairobi",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const val=k=>ps.find(x=>x.type===k).value;
 return `${val("year")}-${val("month")}-${val("day")}`;
}
const TODAY=localToday();
const addDays=(day,n)=>new Date(Date.parse(day+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
async function post(path,data={},cookieOverride=cookie,origin=ORIGIN){
 const response=await fetch(base+path,{method:"POST",
  headers:{"Content-Type":"application/json",Origin:origin,
   ...(cookieOverride?{Cookie:cookieOverride}:{})},
  body:JSON.stringify(data)});
 return {status:response.status,body:await response.json(),cookie:response.headers.get("set-cookie")};
}
async function ok(path,data={}){
 const r=await post(path,data);
 assert.equal(r.status,200,JSON.stringify(r.body));
 return r.body.data;
}
const automate=(action,data)=>ok("/api/local/automation/"+action,data);
async function issueInvoice(terms=3,issueDate=TODAY){
 const draft=await ok("/api/local/rpc",{name:"save_document_draft",args:{
  _business_id:businessId,_client_id:clientId,_document_id:null,
  _payload:{type:"INVOICE",currency:"KES",issue_date:issueDate,
    payment_terms_days:terms,template_id:"executive-atelier",exchange_rate:1},
  _items:[{position:1,description:"Recurring invoice service",
    quantity:1,unit_price:1500,tax_category:"ZERO_RATED",discount_pct:0}],
 }});
 const issued=await ok("/api/local/rpc",{name:"finalize_document",args:{_document_id:draft.id}});
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
test("calendar milestones are deterministic and production sending is disabled by default",()=>{
 const p={due_soon_days:3,on_due:true,overdue_every_days:7};
 assert.deepEqual(reminderMilestone(addDays(TODAY,3),TODAY,p),{kind:"DUE_SOON",bucket:"before"});
 assert.deepEqual(reminderMilestone(TODAY,TODAY,p),{kind:"DUE_TODAY",bucket:"due"});
 assert.deepEqual(reminderMilestone(addDays(TODAY,-1),TODAY,p),{kind:"OVERDUE",bucket:"cycle-1"});
 assert.deepEqual(reminderMilestone(addDays(TODAY,-8),TODAY,p),{kind:"OVERDUE",bucket:"cycle-2"});
 assert.equal(reminderMilestone(addDays(TODAY,15),TODAY,p),null);
 assert.equal(automationRuntime({}).mode,"PREVIEW");
 assert.equal(automationRuntime({
  FDOS_AUTOMATION_LIVE_ENABLED:"YES",FDOS_COMM_MODE:"preview",
  FDOS_AUTOMATION_LIVE_APPROVED:"YES",
 }).liveEnabled,false);
});
test("creates owner business and three issued invoices under local PostgreSQL",async()=>{
 const signup=await post("/api/local/auth/signup",{
  email:"automation-"+randomUUID()+"@example.local",
  password:"local-auto-test-password-88",fullName:"Automation Tester",
 });
 assert.equal(signup.status,200,JSON.stringify(signup.body));
 cookie=signup.cookie.split(";")[0];
 userId=signup.body.data.id;
 const business=await ok("/api/local/rpc",{name:"create_business",
   args:{_name:"Automation Test Business",_base_currency:"KES"}});
 businessId=business.id;
 const client=await ok("/api/local/query",{table:"clients",mode:"insert",single:true,
   values:{business_id:businessId,name:"Reminder Customer",
     email:"customer@example.test",phone:"+254712345678",currency:"KES"}});
 clientId=client.id;
 soonId=await issueInvoice(3);
 dueTodayId=await issueInvoice(0);
 lateId=await issueInvoice(3,addDays(TODAY,-10));
});
test("opt-in disabled policy generates no reminders, but in-app events still work",async()=>{
 const policy=await automate("policy",{businessId});
 assert.equal(policy.enabled,false);
 const report=await automate("scan",{businessId});
 assert.equal(report.enabled,false);
 assert.deepEqual(await automate("jobs",{businessId}),[]);
});
test("owner saves rules; invalid values and cross-tenant policy changes are denied",async()=>{
 const invalid=await post("/api/local/automation/policy/update",{
  businessId,enabled:true,channel:"EMAIL",dueSoonDays:100,onDue:true,
  overdueEveryDays:7,autoSendEnabled:false,maxPerRun:30,
 });
 assert.equal(invalid.status,400);
 const p=await automate("policy/update",{
  businessId,enabled:true,channel:"EMAIL",dueSoonDays:3,
  onDue:true,overdueEveryDays:7,autoSendEnabled:false,maxPerRun:30,
 });
 assert.equal(p.enabled,true);
 assert.equal(p.channel,"EMAIL");
});
test("scan creates three correct milestones, alerts and no duplicates on next scan",async()=>{
 const first=await automate("scan",{businessId});
 assert.equal(first.enabled,true);
 assert.equal(first.created,3);
 assert.equal(first.held,0);
 const jobs=await automate("jobs",{businessId});
 assert.equal(jobs.length,3);
 assert.deepEqual(new Set(jobs.map(x=>x.kind)),new Set(["DUE_SOON","DUE_TODAY","OVERDUE"]));
 assert.ok(jobs.every(x=>x.status==="READY"));
 const second=await automate("scan",{businessId});
 assert.equal(second.created,0);
 assert.equal((await automate("jobs",{businessId})).length,3);
 const alerts=await automate("notifications",{businessId});
 assert.equal(alerts.filter(n=>n.kind==="REMINDER_READY").length,3);
 const read=await automate("notifications/read",{businessId,notificationId:alerts[0].id});
 assert.ok(read.readAt);
});
test("manual preview records an outbox item but never creates a shared link or sends externally",async()=>{
 const target=(await automate("jobs",{businessId})).find(j=>j.documentId===soonId);
 const before=await ok("/api/local/query",{table:"share_links",
  filters:[{field:"document_id",value:soonId}]});
 const job=await automate("dispatch",{businessId,jobId:target.id});
 assert.equal(job.status,"PREVIEWED");
 const after=await ok("/api/local/query",{table:"share_links",
  filters:[{field:"document_id",value:soonId}]});
 assert.equal(after.length,before.length);
 const repeated=await automate("dispatch",{businessId,jobId:target.id});
 assert.equal(repeated.duplicate,true);
 const outbox=await ok("/api/local/communications/outbox",{businessId});
 assert.ok(outbox.some(x=>x.id===job.outboxId&&x.status==="PREVIEW"));
});
test("settled invoice is skipped at dispatch and payment creation raises a neutral financial alert",async()=>{
 const paid=await ok("/api/local/rpc",{name:"record_payment_v2",args:{_request:{
  business_id:businessId,client_id:clientId,idempotency_key:randomUUID(),
  amount:"1500.00",currency:"KES",channel:"BANK_TRANSFER",
  allocations:[{invoice_id:dueTodayId,amount:"1500.00"}],
 }}});
 assert.ok(paid.payment.id);
 const target=(await automate("jobs",{businessId})).find(x=>x.documentId===dueTodayId);
 const stopped=await automate("dispatch",{businessId,jobId:target.id});
 assert.equal(stopped.status,"SKIPPED");
 assert.equal(stopped.holdCode,"INVOICE_NO_LONGER_OUTSTANDING");
 const rescan=await automate("scan",{businessId});
 assert.ok(rescan.notifications>=1);
 const alerts=await automate("notifications",{businessId});
 assert.ok(alerts.some(x=>x.kind==="PAYMENT_RECORD_CREATED"&&x.recordId===paid.payment.id));
});
test("WhatsApp is held without client opt-in, then revived only after recorded consent",async()=>{
 await automate("policy/update",{
  businessId,enabled:true,channel:"WHATSAPP",dueSoonDays:3,onDue:true,
  overdueEveryDays:7,autoSendEnabled:false,maxPerRun:30,
 });
 const first=await automate("scan",{businessId});
 assert.ok(first.held>=2);
 let jobs=await automate("jobs",{businessId});
 let wa=jobs.find(x=>x.channel==="WHATSAPP"&&x.documentId===lateId);
 assert.equal(wa.status,"HELD");
 assert.equal(wa.holdCode,"WHATSAPP_NOT_OPTED_IN");
 await ok("/api/local/communications/preferences/update",{
   businessId,clientId,channel:"WHATSAPP",optedIn:true,source:"DIRECT_REQUEST",
 });
 await automate("scan",{businessId});
 jobs=await automate("jobs",{businessId});
 wa=jobs.find(x=>x.id===wa.id);
 assert.equal(wa.status,"READY");
 await ok("/api/local/communications/preferences/update",{
   businessId,clientId,channel:"WHATSAPP",optedIn:false,
 });
 const stopped=await automate("dispatch",{businessId,jobId:wa.id});
 assert.equal(stopped.status,"HELD");
 assert.equal(stopped.holdCode,"WHATSAPP_NOT_OPTED_IN");
});
test("live automation needs BOTH independent server authorizations",async()=>{
 const wa=(await automate("jobs",{businessId})).find(x=>x.channel==="WHATSAPP"&&x.status==="READY");
 await assert.rejects(()=>dispatchAutomationJob(userId,{businessId,jobId:wa.id},{
  automatic:true,env:{FDOS_AUTOMATION_LIVE_ENABLED:"YES",
   FDOS_AUTOMATION_LIVE_APPROVED:"NO",FDOS_COMM_MODE:"live"},
 }),/Unattended customer delivery is disabled/);
});
test("preview scheduler does not transmit even with business auto-send setting",async()=>{
 await automate("policy/update",{
  businessId,enabled:true,channel:"EMAIL",dueSoonDays:3,onDue:true,
  overdueEveryDays:7,autoSendEnabled:true,maxPerRun:30,
 });
 const run=await runAutomationWorker({env:{
  FDOS_AUTOMATION_TIMEZONE:"Africa/Nairobi",
  FDOS_COMM_MODE:"preview",FDOS_AUTOMATION_LIVE_ENABLED:"YES",
  FDOS_AUTOMATION_LIVE_APPROVED:"YES",
 },now:new Date()});
 assert.ok(run.scanned>=1);
 assert.equal(run.autoDispatched,0);
});
test("manual live reminder uses subject and Resend provider mock, not an external network",async()=>{
 const invoice=await issueInvoice(2);
 await automate("scan",{businessId});
 const job=(await automate("jobs",{businessId})).find(x=>x.documentId===invoice&&x.channel==="EMAIL");
 assert.ok(job);
 let calls=0;
 const result=await dispatchAutomationJob(userId,{businessId,jobId:job.id},{
  env:{
   FDOS_COMM_MODE:"live",FDOS_PUBLIC_APP_URL:"https://docs.example.test",
   RESEND_API_KEY:"fake-test-key",FDOS_EMAIL_FROM:"Invoices <hello@example.test>",
   FDOS_AUTOMATION_LIVE_ENABLED:"NO",FDOS_AUTOMATION_LIVE_APPROVED:"NO",
  },
  transport:async(url,config)=>{
   calls++;
   assert.equal(url,"https://api.resend.com/emails");
   const body=JSON.parse(config.body);
   assert.match(body.subject,/Payment reminder/);
   assert.match(body.html,/payment reminder/);
   return {ok:true,status:200,json:async()=>({id:"resend-reminder-mock"})};
  },
 });
 assert.equal(result.status,"ACCEPTED");
 assert.equal(calls,1);
 const repeat=await automate("dispatch",{businessId,jobId:job.id});
 assert.equal(repeat.duplicate,true);
 assert.equal(calls,1);
});
test("C2B review appears in in-app notifications and unauthorized users cannot see it",async()=>{
 const inbox=await database`INSERT INTO public.mpesa_c2b_inbox(
  business_id,shortcode,provider_receipt,amount,bill_reference)
  VALUES(${businessId}::uuid,'174379',${"TEST"+randomUUID().replaceAll("-","").slice(0,12)},
    200.00,'INV-LOCAL-TEST') RETURNING id`;
 await automate("scan",{businessId});
 const alerts=await automate("notifications",{businessId});
 assert.ok(alerts.some(a=>a.kind==="MPESA_REVIEW_REQUIRED"&&a.recordId===inbox[0].id));
 const signup=await post("/api/local/auth/signup",{
  email:"automation-other-"+randomUUID()+"@example.local",
  password:"other-auto-test-password-88",fullName:"Unrelated User",
 });
 assert.equal(signup.status,200);
 const other=signup.cookie.split(";")[0];
 const listed=await post("/api/local/automation/notifications",{businessId},other);
 assert.equal(listed.status,403);
 const policy=await post("/api/local/automation/policy/update",{
  businessId,enabled:true,channel:"EMAIL",dueSoonDays:3,onDue:true,
  overdueEveryDays:7,autoSendEnabled:true,maxPerRun:30,
 },other);
 assert.equal(policy.status,403);
 const missing=await post("/api/local/automation/scan",{businessId},null);
 assert.equal(missing.status,401);
 const origin=await post("/api/local/automation/jobs",{businessId},cookie,"http://evil.example");
 assert.equal(origin.status,403);
});
