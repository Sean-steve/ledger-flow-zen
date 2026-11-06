// Phase 3 communications: authoritative tenant checks, consent, durable outbox.
// No provider credentials are returned to the browser or saved in the database.
import { randomBytes } from "node:crypto";
import { database, withUser } from "./database.mjs";
import {
  normalizePhone,providerAvailability,resolvePublicBase,sendToProvider,
} from "./communication-providers.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function inputError(message,status=400) {
  const error=new Error(message);
  error.httpStatus=status;
  return error;
}
function uuid(value,label) {
  if(typeof value!=="string"||!UUID.test(value))throw inputError("Invalid "+label);
  return value;
}
const ROLES=["OWNER","ADMIN","ACCOUNTANT"];
async function verifiedTarget(userId,{businessId,documentId,receiptId}) {
  const business=uuid(businessId,"business ID");
  if(Boolean(documentId)===Boolean(receiptId))throw inputError("Select exactly one document or receipt");
  return withUser(userId,async tx=>{
    const roles=await tx`SELECT public.has_business_role(
      ${business}::uuid, ARRAY['OWNER','ADMIN','ACCOUNTANT']::public.member_role[]
    ) AS permitted`;
    if(!roles[0]?.permitted)throw inputError("You cannot send for this business",403);
    let rows;
    if(documentId) {
      rows=await tx`SELECT d.id, d.business_id, d.client_id, d.doc_number AS reference,
        d.type::text AS category, d.status::text AS lifecycle,
        c.name AS client_name,c.email,c.phone,c.status::text AS client_status,
        b.name AS business_name
        FROM public.documents d
        JOIN public.clients c ON c.id=d.client_id AND c.business_id=d.business_id
        JOIN public.businesses b ON b.id=d.business_id
        WHERE d.business_id=${business}::uuid AND d.id=${uuid(documentId,"document ID")}::uuid`;
      if(rows[0] && ["DRAFT","VOID","CANCELLED"].includes(rows[0].lifecycle))
        throw inputError("Issue a valid document before sending it");
    }else{
      rows=await tx`SELECT r.id,r.business_id,r.client_id,r.receipt_number AS reference,
        'RECEIPT'::text AS category,
        CASE WHEN r.voided_at IS NOT NULL OR p.status='REVERSED' THEN 'VOID' ELSE 'ISSUED' END AS lifecycle,
        c.name AS client_name,c.email,c.phone,c.status::text AS client_status,
        b.name AS business_name
        FROM public.receipts r
        JOIN public.payments p ON p.id=r.payment_id AND p.business_id=r.business_id
        JOIN public.clients c ON c.id=r.client_id AND c.business_id=r.business_id
        JOIN public.businesses b ON b.id=r.business_id
        WHERE r.business_id=${business}::uuid AND r.id=${uuid(receiptId,"receipt ID")}::uuid`;
      if(rows[0] && rows[0].lifecycle==="VOID")throw inputError("Voided receipts cannot be sent");
    }
    if(!rows[0])throw inputError("Document or receipt not found",404);
    if(rows[0].client_status==="INACTIVE")throw inputError("Inactive client cannot receive messages");
    return { ...rows[0],kind:documentId?"document":"receipt",
      documentId:documentId??null,receiptId:receiptId??null };
  });
}
export function communicationConfig() {
  return providerAvailability();
}
export async function listCommunicationOutbox(userId,input) {
  const businessId=uuid(input?.businessId,"business ID");
  return withUser(userId,async tx=>{
    return tx`SELECT id,business_id,client_id,document_id,receipt_id,channel,recipient,
      subject,preview_text,status,delivery_mode,provider_id,provider_error_code,
      created_at,updated_at,accepted_at
      FROM public.communication_outbox
      WHERE business_id=${businessId}::uuid
      ORDER BY created_at DESC LIMIT 150`;
  });
}
export async function getCommunicationPreferences(userId,input) {
  const businessId=uuid(input?.businessId,"business ID");
  const clientId=uuid(input?.clientId,"client ID");
  return withUser(userId,async tx=>{
    const client=await tx`SELECT c.id,c.name FROM public.clients c
      WHERE c.id=${clientId}::uuid AND c.business_id=${businessId}::uuid`;
    if(!client.length)throw inputError("Client not found",404);
    const rows=await tx`SELECT whatsapp_opted_in_at,whatsapp_opt_in_source,
      whatsapp_opted_out_at,email_opted_out_at
      FROM public.client_communication_preferences
      WHERE business_id=${businessId}::uuid AND client_id=${clientId}::uuid`;
    return {businessId,clientId,whatsappOptedIn:Boolean(rows[0]?.whatsapp_opted_in_at&&!rows[0]?.whatsapp_opted_out_at),
      whatsappSource:rows[0]?.whatsapp_opt_in_source??null,
      whatsappOptedInAt:rows[0]?.whatsapp_opted_in_at??null,
      emailOptedOut:Boolean(rows[0]?.email_opted_out_at)};
  });
}
export async function updateCommunicationPreferences(userId,input) {
  const businessId=uuid(input?.businessId,"business ID");
  const clientId=uuid(input?.clientId,"client ID");
  const channel=input?.channel;
  if(!["EMAIL","WHATSAPP"].includes(channel)||typeof input.optedIn!=="boolean")
    throw inputError("Invalid consent update");
  const source=input?.source;
  if(channel==="WHATSAPP"&&input.optedIn&&
     !["DIRECT_REQUEST","WEB_FORM","WRITTEN","OTHER"].includes(source))
    throw inputError("Record how WhatsApp consent was obtained");
  await withUser(userId,async tx=>{
    const allowed=await tx`SELECT public.can_write_business(${businessId}::uuid) AS allowed`;
    if(!allowed[0]?.allowed)throw inputError("No permission to update client preferences",403);
    const client=await tx`SELECT id FROM public.clients
      WHERE id=${clientId}::uuid AND business_id=${businessId}::uuid`;
    if(!client.length)throw inputError("Client not found",404);
    if(channel==="WHATSAPP"){
      await tx`INSERT INTO public.client_communication_preferences
        (business_id,client_id,whatsapp_opted_in_at,whatsapp_opt_in_source,
          whatsapp_opted_out_at,updated_by)
        VALUES(${businessId}::uuid,${clientId}::uuid,
          CASE WHEN ${input.optedIn}::boolean THEN now() ELSE null END,
          ${input.optedIn?source:null}::text,
          CASE WHEN ${input.optedIn}::boolean THEN null ELSE now() END,
          ${userId}::uuid)
        ON CONFLICT (business_id,client_id) DO UPDATE SET
          whatsapp_opted_in_at=EXCLUDED.whatsapp_opted_in_at,
          whatsapp_opt_in_source=EXCLUDED.whatsapp_opt_in_source,
          whatsapp_opted_out_at=EXCLUDED.whatsapp_opted_out_at,
          updated_by=EXCLUDED.updated_by,updated_at=now()`;
    }else{
      await tx`INSERT INTO public.client_communication_preferences
        (business_id,client_id,email_opted_out_at,updated_by)
        VALUES(${businessId}::uuid,${clientId}::uuid,
          CASE WHEN ${input.optedIn}::boolean THEN null ELSE now() END,${userId}::uuid)
        ON CONFLICT (business_id,client_id) DO UPDATE SET
          email_opted_out_at=EXCLUDED.email_opted_out_at,
          updated_by=EXCLUDED.updated_by,updated_at=now()`;
    }
    await tx`SELECT public.record_comm_pref_audit(
      ${businessId}::uuid,${clientId}::uuid,${channel}::text,${input.optedIn}::boolean
    )`;
  });
  return getCommunicationPreferences(userId,{businessId,clientId});
}
async function existingOutbox(businessId,requestKey) {
  const rows=await database`SELECT * FROM public.communication_outbox
    WHERE business_id=${businessId}::uuid AND request_key=${requestKey}::uuid`;
  return rows[0]??null;
}
function publicOutbox(row) {
  // Provider secrets, shared token and connection details are not returned here.
  return {
    id:row.id,business_id:row.business_id,channel:row.channel,recipient:row.recipient,
    subject:row.subject,preview_text:row.preview_text,status:row.status,
    delivery_mode:row.delivery_mode,provider_id:row.provider_id??null,
    provider_error_code:row.provider_error_code??null,created_at:row.created_at,
    accepted_at:row.accepted_at??null,
  };
}
export async function sendCommunication(userId,input,options={}) {
  const channel=input?.channel;
  if(!["EMAIL","WHATSAPP"].includes(channel))throw inputError("Choose email or WhatsApp");
  const requestKey=uuid(input?.requestKey,"idempotency key");
  const businessId=uuid(input?.businessId,"business ID");
  const target=await verifiedTarget(userId,input);
  const mode=providerAvailability(options.env??process.env).mode;
  const recipient=channel==="EMAIL"?String(target.email??"").trim():String(target.phone??"").trim();
  if(!recipient)throw inputError("Client does not have a "+(channel==="EMAIL"?"valid email":"WhatsApp phone number"));
  if(channel==="EMAIL"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    throw inputError("Client email address is invalid");
  if(channel==="WHATSAPP")normalizePhone(recipient);
  const preferences=await getCommunicationPreferences(userId,{businessId,clientId:target.client_id});
  if(channel==="EMAIL"&&preferences.emailOptedOut)
    throw inputError("Client has opted out of email messages");
  if(channel==="WHATSAPP"&&mode==="live"&&!preferences.whatsappOptedIn)
    throw inputError("WhatsApp opt-in must be recorded before sending");

  const env=options.env??process.env;
  const base=mode==="live"?resolvePublicBase(env):null;
  if(mode==="live"){
    const ready=providerAvailability(env);
    if(channel==="EMAIL"&&!ready.emailConfigured)throw inputError("Email provider is not configured");
    if(channel==="WHATSAPP"&&!ready.whatsappConfigured)throw inputError("WhatsApp provider is not configured");
  }
  const subject=`${target.category.replaceAll("_"," ")} ${target.reference} from ${target.business_name}`.slice(0,250);
  const existing=await existingOutbox(businessId,requestKey);
  if(existing) {
    if(existing.document_id!==target.documentId||existing.receipt_id!==target.receiptId||
       existing.channel!==channel)throw inputError("Idempotency key already used for another message");
    return {...publicOutbox(existing),duplicate:true};
  }
  const live=mode==="live";
  const token=live?randomBytes(24).toString("hex"):null;
  const shareUrl=live?`${base}/share/${token}`:null;
  const previewText=live
    ? `Hello ${target.client_name}, ${subject}. View your document: ${shareUrl}`
    : `PREVIEW ONLY — ${subject}. No document link created. Nothing sent.`;
  // Atomically claim the idempotency key and create a short-lived share URL.
  // Only the transaction that claims this key may contact a provider.
  const claimed=await database.begin(async tx=>{
    const rows=await tx`INSERT INTO public.communication_outbox (
      business_id,client_id,document_id,receipt_id,channel,recipient,subject,
      preview_text,status,delivery_mode,request_key,requested_by
    ) VALUES (${businessId}::uuid,${target.client_id}::uuid,
      ${target.documentId}::uuid,${target.receiptId}::uuid,${channel}::text,
      ${recipient}::text,${subject}::text,${previewText}::text,
      ${live?"QUEUED":"PREVIEW"}::text,${mode}::text,${requestKey}::uuid,${userId}::uuid)
      ON CONFLICT (business_id,request_key) DO NOTHING RETURNING *`;
    if(!rows[0])return null;
    if(live) {
      const links=await tx`INSERT INTO public.share_links
        (business_id,document_id,receipt_id,token,expires_at,created_by)
        VALUES(${businessId}::uuid,${target.documentId}::uuid,${target.receiptId}::uuid,
          ${token}::text,now()+interval '14 days',${userId}::uuid)
        RETURNING id`;
      await tx`UPDATE public.communication_outbox SET share_link_id=${links[0].id}::uuid
        WHERE id=${rows[0].id}::uuid`;
    }
    return rows[0];
  });
  if(!claimed) {
    const duplicate=await existingOutbox(businessId,requestKey);
    if(!duplicate)throw new Error("Failed to read an existing communication request");
    if(duplicate.document_id!==target.documentId||duplicate.receipt_id!==target.receiptId||
       duplicate.channel!==channel)throw inputError("Idempotency key already used for another message");
    return {...publicOutbox(duplicate),duplicate:true};
  }
  if(!live)return publicOutbox(claimed);
  let result,status="ACCEPTED",errorCode=null;
  try {
    result=await sendToProvider({
      channel,recipient,subject,customerName:target.client_name,
      reference:target.reference,kind:target.kind,shareUrl,requestKey,
      businessName:target.business_name,
    },env,options.transport??fetch);
  }catch(error) {
    // Unknown includes request timeout/network/server failure: an external
    // provider may have accepted it, so never automatically retry such sends.
    status=Number(error?.status)>=400&&Number(error?.status)<500?"FAILED":"UNKNOWN";
    errorCode=status==="FAILED"?"PROVIDER_REJECTED":"DELIVERY_UNCERTAIN";
  }
  const updated=await database`UPDATE public.communication_outbox
    SET status=${status}::text,provider_id=${result?.id??null}::text,
    provider_error_code=${errorCode}::text,
    accepted_at=CASE WHEN ${status}::text='ACCEPTED' THEN now() ELSE null END,
    updated_at=now()
    WHERE id=${claimed.id}::uuid RETURNING *`;
  if(status==="ACCEPTED"&&target.documentId) {
    try{
      await withUser(userId,tx=>tx`SELECT public.mark_document_sent(${target.documentId}::uuid)`);
    }catch {
      // Provider acceptance remains authoritative in the outbox even if the
      // convenience sent_at field could not be updated.
    }
  }
  return publicOutbox(updated[0]);
}
