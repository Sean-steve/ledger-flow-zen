import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {before,after,test} from "node:test";
import {database} from "../../server/local/database.mjs";
import {createLocalApiServer} from "../../server/local/api.mjs";
import {assertBusinessIntegrationEnabled} from "../../server/local/business-config.mjs";
const ORIGIN=process.env.FDOS_FRONTEND_ORIGIN??"http://localhost:3000";
let server,base,cookie,ownerId,businessId,viewerCookie,viewerId,adminCookie,adminId;
const viewerEmail="test-viewer-"+randomUUID()+"@example.local";
const adminEmail="test-admin-"+randomUUID()+"@example.local";
async function post(path,body={},auth=cookie,origin=ORIGIN){
 const res=await fetch(base+path,{method:"POST",headers:{
  "Content-Type":"application/json",Origin:origin,...(auth?{Cookie:auth}:{})
 },body:JSON.stringify(body)});
 return {status:res.status,data:await res.json(),cookie:res.headers.get("set-cookie")};
}
async function ok(path,body={},auth=cookie){
 const r=await post(path,body,auth);
 assert.equal(r.status,200,JSON.stringify(r.data));
 return r.data.data;
}
const cfg=(action,body={},auth=cookie)=>ok("/api/local/config/"+action,body,auth);
async function signup(mail){
 const r=await post("/api/local/auth/signup",{
  email:mail,password:"StrongPhaseSevenPassword-5544",fullName:"Phase Seven Tester",
 },null);
 assert.equal(r.status,200,JSON.stringify(r.data));
 return {id:r.data.data.id,cookie:r.cookie.split(";")[0]};
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
test("creates owner business and provider gates all disabled by default",async()=>{
 const u=await signup("config-owner-"+randomUUID()+"@example.local");
 ownerId=u.id;cookie=u.cookie;
 const business=await ok("/api/local/rpc",{name:"create_business",
  args:{_name:"Phase Seven Business",_base_currency:"KES"}});
 businessId=business.id;
 const config=await cfg("business",{businessId});
 assert.equal(config.branding.accentColor,"#2563EB");
 assert.equal(config.branding.hasLogo,false);
 assert.deepEqual(config.integrationFlags,{
  emailEnabled:false,whatsappEnabled:false,mpesaEnabled:false,etimsSandboxEnabled:false,
 });
 await assert.rejects(()=>assertBusinessIntegrationEnabled(businessId,"EMAIL"),/disabled/);
});
test("validates branding, preserves business identity and stores a private PNG logo",async()=>{
 const bad=await post("/api/local/config/branding/save",{
  businessId,accentColor:"url(script)",headerTagline:"invalid",footerNote:null});
 assert.equal(bad.status,400);
 const saved=await cfg("branding/save",{businessId,accentColor:"#ca13fe",
  headerTagline:"Engineering beyond limits",footerNote:"Thank you"});
 assert.equal(saved.branding.accentColor,"#CA13FE");
 const invalid=await post("/api/local/config/branding/logo/upload",{
  businessId,mime:"image/svg+xml",base64:Buffer.from("<svg/>").toString("base64")});
 assert.equal(invalid.status,400);
 const data=Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),Buffer.alloc(96,1)]);
 const logo=await cfg("branding/logo/upload",{
  businessId,mime:"image/png",base64:data.toString("base64")});
 assert.equal(logo.branding.hasLogo,true);
 assert.match(logo.branding.logoUrl,/^\/api\/local\/config\/logo\//);
 const r=await fetch(base+logo.branding.logoUrl,{headers:{Cookie:cookie}});
 assert.equal(r.status,200);
 assert.equal(r.headers.get("content-type"),"image/png");
 assert.equal(Buffer.from(await r.arrayBuffer()).toString("hex"),data.toString("hex"));
 const unauth=await fetch(base+logo.branding.logoUrl);
 assert.equal(unauth.status,401);
 const removed=await cfg("branding/logo/remove",{businessId});
 assert.equal(removed.branding.hasLogo,false);
});
test("per-type template overrides validate registry and never rewrite business fallback",async()=>{
 const fail=await post("/api/local/config/templates/save",{
  businessId,templates:{INVOICE:"malicious-template"}});
 assert.equal(fail.status,400);
 const updated=await cfg("templates/save",{businessId,templates:{
  INVOICE:"swiss-grid",QUOTATION:"linear-mono",CREDIT_NOTE:null}});
 assert.equal(updated.templates.INVOICE,"swiss-grid");
 assert.equal(updated.templates.QUOTATION,"linear-mono");
 assert.equal(updated.templates.CREDIT_NOTE,undefined);
 const record=await database`SELECT default_template FROM public.businesses WHERE id=${businessId}::uuid`;
 assert.equal(record[0].default_template,"executive-atelier");
});
test("owner controls integration permissions but cannot activate server credentials",async()=>{
 const wrong=await post("/api/local/config/integrations/save",{businessId,flags:{
  emailEnabled:true,whatsappEnabled:"yes",mpesaEnabled:false,etimsSandboxEnabled:false}});
 assert.equal(wrong.status,400);
 const state=await cfg("integrations/save",{businessId,flags:{
  emailEnabled:true,whatsappEnabled:false,mpesaEnabled:false,etimsSandboxEnabled:false}});
 assert.equal(state.providers.email.serverLive,false);
 await assertBusinessIntegrationEnabled(businessId,"EMAIL");
 await assert.rejects(()=>assertBusinessIntegrationEnabled(businessId,"WHATSAPP"),/disabled/);
 await assert.rejects(()=>assertBusinessIntegrationEnabled(businessId,"MPESA"),/disabled/);
 await assert.rejects(()=>assertBusinessIntegrationEnabled(businessId,"ETIMS_SANDBOX"),/disabled/);
});
test("owner can issue hashed single-use invite to a matching signed-in email",async()=>{
 const viewer=await signup(viewerEmail);viewerId=viewer.id;viewerCookie=viewer.cookie;
 const invitation=await cfg("team/invite",{businessId,email:viewerEmail,role:"VIEWER"});
 assert.match(invitation.token,/^[a-f0-9]{64}$/);
 const row=await database`SELECT token_hash FROM public.business_invitations WHERE id=${invitation.id}::uuid`;
 assert.notEqual(row[0].token_hash,invitation.token);
 const accepted=await cfg("team/accept",{token:invitation.token},viewerCookie);
 assert.equal(accepted.role,"VIEWER");
 const replay=await post("/api/local/config/team/accept",{token:invitation.token},viewerCookie);
 assert.equal(replay.status,403);
 const roster=await cfg("team",{businessId},viewerCookie);
 assert.equal(roster.members.find(x=>x.userId===viewerId)?.role,"VIEWER");
 const denied=await post("/api/local/config/branding/save",{
  businessId,accentColor:"#FFFFFF",headerTagline:"attack",footerNote:"attack"
 },viewerCookie);
 assert.equal(denied.status,403);
});
test("pending invites cannot be accepted by a different account or after revocation",async()=>{
 const attacker=await signup("config-stranger-"+randomUUID()+"@example.local");
 const invitation=await cfg("team/invite",{businessId,email:adminEmail,role:"ADMIN"});
 const wrong=await post("/api/local/config/team/accept",{token:invitation.token},attacker.cookie);
 assert.equal(wrong.status,403);
 const revoke=await cfg("team/revoke",{businessId,invitationId:invitation.id});
 assert.equal(revoke.revoked,true);
 const admin=await signup(adminEmail);adminId=admin.id;adminCookie=admin.cookie;
 const invalid=await post("/api/local/config/team/accept",{token:invitation.token},adminCookie);
 assert.equal(invalid.status,403);
});
test("owner can approve admin; admin cannot promote owner or modify integration flags",async()=>{
 const token=await cfg("team/invite",{businessId,email:adminEmail,role:"ADMIN"});
 const accepted=await cfg("team/accept",{token:token.token},adminCookie);
 assert.equal(accepted.role,"ADMIN");
 const roster=await cfg("team",{businessId});
 const owner=roster.members.find(m=>m.userId===ownerId);
 const admin=roster.members.find(m=>m.userId===adminId);
 const denied=await post("/api/local/config/team/role",{
  businessId,memberId:owner.id,role:"VIEWER"},adminCookie);
 assert.equal(denied.status,403);
 const flags=await post("/api/local/config/integrations/save",{businessId,flags:{
  emailEnabled:true,whatsappEnabled:true,mpesaEnabled:true,etimsSandboxEnabled:true,
 }},adminCookie);
 assert.equal(flags.status,403);
 const invite=await cfg("team/invite",{businessId,email:"team2@example.local",role:"ACCOUNTANT"},adminCookie);
 assert.equal(invite.role,"ACCOUNTANT");
 const adminInvite=await post("/api/local/config/team/invite",{
  businessId,email:"newadmin@example.local",role:"ADMIN"},adminCookie);
 assert.equal(adminInvite.status,403);
 const changed=await cfg("team/role",{businessId,memberId:admin.id,role:"VIEWER"});
 assert.equal(changed.members.find(x=>x.userId===adminId).role,"VIEWER");
 const removed=await cfg("team/remove",{businessId,memberId:admin.id});
 assert.ok(!removed.members.some(x=>x.userId===adminId));
 const cannotRemoveOwner=await post("/api/local/config/team/remove",{businessId,memberId:owner.id});
 assert.equal(cannotRemoveOwner.status,403);
});
test("unrelated tenants and cross-site origins cannot access configuration",async()=>{
 const stranger=await signup("config-other-"+randomUUID()+"@example.local");
 assert.equal((await post("/api/local/config/business",{businessId},stranger.cookie)).status,403);
 assert.equal((await post("/api/local/config/team",{businessId},stranger.cookie)).status,403);
 assert.equal((await post("/api/local/config/business",{businessId},cookie,"https://evil.example")).status,403);
 assert.equal((await post("/api/local/config/business",{businessId},null)).status,401);
 const audit=await database`SELECT action FROM public.audit_logs
  WHERE business_id=${businessId}::uuid AND action LIKE 'TEAM_%'`;
 assert.ok(audit.length>=4);
});
