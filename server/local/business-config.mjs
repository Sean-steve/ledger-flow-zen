// Phase 7 — trusted business configuration, branding and local team authority.
// No credentials are stored here. Uploaded brand logos are bounded raster only.
import {createHash,randomBytes} from "node:crypto";
import {database,withUser} from "./database.mjs";
import {providerAvailability} from "./communication-providers.mjs";
import {paymentConfig} from "./mpesa-daraja.mjs";
import {fiscalRuntime} from "./fiscal-oscu-bridge.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES=["INVOICE","PRO_FORMA","QUOTATION","CREDIT_NOTE","DEBIT_NOTE"];
const TEMPLATES=new Set([
 "executive-atelier","modern-minimal","midnight-ledger","linear-mono",
 "editorial-classic","nordic-studio","swiss-grid","compact-ledger",
]);
const KEYS=["emailEnabled","whatsappEnabled","mpesaEnabled","etimsSandboxEnabled"];
const KEYS_DB=["email_enabled","whatsapp_enabled","mpesa_enabled","etims_sandbox_enabled"];
function bad(message,status=400){const e=new Error(message);e.httpStatus=status;return e;}
function id(value,name){if(typeof value!=="string"||!UUID.test(value))throw bad("Invalid "+name);return value;}
function email(value){const e=String(value??"").trim().toLowerCase();if(e.length>250||!EMAIL.test(e))throw bad("Invalid invitation email");return e;}
function safeShort(v,max,name){if(v===null||v===undefined||v==="")return null;if(typeof v!=="string"||v.length>max||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(v))throw bad("Invalid "+name);return v.trim()||null;}
async function roleCheck(userId,businessId,roles=["OWNER","ADMIN"]){
 return withUser(userId,async tx=>{
  const rows=await tx`SELECT public.has_business_role(${businessId}::uuid,
    ${tx.array(roles)}::public.member_role[]) AS permitted`;
  if(!rows[0]?.permitted)throw bad("Permission denied for this business",403);
  return true;
 });
}
async function membershipCheck(userId,businessId){
 return withUser(userId,async tx=>{
  const rows=await tx`SELECT public.has_business_access(${businessId}::uuid) AS member`;
  if(!rows[0]?.member)throw bad("Business not found or inaccessible",403);
  return true;
 });
}
async function logChange(tx,businessId,userId,action,entityId,details={}){
 return tx`INSERT INTO public.audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
  VALUES(${businessId}::uuid,${userId}::uuid,${action},'BUSINESS_CONFIGURATION',
    ${entityId}::uuid,${tx.json(details)}::jsonb)`;
}
export async function assertBusinessIntegrationEnabled(businessId,channel){
 id(businessId,"business ID");
 // Legacy CI test suites install migrations only through Phase 3/4/5.
 // Phase 7 schema is mandatory in the runnable app, and fail-closed when
 // present but not opted into by the business owner.
 const schema=await database`SELECT to_regclass('public.business_integrations')::text AS reg`;
 if(!schema[0]?.reg)return true;
 const column=({EMAIL:"email_enabled",WHATSAPP:"whatsapp_enabled",
   MPESA:"mpesa_enabled",ETIMS_SANDBOX:"etims_sandbox_enabled"})[channel];
 if(!column)throw bad("Unknown business integration");
 // Identifier selected only from a hard-coded map, never caller-provided SQL.
 const result=await database.unsafe(
   `SELECT ${column} AS enabled FROM public.business_integrations WHERE business_id=$1::uuid`,
   [businessId],
 );
 if(!result[0]?.enabled)throw bad("Business integration is disabled in Configuration",403);
 return true;
}
function configView(row){
 return {
  businessId:row.business_id,
  branding:{
    accentColor:row.accent_color??"#2563EB",
    headerTagline:row.header_tagline??null,
    footerNote:row.footer_note??null,
    hasLogo:Boolean(row.logo_sha256),
    logoUrl:row.logo_sha256?
      `/api/local/config/logo/${row.business_id}?v=${row.logo_sha256.slice(0,16)}`:null,
    updatedAt:row.brand_updated_at??null,
  },
  templates:row.templates??{},
  integrationFlags:{
    emailEnabled:Boolean(row.email_enabled),
    whatsappEnabled:Boolean(row.whatsapp_enabled),
    mpesaEnabled:Boolean(row.mpesa_enabled),
    etimsSandboxEnabled:Boolean(row.etims_sandbox_enabled),
  },
 };
}
export async function getBusinessConfig(userId,input,env=process.env){
 const businessId=id(input?.businessId,"business ID");
 await membershipCheck(userId,businessId);
 const rows=await withUser(userId,tx=>tx`SELECT b.id AS business_id,br.accent_color,
    br.header_tagline,br.footer_note,br.logo_sha256,br.updated_at AS brand_updated_at,
    ig.email_enabled,ig.whatsapp_enabled,ig.mpesa_enabled,ig.etims_sandbox_enabled
    FROM public.businesses b
    LEFT JOIN public.business_branding br ON br.business_id=b.id
    LEFT JOIN public.business_integrations ig ON ig.business_id=b.id
    WHERE b.id=${businessId}::uuid`);
 if(!rows.length)throw bad("Business not found",404);
 const ruleRows=await withUser(userId,tx=>tx`SELECT doc_type::text AS doc_type,template_id
  FROM public.business_template_rules WHERE business_id=${businessId}::uuid`);
 const record={...rows[0],templates:Object.fromEntries(ruleRows.map(r=>[r.doc_type,r.template_id]))};
 const comm=providerAvailability(env),pay=paymentConfig(env),fiscal=fiscalRuntime(env);
 return {...configView(record),
  providers:{
   email:{configured:comm.emailConfigured,serverLive:comm.mode==="live"},
   whatsapp:{configured:comm.whatsappConfigured,serverLive:comm.mode==="live"},
   mpesa:{mode:pay.mode,ready:pay.sandboxReady,productionEnabled:false},
   etims:{mode:fiscal.mode,ready:fiscal.sandboxReady,productionEnabled:false},
  },
  notice:"Business switches do not supply credentials, bypass sandbox approval, or enable KRA/Safaricom production.",
 };
}
export async function saveBranding(userId,input){
 const businessId=id(input?.businessId,"business ID");
 await roleCheck(userId,businessId);
 const color=input.accentColor;
 if(typeof color!=="string"||!/^#[a-fA-F0-9]{6}$/.test(color))throw bad("Invalid branding accent color");
 const tagline=safeShort(input.headerTagline,100,"header tagline");
 const footer=safeShort(input.footerNote,500,"footer note");
 await database.begin(async tx=>{
  await tx`INSERT INTO public.business_branding
    (business_id,accent_color,header_tagline,footer_note,updated_by)
    VALUES(${businessId}::uuid,${color.toUpperCase()},${tagline},${footer},${userId}::uuid)
    ON CONFLICT(business_id) DO UPDATE SET
      accent_color=EXCLUDED.accent_color,header_tagline=EXCLUDED.header_tagline,
      footer_note=EXCLUDED.footer_note,updated_by=EXCLUDED.updated_by,updated_at=now()`;
  await logChange(tx,businessId,userId,"BRANDING_UPDATED",businessId);
 });
 return getBusinessConfig(userId,{businessId});
}
function imageBytes(input){
 const mime=input?.mime;
 const raw=input?.base64;
 if(!["image/png","image/jpeg","image/webp"].includes(mime)||
    typeof raw!=="string"||raw.length>350000||
    raw.length<16||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)||raw.length%4!==0)
    throw bad("Invalid raster logo; use a PNG, JPEG or WebP under 256 KB");
 const bytes=Buffer.from(raw,"base64");
 if(bytes.length>262144||bytes.length<24||
    bytes.toString("base64").replace(/=+$/,"")!==raw.replace(/=+$/,""))
    throw bad("Logo size or encoding invalid");
 const png=bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"));
 const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9;
 const webp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
 if(!((mime==="image/png"&&png)||(mime==="image/jpeg"&&jpeg)||(mime==="image/webp"&&webp)))
    throw bad("Logo file signature does not match its MIME type");
 return bytes;
}
export async function saveLogo(userId,input){
 const businessId=id(input?.businessId,"business ID");
 await roleCheck(userId,businessId);
 const bytes=imageBytes(input);
 const hash=createHash("sha256").update(bytes).digest("hex");
 await database.begin(async tx=>{
  await tx`INSERT INTO public.business_branding
    (business_id,logo_mime,logo_bytes,logo_sha256,updated_by)
    VALUES(${businessId}::uuid,${input.mime},${bytes},${hash},${userId}::uuid)
    ON CONFLICT(business_id) DO UPDATE SET
      logo_mime=EXCLUDED.logo_mime,logo_bytes=EXCLUDED.logo_bytes,
      logo_sha256=EXCLUDED.logo_sha256,updated_by=EXCLUDED.updated_by,updated_at=now()`;
  await logChange(tx,businessId,userId,"BRANDING_LOGO_UPLOADED",businessId,
     {mime:input.mime,size:bytes.length});
 });
 return getBusinessConfig(userId,{businessId});
}
export async function removeLogo(userId,input){
 const businessId=id(input?.businessId,"business ID");
 await roleCheck(userId,businessId);
 await database.begin(async tx=>{
  await tx`UPDATE public.business_branding SET logo_mime=NULL,logo_bytes=NULL,
    logo_sha256=NULL,updated_by=${userId}::uuid,updated_at=now()
    WHERE business_id=${businessId}::uuid`;
  await logChange(tx,businessId,userId,"BRANDING_LOGO_REMOVED",businessId);
 });
 return getBusinessConfig(userId,{businessId});
}
export async function loadLogo(userId,input){
 const businessId=id(input?.businessId,"business ID");
 await membershipCheck(userId,businessId);
 const rows=await withUser(userId,tx=>tx`SELECT logo_mime,logo_bytes,logo_sha256
   FROM public.business_branding WHERE business_id=${businessId}::uuid`);
 if(!rows.length||!rows[0].logo_bytes)throw bad("Brand logo not found",404);
 return {mime:rows[0].logo_mime,bytes:rows[0].logo_bytes,
  hash:rows[0].logo_sha256};
}
export async function saveTemplateRules(userId,input){
 const businessId=id(input?.businessId,"business ID");
 await roleCheck(userId,businessId);
 if(!input?.templates||typeof input.templates!=="object"||
    Array.isArray(input.templates)||
    Object.keys(input.templates).some(key=>!TYPES.includes(key)))
  throw bad("Invalid per-document template rules");
 for(const value of Object.values(input.templates)){
   if(value!==null&&!TEMPLATES.has(value))throw bad("Unrecognized document template");
 }
 await database.begin(async tx=>{
  for(const type of TYPES){
   if(!Object.hasOwn(input.templates,type))continue;
   const value=input.templates[type];
   if(value===null){
    await tx`DELETE FROM public.business_template_rules WHERE business_id=${businessId}::uuid
      AND doc_type=${type}::public.doc_type`;
   }else{
    await tx`INSERT INTO public.business_template_rules
      (business_id,doc_type,template_id,updated_by)
      VALUES(${businessId}::uuid,${type}::public.doc_type,${value},${userId}::uuid)
      ON CONFLICT(business_id,doc_type) DO UPDATE SET
        template_id=EXCLUDED.template_id,updated_by=EXCLUDED.updated_by,updated_at=now()`;
   }
  }
  await logChange(tx,businessId,userId,"TEMPLATE_RULES_UPDATED",businessId);
 });
 return getBusinessConfig(userId,{businessId});
}
export async function saveIntegrationFlags(userId,input){
 const businessId=id(input?.businessId,"business ID");
 await roleCheck(userId,businessId,["OWNER"]);
 const changes=input?.flags;
 if(!changes||typeof changes!=="object"||Array.isArray(changes)||
    Object.keys(changes).length!==KEYS.length||
    KEYS.some(key=>typeof changes[key]!=="boolean"))
   throw bad("Invalid integration configuration");
 const values=KEYS.map(k=>changes[k]);
 await database.begin(async tx=>{
  await tx`INSERT INTO public.business_integrations
    (business_id,email_enabled,whatsapp_enabled,mpesa_enabled,etims_sandbox_enabled,updated_by)
    VALUES(${businessId}::uuid,${values[0]},${values[1]},${values[2]},${values[3]},${userId}::uuid)
    ON CONFLICT(business_id) DO UPDATE SET
      email_enabled=EXCLUDED.email_enabled,
      whatsapp_enabled=EXCLUDED.whatsapp_enabled,
      mpesa_enabled=EXCLUDED.mpesa_enabled,
      etims_sandbox_enabled=EXCLUDED.etims_sandbox_enabled,
      updated_by=EXCLUDED.updated_by,updated_at=now()`;
  await logChange(tx,businessId,userId,"INTEGRATION_PREFERENCES_UPDATED",
    businessId,{flags:changes});
 });
 return getBusinessConfig(userId,{businessId});
}
export async function listTeam(userId,input){
 const businessId=id(input?.businessId,"business ID");
 await membershipCheck(userId,businessId);
 const [members,invites]=await Promise.all([
  database`SELECT m.id,m.user_id,m.role::text AS role,m.created_at,
    u.email,u.full_name
    FROM public.business_members m JOIN fdos_local.users u ON u.id=m.user_id
    WHERE m.business_id=${businessId}::uuid ORDER BY m.created_at`,
  database`SELECT i.id,i.email,i.role::text AS role,i.status,
    i.expires_at,i.created_at
    FROM public.business_invitations i
    WHERE i.business_id=${businessId}::uuid AND i.status='PENDING'
      AND EXISTS (SELECT 1 FROM public.business_members m
        WHERE m.business_id=${businessId}::uuid AND m.user_id=${userId}::uuid
          AND m.role IN ('OWNER','ADMIN'))
    ORDER BY i.created_at DESC LIMIT 50`,
 ]);
 return {businessId,members:members.map(m=>({
   id:m.id,userId:m.user_id,role:m.role,
   email:m.email,fullName:m.full_name,createdAt:m.created_at,
  })),invitations:invites.map(i=>({
    id:i.id,email:i.email,role:i.role,status:i.status,
    expiresAt:i.expires_at,createdAt:i.created_at,
  }))};
}
export async function inviteTeamMember(userId,input){
 const businessId=id(input?.businessId,"business ID");
 const inviteEmail=email(input?.email);
 const role=input?.role;
 if(!["ADMIN","ACCOUNTANT","VIEWER"].includes(role))throw bad("Invalid invitation role");
 await roleCheck(userId,businessId,role==="ADMIN"?["OWNER"]:["OWNER","ADMIN"]);
 const token=randomBytes(32).toString("hex");
 const tokenHash=createHash("sha256").update(token).digest("hex");
 const entry=await database.begin(async tx=>{
  const member=await tx`SELECT id FROM fdos_local.users u JOIN public.business_members m
    ON m.user_id=u.id AND m.business_id=${businessId}::uuid
    WHERE u.email=${inviteEmail} LIMIT 1`;
  if(member.length)throw bad("This user already belongs to the business",409);
  await tx`UPDATE public.business_invitations SET status='REVOKED'
    WHERE business_id=${businessId}::uuid AND email=${inviteEmail} AND status='PENDING'`;
  const invites=await tx`INSERT INTO public.business_invitations
    (business_id,email,role,token_hash,expires_at,invited_by)
    VALUES(${businessId}::uuid,${inviteEmail},${role}::public.member_role,
      ${tokenHash},now()+interval '7 days',${userId}::uuid)
    RETURNING id,expires_at`;
  await logChange(tx,businessId,userId,"TEAM_INVITATION_CREATED",invites[0].id,
    {role});
  return invites[0];
 });
 // The raw token is returned only once; the database stores a SHA-256 hash.
 return {id:entry.id,businessId,email:inviteEmail,role,
   expiresAt:entry.expires_at,token};
}
export async function acceptTeamInvitation(userId,input){
 const token=input?.token;
 if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token))
   throw bad("Invalid invitation token");
 const hash=createHash("sha256").update(token).digest("hex");
 return database.begin(async tx=>{
   const user=await tx`SELECT email FROM fdos_local.users WHERE id=${userId}::uuid`;
   if(!user.length)throw bad("Valid login required",401);
   const rows=await tx`SELECT * FROM public.business_invitations
     WHERE token_hash=${hash} FOR UPDATE`;
   if(!rows.length||rows[0].status!=="PENDING"||
      new Date(rows[0].expires_at)<=new Date()||
      rows[0].email!==user[0].email)
     throw bad("Invitation not found, expired or not addressed to this account",403);
   const invitation=rows[0];
   const existing=await tx`SELECT id FROM public.business_members
     WHERE business_id=${invitation.business_id}::uuid AND user_id=${userId}::uuid`;
   if(existing.length)throw bad("Already a member of this business",409);
   await tx`INSERT INTO public.business_members(business_id,user_id,role)
     VALUES(${invitation.business_id}::uuid,${userId}::uuid,${invitation.role}::public.member_role)`;
   await tx`UPDATE public.business_invitations
     SET status='ACCEPTED',accepted_by=${userId}::uuid,accepted_at=now()
     WHERE id=${invitation.id}::uuid`;
   await logChange(tx,invitation.business_id,userId,"TEAM_INVITATION_ACCEPTED",
     invitation.id,{role:invitation.role});
   return {businessId:invitation.business_id,role:invitation.role};
 });
}
export async function revokeTeamInvitation(userId,input){
 const businessId=id(input?.businessId,"business ID");
 const invitationId=id(input?.invitationId,"invitation ID");
 await roleCheck(userId,businessId);
 const rows=await database`UPDATE public.business_invitations SET status='REVOKED'
   WHERE business_id=${businessId}::uuid AND id=${invitationId}::uuid
     AND status='PENDING' RETURNING id`;
 if(!rows.length)throw bad("Active invitation not found",404);
 await database`INSERT INTO public.audit_logs
   (business_id,actor_id,action,entity_type,entity_id)
   VALUES(${businessId}::uuid,${userId}::uuid,'TEAM_INVITATION_REVOKED','BUSINESS_CONFIGURATION',
     ${invitationId}::uuid)`;
 return {revoked:true};
}
export async function updateTeamRole(userId,input){
 const businessId=id(input?.businessId,"business ID");
 const memberId=id(input?.memberId,"member ID");
 const role=input?.role;
 if(!["ADMIN","ACCOUNTANT","VIEWER"].includes(role))throw bad("Owner role cannot be assigned or transferred");
 await roleCheck(userId,businessId,role==="ADMIN"?["OWNER"]:["OWNER","ADMIN"]);
 const actor=await database`SELECT role::text AS role FROM public.business_members
   WHERE business_id=${businessId}::uuid AND user_id=${userId}::uuid`;
 if(actor[0]?.role!=="OWNER"&&role==="ADMIN")throw bad("Only an owner may grant admin",403);
 const previous=await database`SELECT id,user_id,role::text AS role
   FROM public.business_members WHERE id=${memberId}::uuid AND business_id=${businessId}::uuid`;
 if(!previous.length)throw bad("Team member not found",404);
 if(previous[0].role==="OWNER"||previous[0].user_id===userId)
   throw bad("Owner and own roles cannot be changed",403);
 if(actor[0]?.role!=="OWNER"&&previous[0].role==="ADMIN")
   throw bad("Admins cannot change another admin",403);
 await database.begin(async tx=>{
   await tx`UPDATE public.business_members SET role=${role}::public.member_role
     WHERE id=${memberId}::uuid AND business_id=${businessId}::uuid`;
   await logChange(tx,businessId,userId,"TEAM_ROLE_UPDATED",memberId,{role});
 });
 return listTeam(userId,{businessId});
}
export async function removeTeamMember(userId,input){
 const businessId=id(input?.businessId,"business ID");
 const memberId=id(input?.memberId,"member ID");
 await roleCheck(userId,businessId);
 const actor=await database`SELECT role::text AS role FROM public.business_members
   WHERE business_id=${businessId}::uuid AND user_id=${userId}::uuid`;
 const members=await database`SELECT id,user_id,role::text AS role FROM public.business_members
   WHERE id=${memberId}::uuid AND business_id=${businessId}::uuid`;
 if(!members.length)throw bad("Team member not found",404);
 if(members[0].role==="OWNER"||members[0].user_id===userId)
   throw bad("Owner or own membership cannot be removed",403);
 if(actor[0]?.role!=="OWNER"&&members[0].role==="ADMIN")
   throw bad("Admins cannot remove other admins",403);
 await database.begin(async tx=>{
   await tx`DELETE FROM public.business_members
     WHERE id=${memberId}::uuid AND business_id=${businessId}::uuid`;
   await logChange(tx,businessId,userId,"TEAM_MEMBER_REMOVED",memberId);
 });
 return listTeam(userId,{businessId});
}
