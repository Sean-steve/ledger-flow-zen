// Phase 5 — trusted M-Pesa intent and verification boundary for local PostgreSQL.
// PREVIEW uses test-only receipts; SANDBOX calls Safaricom test endpoints.
// Neither mode enables real payment settlement or production credentials.
import { createHash } from "node:crypto";
import { database,withUser } from "./database.mjs";
import {
 paymentConfig,kenyaPhone,safeShortcode,requestStkPush,
 queryStkStatus,parseStkCallback,parseC2bConfirmation,
} from "./mpesa-daraja.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message,httpStatus=400){const e=new Error(message);e.httpStatus=httpStatus;return e;}
function id(value,label){if(typeof value!=="string"||!UUID.test(value))throw fail("Invalid "+label);return value;}
function sha(value){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
function publicIntent(row,duplicate=false){
 return {
  id:row.id,businessId:row.business_id,invoiceId:row.invoice_id,clientId:row.client_id,
  mode:row.mode,status:row.status,shortcode:row.shortcode,
  amount:Number(row.amount),currency:row.currency,
  phoneMasked:"***"+String(row.phone).slice(-4),
  checkoutRequestId:row.checkout_request_id??null,
  providerReceipt:row.provider_receipt??null,
  errorCode:row.provider_error_code??null,
  paymentId:row.payment_id??null,receiptId:row.receipt_id??null,
  createdAt:row.created_at,updatedAt:row.updated_at,duplicate,
 };
}
function event(tx,row,kind,source,raw,code=null,note=null){
 return tx`INSERT INTO public.mpesa_provider_events
   (business_id,intent_id,source,event_type,payload_sha256,result_code,notes)
   VALUES(${row.business_id}::uuid,${row.id}::uuid,${source},${kind},
     ${sha(raw)},${code},${note})`;
}
async function permitted(tx,businessId,roles=["OWNER","ADMIN","ACCOUNTANT"]){
 const rows=await tx`SELECT public.has_business_role(
   ${businessId}::uuid,ARRAY['OWNER','ADMIN','ACCOUNTANT']::public.member_role[]
  ) AS allowed`;
 if(!rows[0]?.allowed)throw fail("M-Pesa operation is not permitted for this business",403);
}
export async function mpesaProfile(userId,input) {
 const businessId=id(input?.businessId,"business ID");
 return withUser(userId,async tx=>{
  const b=await tx`SELECT id,name,mpesa_paybill FROM public.businesses
    WHERE id=${businessId}::uuid`;
  if(!b.length)throw fail("Business not found",404);
  const p=await tx`SELECT shortcode,shortcode_type FROM public.mpesa_profiles
    WHERE business_id=${businessId}::uuid`;
  return {
   businessId,businessName:b[0].name,
   shortcode:p[0]?.shortcode??null,
   shortcodeType:p[0]?.shortcode_type??"PAYBILL",
   businessMpesaInstructions:b[0].mpesa_paybill??null,
  };
 });
}
export async function saveMpesaProfile(userId,input) {
 const businessId=id(input?.businessId,"business ID");
 const shortcode=safeShortcode(input?.shortcode);
 const type=input?.shortcodeType;
 if(!["PAYBILL","TILL"].includes(type))throw fail("Choose Paybill or Till");
 await withUser(userId,async tx=>{
  const allowed=await tx`SELECT public.has_business_role(
    ${businessId}::uuid,ARRAY['OWNER','ADMIN']::public.member_role[]
    ) AS permitted`;
  if(!allowed[0]?.permitted)throw fail("Only the business owner/admin can configure M-Pesa",403);
 });
 // Secrets are never saved in business tables; provider credentials are env-only.
 try{
 await database`INSERT INTO public.mpesa_profiles
    (business_id,shortcode,shortcode_type,updated_by)
    VALUES(${businessId}::uuid,${shortcode},${type},${userId}::uuid)
    ON CONFLICT(business_id) DO UPDATE SET
      shortcode=EXCLUDED.shortcode,shortcode_type=EXCLUDED.shortcode_type,
      updated_by=EXCLUDED.updated_by,updated_at=now()`;
 }catch(error){
  if(error?.code==="23505")throw fail("Shortcode already assigned to another business",409);
  throw error;
 }
 return mpesaProfile(userId,{businessId});
}
async function validatedInvoice(userId,businessId,invoiceId,amount) {
 return withUser(userId,async tx=>{
  await permitted(tx,businessId);
  const rows=await tx`SELECT d.id,d.client_id,d.doc_number,d.currency,
    d.status::text AS status,d.type::text AS type,d.client_name,
    c.phone AS client_phone,l.balance AS outstanding,
    p.shortcode,p.shortcode_type
    FROM public.documents d
    JOIN public.clients c ON c.id=d.client_id AND c.business_id=d.business_id
    JOIN public.invoice_ledger l ON l.invoice_id=d.id
    LEFT JOIN public.mpesa_profiles p ON p.business_id=d.business_id
    WHERE d.business_id=${businessId}::uuid AND d.id=${invoiceId}::uuid`;
  const doc=rows[0];
  if(!doc)throw fail("Invoice not found",404);
  if(doc.type!=="INVOICE"||doc.status!=="ISSUED")
   throw fail("M-Pesa requests require an issued invoice");
  if(doc.currency!=="KES")throw fail("M-Pesa STK currently requires a KES invoice");
  if(!doc.shortcode)throw fail("Configure your M-Pesa shortcode first");
  if(!Number.isSafeInteger(amount)||amount<1||amount>250000)
   throw fail("Enter a whole KES amount between 1 and 250000");
  if(amount>Number(doc.outstanding)+0.001)
   throw fail("Amount exceeds the outstanding invoice balance");
  return doc;
 });
}
export function mpesaRuntime(env=process.env){return paymentConfig(env);}
export async function listMpesaIntents(userId,input){
 const businessId=id(input?.businessId,"business ID");
 return withUser(userId,async tx=>{
  const rows=await tx`SELECT * FROM public.mpesa_intents
    WHERE business_id=${businessId}::uuid ORDER BY created_at DESC LIMIT 150`;
  return rows.map(x=>publicIntent(x));
 });
}
export async function listMpesaInbox(userId,input){
 const businessId=id(input?.businessId,"business ID");
 return withUser(userId,async tx=>{
  const rows=await tx`SELECT id,shortcode,provider_receipt,amount,bill_reference,
   phone_masked,status,review_reason,created_at,reviewed_at
   FROM public.mpesa_c2b_inbox WHERE business_id=${businessId}::uuid
   ORDER BY created_at DESC LIMIT 150`;
  return rows;
 });
}
export async function mpesaMetrics(userId,input){
 const businessId=id(input?.businessId,"business ID");
 return withUser(userId,async tx=>{
  const rows=await tx`SELECT
   COUNT(*) FILTER (WHERE status='PREVIEW')::integer AS pending_simulations,
   COUNT(*) FILTER (WHERE status='PENDING')::integer AS pending_stk,
   COUNT(*) FILTER (WHERE status='CONFIRMED')::integer AS confirmed,
   COUNT(*) FILTER (WHERE status IN ('UNKNOWN','REVIEW_REQUIRED'))::integer AS exceptions,
   COALESCE(SUM(amount) FILTER (WHERE status='CONFIRMED' AND mode='PREVIEW'),0)::numeric(18,2) AS simulated_amount,
   COALESCE(SUM(amount) FILTER (WHERE status='CONFIRMED' AND mode='SANDBOX'),0)::numeric(18,2) AS sandbox_amount
   FROM public.mpesa_intents WHERE business_id=${businessId}::uuid`;
  const inbox=await tx`SELECT COUNT(*)::integer AS review_count FROM public.mpesa_c2b_inbox
    WHERE business_id=${businessId}::uuid AND status='REVIEW_REQUIRED'`;
  return {...rows[0],c2b_review_count:inbox[0].review_count};
 });
}
export async function createMpesaRequest(userId,input,options={}){
 const businessId=id(input?.businessId,"business ID");
 const invoiceId=id(input?.invoiceId,"invoice ID");
 const requestKey=id(input?.requestKey,"request key");
 const amount=Number(input?.amount);
 const env=options.env??process.env;
 const runtime=paymentConfig(env);
 const doc=await validatedInvoice(userId,businessId,invoiceId,amount);
 let phone;
 try{phone=kenyaPhone(input.phone??doc.client_phone);}
 catch{throw fail("Invalid Kenyan M-Pesa phone number");}
 if(runtime.mode==="SANDBOX"){
  if(!runtime.sandboxReady)throw fail("Daraja sandbox credentials/approval missing",403);
  if(doc.shortcode!==env.FDOS_MPESA_SHORTCODE)
   throw fail("Business shortcode must match the configured Daraja sandbox shortcode",403);
 }
 const existing=await database`SELECT * FROM public.mpesa_intents
  WHERE business_id=${businessId}::uuid AND request_key=${requestKey}::uuid`;
 if(existing.length){
  const o=existing[0];
  if(o.invoice_id!==invoiceId||o.phone!==phone||Number(o.amount)!==amount)
   throw fail("Request key already used for another M-Pesa payment",409);
  return publicIntent(o,true);
 }
 const mode=runtime.mode;
 const rows=await database`INSERT INTO public.mpesa_intents
  (business_id,client_id,invoice_id,request_key,mode,status,shortcode,phone,
    amount,requested_by)
  VALUES(${businessId}::uuid,${doc.client_id}::uuid,${invoiceId}::uuid,
    ${requestKey}::uuid,${mode},${mode==="PREVIEW"?"PREVIEW":"UNKNOWN"},
    ${doc.shortcode},${phone},${amount},${userId}::uuid)
  ON CONFLICT(business_id,request_key) DO NOTHING RETURNING *`;
 if(!rows.length) {
  const other=await database`SELECT * FROM public.mpesa_intents
   WHERE business_id=${businessId}::uuid AND request_key=${requestKey}::uuid`;
  if(other[0].invoice_id!==invoiceId||other[0].phone!==phone||Number(other[0].amount)!==amount)
   throw fail("Request key already used for another M-Pesa payment",409);
  return publicIntent(other[0],true);
 }
 const created=rows[0];
 await database.begin(async tx=>{await event(tx,created,"REQUESTED",mode==="PREVIEW"?"LOCAL_TEST":"STK",
  {requestKey,mode,amount,invoiceId});});
 if(mode==="PREVIEW")return publicIntent(created);
 const result=await requestStkPush({
  shortcode:doc.shortcode,shortcodeType:doc.shortcode_type,phone,amount,
  invoiceNumber:doc.doc_number,
 },env,options.transport??fetch);
 const updated=await database.begin(async tx=>{
  const out=await tx`UPDATE public.mpesa_intents
   SET status=${result.status},merchant_request_id=${result.merchantRequestId??null},
    checkout_request_id=${result.checkoutRequestId??null},
    provider_error_code=${result.errorCode??null},updated_at=now()
   WHERE id=${created.id}::uuid AND status='UNKNOWN'
   RETURNING *`;
  if(!out.length)throw Error("M-Pesa request state changed unexpectedly");
  await event(tx,created,result.status==="PENDING"?"ACCEPTED":
    result.status==="FAILED"?"DECLINED":"UNKNOWN","STK",
    {status:result.status,checkoutRequestId:result.checkoutRequestId??null},
    result.errorCode??null);
  return out[0];
 });
 return publicIntent(updated);
}
async function recordState(intentId,status,code,raw,eventType){
 return database.begin(async tx=>{
  const rows=await tx`SELECT * FROM public.mpesa_intents WHERE id=${intentId}::uuid FOR UPDATE`;
  const intent=rows[0];
  if(!intent)throw fail("M-Pesa request not found",404);
  if(intent.status==="CONFIRMED")return publicIntent(intent,true);
  const next=await tx`UPDATE public.mpesa_intents
    SET status=${status},provider_error_code=${code},updated_at=now()
    WHERE id=${intentId}::uuid RETURNING *`;
  await event(tx,intent,eventType,"STK",raw,code);
  return publicIntent(next[0]);
 });
}
// The financial posting transaction uses the EXISTING idempotent
// record_payment_v2 RPC, generating the existing payment + receipt atomically.
// The local DB connection restores its privileged role before posting
// M-Pesa evidence in the same transaction. No raw SQL is exposed to the client.
async function settle(intentId,{receipt,phone,amount,source},env=process.env){
 try{
  const saved=await database.begin(async tx=>{
   const rows=await tx`SELECT * FROM public.mpesa_intents WHERE id=${intentId}::uuid FOR UPDATE`;
   const intent=rows[0];
   if(!intent)throw fail("M-Pesa request not found",404);
   if(intent.status==="CONFIRMED")return publicIntent(intent,true);
   if(intent.status==="FAILED"||intent.status==="REVIEW_REQUIRED")
    throw fail("Payment needs investigation before posting");
   if(source==="LOCAL_TEST"&&intent.mode!=="PREVIEW")
    throw fail("Test confirmation cannot settle a Daraja request");
   if(source==="STK"&&intent.mode!=="SANDBOX")
    throw fail("Provider callback cannot settle a preview request");
   if(kenyaPhone(phone)!==intent.phone||Number(amount)!==Number(intent.amount))
    throw fail("M-Pesa confirmation amount or phone mismatch");
   if(!/^[A-Z0-9]{8,20}$/.test(receipt))
    throw fail("Invalid provider receipt reference");
   const ledger=await tx`SELECT d.id,d.status,l.balance
     FROM public.documents d JOIN public.invoice_ledger l ON l.invoice_id=d.id
     WHERE d.id=${intent.invoice_id}::uuid AND d.business_id=${intent.business_id}::uuid
     FOR UPDATE OF d`;
   if(ledger[0]?.status!=="ISSUED"||
      Number(ledger[0].balance)+0.001<Number(intent.amount))
     throw fail("Outstanding balance changed; manual reconciliation required");
   // The financial RPC checks role membership and allocation invariants itself.
   await tx.unsafe("SET LOCAL ROLE authenticated");
   await tx`SELECT set_config('request.jwt.claim.sub',${intent.requested_by}::text,true)`;
   const request={
     business_id:intent.business_id,client_id:intent.client_id,
     idempotency_key:intent.request_key,amount:Number(intent.amount).toFixed(2),
     currency:"KES",channel:"MPESA_C2B",reference:receipt,
     channel_txn_id:receipt,payer_phone:intent.phone,
     notes:source==="LOCAL_TEST"
       ?"SIMULATED LOCAL TEST ONLY — not a real Safaricom payment":
        "DARAJA SANDBOX TEST — verified through STK callback and query",
     allocations:[{invoice_id:intent.invoice_id,amount:Number(intent.amount).toFixed(2)}],
   };
   const out=await tx`SELECT public.record_payment_v2(${tx.json(request)}::jsonb) AS result`;
   await tx.unsafe("SET LOCAL ROLE NONE");
   const payment=out[0].result.payment,receiptRecord=out[0].result.receipt;
   const updated=await tx`UPDATE public.mpesa_intents SET
      status='CONFIRMED',payment_id=${payment.id}::uuid,
      receipt_id=${receiptRecord.id}::uuid,provider_receipt=${receipt},
      provider_result_code='0',provider_error_code=NULL,
      confirmed_at=now(),updated_at=now()
     WHERE id=${intent.id}::uuid RETURNING *`;
   await event(tx,intent,"VERIFIED",source,{receipt,amount,phoneMasked:intent.phone.slice(-4)});
   return publicIntent(updated[0]);
  });
  return saved;
 }catch(error){
  if(error?.httpStatus&&error.httpStatus!==400)throw error;
  // Distinguish ambiguous or changed balances from a real confirmed payment.
  const rows=await database`SELECT status FROM public.mpesa_intents WHERE id=${intentId}::uuid`;
  if(rows[0]&&rows[0].status!=="CONFIRMED"){
   await recordState(intentId,"REVIEW_REQUIRED","POSTING_REVIEW_REQUIRED",
     {source,reason:"ledger-or-confirmation-mismatch"},"REVIEW_REQUIRED");
  }
  return publicIntent((await database`SELECT * FROM public.mpesa_intents WHERE id=${intentId}::uuid`)[0]);
 }
}
export async function simulateMpesaConfirmation(userId,input,env=process.env){
 const businessId=id(input?.businessId,"business ID");
 const intentId=id(input?.intentId,"M-Pesa request ID");
 if(paymentConfig(env).mode!=="PREVIEW")
   throw fail("Simulation is disabled outside local preview mode",403);
 await withUser(userId,tx=>permitted(tx,businessId));
 const rows=await database`SELECT * FROM public.mpesa_intents
   WHERE id=${intentId}::uuid AND business_id=${businessId}::uuid`;
 const intent=rows[0];
 if(!intent)throw fail("M-Pesa request not found",404);
 if(intent.mode!=="PREVIEW")throw fail("Only local preview requests can be simulated");
 if(intent.status==="CONFIRMED")return publicIntent(intent,true);
 if(intent.status!=="PREVIEW")throw fail("Simulation cannot be applied to this request");
 const receipt="SIM"+intent.id.replaceAll("-","").slice(0,13).toUpperCase();
 return settle(intent.id,{receipt,phone:intent.phone,amount:intent.amount,source:"LOCAL_TEST"},env);
}
export async function receiveStkCallback(payload,env=process.env,options={}){
 if(!paymentConfig(env).sandboxReady)
  throw fail("Daraja sandbox callback is not activated",403);
 const item=parseStkCallback(payload);
 const rows=await database`SELECT * FROM public.mpesa_intents
    WHERE checkout_request_id=${item.checkoutRequestId} LIMIT 1`;
 const intent=rows[0];
 if(!intent||intent.mode!=="SANDBOX")throw fail("Unrecognized checkout request",404);
 if(intent.merchant_request_id!==item.merchantRequestId)
  return recordState(intent.id,"REVIEW_REQUIRED","STK_MERCHANT_ID_MISMATCH",
    {checkout:item.checkoutRequestId},"REVIEW_REQUIRED");
 if(intent.status==="CONFIRMED")return publicIntent(intent,true);
 if(intent.status!=="PENDING"&&intent.status!=="UNKNOWN")
  return publicIntent(intent,true);
 if(item.status==="FAILED")
  return recordState(intent.id,"FAILED","STK_DECLINED_"+item.resultCode,
   {checkout:item.checkoutRequestId,code:item.resultCode},"DECLINED");
 if(item.amount!==Number(intent.amount)||item.phone!==intent.phone)
  return recordState(intent.id,"REVIEW_REQUIRED","STK_AMOUNT_OR_PHONE_MISMATCH",
   {checkout:item.checkoutRequestId},"REVIEW_REQUIRED");
 const query=await queryStkStatus({
   shortcode:intent.shortcode,checkoutRequestId:item.checkoutRequestId,
 },env,options.transport??fetch);
 if(query.status!=="SUCCESS"){
  return recordState(intent.id,query.status==="FAILED"?"REVIEW_REQUIRED":"UNKNOWN",
   query.status==="FAILED"?"STK_QUERY_CONFLICT":query.errorCode??"STK_QUERY_UNCERTAIN",
   {checkout:item.checkoutRequestId,queryStatus:query.status},
   query.status==="FAILED"?"REVIEW_REQUIRED":"UNKNOWN");
 }
 return settle(intent.id,{
   receipt:item.receipt,phone:item.phone,amount:item.amount,source:"STK",
 },env);
}
export async function receiveC2bConfirmation(payload,env=process.env){
 if(!paymentConfig(env).sandboxReady)
   throw fail("Daraja sandbox callback is not activated",403);
 const item=parseC2bConfirmation(payload);
 if(item.shortcode!==env.FDOS_MPESA_SHORTCODE)
   throw fail("C2B shortcode does not match the active sandbox profile",403);
 const profiles=await database`SELECT business_id FROM public.mpesa_profiles
   WHERE shortcode=${item.shortcode} LIMIT 1`;
 if(!profiles.length)throw fail("Unknown M-Pesa C2B shortcode",404);
 const rows=await database`INSERT INTO public.mpesa_c2b_inbox
   (business_id,shortcode,provider_receipt,amount,bill_reference,phone_masked)
   VALUES(${profiles[0].business_id}::uuid,${item.shortcode},${item.receipt},
      ${item.amount},${item.billReference},${item.phoneMasked})
   ON CONFLICT(shortcode,provider_receipt) DO NOTHING RETURNING id`;
 // The callback is NOT signed by a KRA-like signature, not independently
 // reconciled and MUST NEVER be inserted into public.payments automatically.
 return {status:"REVIEW_REQUIRED",duplicate:rows.length===0};
}

// Authorized manual C2B posting AFTER an independent merchant statement check.
// This is human-attested reconciliation, NOT automatic provider verification.
export async function reconcileC2bManually(userId,input) {
 const businessId=id(input?.businessId,"business ID");
 const inboxId=id(input?.inboxId,"C2B confirmation ID");
 const invoiceId=id(input?.invoiceId,"invoice ID");
 const reference=String(input?.statementReference??"").trim();
 if(input?.statementVerified!==true||reference.length<8||reference.length>180)
  throw fail("Confirm merchant statement verification and enter an evidence reference");
 await withUser(userId,tx=>permitted(tx,businessId));
 return database.begin(async tx=>{
  const rows=await tx`SELECT * FROM public.mpesa_c2b_inbox
   WHERE id=${inboxId}::uuid AND business_id=${businessId}::uuid FOR UPDATE`;
  const entry=rows[0];
  if(!entry)throw fail("C2B confirmation not found",404);
  if(entry.status==="RECONCILED_MANUALLY"){
   if(entry.reconciliation_evidence!==reference||!entry.payment_id)
    throw fail("C2B confirmation already reconciled; check its prior receipt",409);
   return {
    id:entry.id,status:entry.status,paymentId:entry.payment_id,
    receiptId:entry.receipt_id,duplicate:true,
   };
  }
  if(entry.status!=="REVIEW_REQUIRED")
   throw fail("This C2B confirmation cannot be reconciled");
  const profile=await tx`SELECT shortcode_type FROM public.mpesa_profiles
   WHERE business_id=${businessId}::uuid AND shortcode=${entry.shortcode}`;
  if(!profile.length)throw fail("Business shortcode is no longer authorized");
  const documents=await tx`SELECT d.id,d.business_id,d.client_id,d.currency,
     d.type::text AS type,d.status::text AS status,l.balance
    FROM public.documents d
    JOIN public.invoice_ledger l ON l.invoice_id=d.id
    WHERE d.id=${invoiceId}::uuid AND d.business_id=${businessId}::uuid
    FOR UPDATE OF d`;
  const invoice=documents[0];
  if(!invoice||invoice.type!=="INVOICE"||invoice.status!=="ISSUED"||
     invoice.currency!=="KES")
   throw fail("Select an issued KES invoice belonging to this business");
  const available=Number(invoice.balance),amount=Number(entry.amount);
  if(!Number.isFinite(available)||available<=0||!Number.isFinite(amount)||amount<=0)
   throw fail("Invoice has no outstanding balance for C2B allocation");
  const applied=Math.min(available,amount);
  if(applied<=0.001)throw fail("No amount available for invoice allocation");
  // Posting is authoritative only because this authenticated user explicitly
  // attested to an independent M-Pesa statement check.
  await tx.unsafe("SET LOCAL ROLE authenticated");
  await tx`SELECT set_config('request.jwt.claim.sub',${userId}::text,true)`;
  const receiptNum=entry.provider_receipt;
  const request={
   business_id:businessId,client_id:invoice.client_id,
   idempotency_key:entry.id,
   amount:amount.toFixed(2),currency:"KES",
   channel:profile[0].shortcode_type==="TILL"?"MPESA_TILL":"MPESA_C2B",
   reference:receiptNum,channel_txn_id:receiptNum,
   notes:"C2B MANUALLY ATTESTED AGAINST MERCHANT STATEMENT — NOT AUTOMATICALLY PROVIDER-VERIFIED",
   allocations:[{invoice_id:invoice.id,amount:applied.toFixed(2)}],
  };
  const result=await tx`SELECT public.record_payment_v2(${tx.json(request)}::jsonb) AS result`;
  await tx.unsafe("SET LOCAL ROLE NONE");
  const payment=result[0].result.payment,receipt=result[0].result.receipt;
  const updated=await tx`UPDATE public.mpesa_c2b_inbox SET
   status='RECONCILED_MANUALLY',payment_id=${payment.id}::uuid,
   receipt_id=${receipt.id}::uuid,reconciliation_evidence=${reference},
   reviewed_at=now(),reviewed_by=${userId}::uuid,
   review_reason='MANUAL_MERCHANT_STATEMENT_ATTESTATION'
   WHERE id=${entry.id}::uuid RETURNING *`;
  await tx`INSERT INTO public.mpesa_provider_events
   (business_id,source,event_type,payload_sha256,provider_receipt,notes)
   VALUES(${businessId}::uuid,'C2B','MANUALLY_RECONCILED',
    ${sha({receiptNum,inboxId,statementReference:reference})},
    ${receiptNum},'Merchant statement checked by authenticated operator')`;
  return {
   id:updated[0].id,status:updated[0].status,paymentId:payment.id,
   receiptId:receipt.id,applied:applied.toFixed(2),
   unallocated:Math.max(0,amount-applied).toFixed(2),duplicate:false,
  };
 });
}
