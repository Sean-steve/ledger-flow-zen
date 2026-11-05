// Phase 4 fiscal lifecycle. Trust boundaries:
// 1. Invoice/credit note is owned by the authenticated business member.
// 2. A snapshot is sourced from immutable issued PostgreSQL records.
// 3. A sandbox result NEVER changes documents.kra_status/control_code.
// 4. KRA production fiscalisation is intentionally unavailable.
import { createHash } from "node:crypto";
import { database,withUser } from "./database.mjs";
import { fiscalRuntime,validateKraPin,callOsCuSandbox } from "./fiscal-oscu-bridge.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAPPING_KEYS=new Set(["VAT_16","VAT_8","ZERO_RATED","EXEMPT"]);
const SALES_ROLES=["OWNER","ADMIN","ACCOUNTANT"];
function reject(message,httpStatus=400){
  const e=new Error(message);e.httpStatus=httpStatus;return e;
}
function validUuid(value,label){
  if(typeof value!=="string"||!UUID.test(value))throw reject("Invalid "+label);
  return value;
}
function safeEntry(x,duplicate=false) {
  return {
    id:x.id,businessId:x.business_id,documentId:x.document_id,
    mode:x.mode,status:x.status,solution:x.solution,
    snapshotSha256:x.snapshot_sha256,bridgeRef:x.bridge_ref??null,
    sandboxScuId:x.sandbox_scu_id??null,
    sandboxReceiptNumber:x.sandbox_receipt_number??null,
    errorCode:x.error_code??null,createdAt:x.created_at,
    completedAt:x.completed_at??null,duplicate,
  };
}
async function allowedBusiness(tx,userId,businessId,roles=SALES_ROLES){
  const permitted=await tx`SELECT public.has_business_role(
    ${businessId}::uuid, ${tx.array(roles)}::public.member_role[]
  ) AS allowed`;
  if(!permitted[0]?.allowed)throw reject("Fiscal operation is not permitted for this business",403);
}
export function fiscalConfig(env=process.env) {
  return fiscalRuntime(env);
}
export async function getFiscalProfile(userId,input) {
  const businessId=validUuid(input?.businessId,"business ID");
  return withUser(userId,async tx=>{
    await allowedBusiness(tx,userId,businessId,["OWNER","ADMIN","ACCOUNTANT","VIEWER"]);
    const rows=await tx`SELECT b.kra_pin AS taxpayer_pin,b.name AS business_name,
      p.solution,p.branch_id,p.device_serial,p.tax_mapping,p.certification_state,
      p.updated_at
      FROM public.businesses b LEFT JOIN public.fiscal_profiles p ON p.business_id=b.id
      WHERE b.id=${businessId}::uuid`;
    if(!rows[0])throw reject("Business not found",404);
    const p=rows[0];
    return {
      businessId,taxpayerPin:p.taxpayer_pin??null,
      businessName:p.business_name,solution:"OSCU",branchId:p.branch_id??"00",
      deviceSerial:p.device_serial??null,taxMapping:p.tax_mapping??{},
      certificationState:"UNVERIFIED",updatedAt:p.updated_at??null,
    };
  });
}
export async function saveFiscalProfile(userId,input) {
  const businessId=validUuid(input?.businessId,"business ID");
  const branchId=String(input?.branchId??"").trim();
  const deviceSerial=String(input?.deviceSerial??"").trim()||null;
  if(!/^[0-9]{2,4}$/.test(branchId))throw reject("Branch ID must contain 2 to 4 digits");
  if(deviceSerial&&!/^[A-Za-z0-9_./-]{3,80}$/.test(deviceSerial))
    throw reject("Invalid OSCU device serial");
  const map=input?.taxMapping??{};
  if(!map||typeof map!=="object"||Array.isArray(map))throw reject("Invalid fiscal tax mapping");
  for(const [key,code] of Object.entries(map)){
    if(!MAPPING_KEYS.has(key)||typeof code!=="string"||!/^[-A-Za-z0-9_]{1,12}$/.test(code))
      throw reject("Invalid OSCU tax mapping: "+key);
  }
  await withUser(userId,async tx=>{
    await allowedBusiness(tx,userId,businessId,["OWNER","ADMIN"]);
    const rows=await tx`SELECT id FROM public.businesses WHERE id=${businessId}::uuid`;
    if(!rows.length)throw reject("Business not found",404);
  });
  await database.begin(async tx=>{
    await tx`INSERT INTO public.fiscal_profiles
     (business_id,branch_id,device_serial,tax_mapping,updated_by)
     VALUES(${businessId}::uuid,${branchId},${deviceSerial},
       ${tx.json(map)}::jsonb,${userId}::uuid)
     ON CONFLICT(business_id) DO UPDATE SET
       branch_id=EXCLUDED.branch_id,device_serial=EXCLUDED.device_serial,
       tax_mapping=EXCLUDED.tax_mapping,updated_by=EXCLUDED.updated_by,updated_at=now()`;
    await tx`INSERT INTO public.audit_logs
      (business_id,actor_id,action,entity_type,details)
      VALUES(${businessId}::uuid,${userId}::uuid,'FISCAL_PROFILE_UPDATED',
        'BUSINESS',jsonb_build_object('solution','OSCU'))`;
  });
  return getFiscalProfile(userId,{businessId});
}
export async function listFiscalSubmissions(userId,input) {
  const businessId=validUuid(input?.businessId,"business ID");
  return withUser(userId,async tx=>{
    const rows=await tx`SELECT s.id,s.business_id,s.document_id,s.mode,s.status,s.solution,
      s.snapshot_sha256,s.bridge_ref,s.sandbox_scu_id,s.sandbox_receipt_number,
      s.error_code,s.created_at,s.completed_at
      FROM public.fiscal_submissions s WHERE s.business_id=${businessId}::uuid
      ORDER BY s.created_at DESC LIMIT 150`;
    return rows.map(x=>safeEntry(x));
  });
}
export async function listFiscalDocument(userId,input) {
  const businessId=validUuid(input?.businessId,"business ID");
  const documentId=validUuid(input?.documentId,"document ID");
  return withUser(userId,async tx=>{
    const rows=await tx`SELECT id,business_id,document_id,mode,status,solution,
      snapshot_sha256,bridge_ref,sandbox_scu_id,sandbox_receipt_number,
      error_code,created_at,completed_at
      FROM public.fiscal_submissions
      WHERE business_id=${businessId}::uuid AND document_id=${documentId}::uuid
      ORDER BY created_at DESC LIMIT 5`;
    return rows.map(x=>safeEntry(x));
  });
}
async function fiscalSnapshot(userId,businessId,documentId,mode) {
  return withUser(userId,async tx=>{
    await allowedBusiness(tx,userId,businessId);
    const docs=await tx`SELECT d.*,b.kra_pin AS seller_pin,b.name AS seller_name,
      p.branch_id,p.device_serial,p.solution,p.tax_mapping
      FROM public.documents d
      JOIN public.businesses b ON b.id=d.business_id
      LEFT JOIN public.fiscal_profiles p ON p.business_id=b.id
      WHERE d.id=${documentId}::uuid AND d.business_id=${businessId}::uuid`;
    if(!docs.length)throw reject("Document not found",404);
    const d=docs[0];
    if(!["INVOICE","CREDIT_NOTE"].includes(d.type))
      throw reject("Only issued invoices and credit notes are currently supported");
    if(d.status!=="ISSUED"||!d.finalized_at||!d.doc_number)
      throw reject("Only finalized, issued and non-void documents may be submitted");
    if(d.kra_status!=="NOT_CONFIGURED")
      throw reject("Document has external fiscal state. Review before submission");
    const sellerPin=validateKraPin(d.seller_pin);
    const buyerPin=validateKraPin(d.client_kra_pin,true);
    const items=await tx`SELECT position,description,unit,quantity,unit_price,discount_pct,
       tax_category::text AS tax_category,tax_rate,gross_amount,discount_amount,
       taxable_amount,tax_amount,net_amount
      FROM public.document_items WHERE document_id=${documentId}::uuid
      ORDER BY position,id`;
    if(items.length<1||items.length>200)throw reject("Fiscal submission requires 1–200 line items");
    if(mode==="SANDBOX"&&(!d.device_serial||!d.branch_id))
      throw reject("Configure the approved OSCU branch and device first");
    const map=d.tax_mapping??{};
    if(mode==="SANDBOX") {
      for(const item of items){
        const code=map[item.tax_category];
        if(typeof code!=="string"||!code.trim())
          throw reject("Missing approved OSCU tax-code mapping for "+item.tax_category);
      }
    }
    let original=null;
    if(d.type==="CREDIT_NOTE"){
      if(!d.parent_document_id||!d.reason?.trim())
        throw reject("Credit note requires an original invoice and a documented reason");
      const orig=await tx`SELECT id,type,status,business_id FROM public.documents
        WHERE id=${d.parent_document_id}::uuid AND business_id=${businessId}::uuid`;
      if(orig[0]?.type!=="INVOICE")throw reject("Original credit note reference must be an invoice");
      const prev=await tx`SELECT sandbox_scu_id,sandbox_receipt_number,snapshot
        FROM public.fiscal_submissions
        WHERE document_id=${d.parent_document_id}::uuid AND business_id=${businessId}::uuid
          AND mode='SANDBOX' AND status='SANDBOX_ACKNOWLEDGED' LIMIT 1`;
      if(mode==="SANDBOX"&&!prev.length)
        throw reject("Original invoice must be acknowledged by the same OSCU sandbox first");
      if(prev.length&&mode==="SANDBOX"&&
         (prev[0].snapshot.taxpayerPin!==sellerPin||
          prev[0].snapshot.branchId!==(d.branch_id??"00")||
          prev[0].snapshot.deviceSerial!==d.device_serial))
        throw reject("Credit note must use original OSCU taxpayer, branch and device");
      original={
        documentId:d.parent_document_id,
        sandboxReceiptNumber:prev[0]?.sandbox_receipt_number??null,
        sandboxScuId:prev[0]?.sandbox_scu_id??null,
      };
    }
    const sign=d.type==="CREDIT_NOTE"?-1:1;
    const toAmount=(v)=>Number((Number(v??0)*sign).toFixed(2)).toFixed(2);
    const payload={
      schema:"fdos-fiscal-snapshot-v1",intendedEnvironment:mode,solution:"OSCU",
      documentId:d.id,documentNumber:d.doc_number,documentType:d.type,
      receiptLabel:d.type==="CREDIT_NOTE"?"NC":"NS",
      taxpayerPin:sellerPin,businessName:d.seller_name,
      buyerPin,buyerName:d.client_name,buyerEmail:d.client_email??null,
      branchId:d.branch_id??"00",deviceSerial:d.device_serial??null,
      issueDate:d.issue_date,currency:d.currency,exchangeRate:String(d.exchange_rate),
      subtotal:toAmount(d.subtotal),discount:toAmount(d.discount_total),
      taxable:toAmount(d.taxable_total),tax:toAmount(d.tax_total),
      total:toAmount(d.total_amount),taxBreakdown:d.tax_breakdown,
      creditReason:d.type==="CREDIT_NOTE"?d.reason:null,original,
      items:items.map(i=>({
        description:i.description,unit:i.unit,quantity:String(i.quantity),
        unitPrice:String(i.unit_price),discountPercent:String(i.discount_pct),
        taxCategory:i.tax_category,taxCode:map[i.tax_category]??null,
        taxRate:String(i.tax_rate),
        taxable:toAmount(i.taxable_amount),tax:toAmount(i.tax_amount),
        total:toAmount(i.net_amount),
      })),
    };
    const total=Number(payload.total);
    const lines=payload.items.reduce((acc,i)=>acc+Number(i.total),0);
    if(!Number.isFinite(total)||Math.abs(total-lines)>0.02)
      throw reject("Document total does not reconcile with the issued line items");
    return payload;
  });
}
async function findExisting(businessId,requestKey,documentId,mode) {
  // Resolve the request key first. A key may never be reused for another
  // document, even when that original document also has an existing preview.
  const key=await database`SELECT * FROM public.fiscal_submissions
    WHERE business_id=${businessId}::uuid AND request_key=${requestKey}::uuid`;
  if(key.length) {
    if(key[0].document_id!==documentId||key[0].mode!==mode)
      throw reject("Idempotency key already belongs to another fiscal request",409);
    return safeEntry(key[0],true);
  }
  const document=await database`SELECT * FROM public.fiscal_submissions
    WHERE business_id=${businessId}::uuid AND
      document_id=${documentId}::uuid AND mode=${mode}`;
  return document.length?safeEntry(document[0],true):null;
}
export async function prepareFiscalSubmission(userId,input,options={}) {
  const businessId=validUuid(input?.businessId,"business ID");
  const documentId=validUuid(input?.documentId,"document ID");
  const requestKey=validUuid(input?.requestKey,"idempotency key");
  const mode=String(input?.mode??"PREVIEW").toUpperCase();
  if(!["PREVIEW","SANDBOX"].includes(mode))
    throw reject("Production fiscal submissions are disabled");
  const env=options.env??process.env;
  const runtime=fiscalRuntime(env);
  if(mode==="SANDBOX"&&!runtime.sandboxReady)
    throw reject("OSCU sandbox requires confirmed approval and sidecar credentials",403);
  // Every request, including replay, must re-check current user permissions.
  const payload=await fiscalSnapshot(userId,businessId,documentId,mode);
  const duplicate=await findExisting(businessId,requestKey,documentId,mode);
  if(duplicate)return duplicate;
  const hash=createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const claimed=await database.begin(async tx=>{
    const rows=await tx`INSERT INTO public.fiscal_submissions
      (business_id,document_id,mode,status,request_key,snapshot,
       snapshot_sha256,requested_by)
      VALUES(${businessId}::uuid,${documentId}::uuid,${mode},
       ${mode==="PREVIEW"?"PREVIEW":"IN_FLIGHT"},
       ${requestKey}::uuid,${tx.json(payload)}::jsonb,${hash},${userId}::uuid)
      ON CONFLICT DO NOTHING RETURNING *`;
    if(!rows.length)return null;
    await tx`INSERT INTO public.fiscal_events
     (business_id,submission_id,event_type,actor_id)
     VALUES(${businessId}::uuid,${rows[0].id}::uuid,
      ${mode==="PREVIEW"?"PREVIEW_CREATED":"SANDBOX_SUBMITTED"},${userId}::uuid)`;
    return rows[0];
  });
  if(!claimed){
    const same=await findExisting(businessId,requestKey,documentId,mode);
    if(!same)throw new Error("Fiscal request collision without existing record");
    return same;
  }
  if(mode==="PREVIEW")return safeEntry(claimed);
  let result;
  try{
    result=await callOsCuSandbox(payload,requestKey,env,options.transport??fetch);
  }catch{
    result={status:"UNKNOWN",errorCode:"OSCU_BRIDGE_UNCERTAIN"};
  }
  const state=result.status;
  if(!["SANDBOX_ACKNOWLEDGED","REJECTED","UNKNOWN"].includes(state))
    throw new Error("Internal sandbox adapter state invalid");
  const event=state==="SANDBOX_ACKNOWLEDGED"?"SANDBOX_ACKNOWLEDGED":
    state==="REJECTED"?"SANDBOX_REJECTED":"SANDBOX_UNKNOWN";
  const saved=await database.begin(async tx=>{
    const rows=await tx`UPDATE public.fiscal_submissions SET
      status=${state},bridge_ref=${result.bridgeRef??null},
      sandbox_scu_id=${result.sandboxScuId??null},
      sandbox_receipt_number=${result.sandboxReceiptNumber??null},
      sandbox_signature=${result.sandboxSignature??null},
      sandbox_internal_data=${result.sandboxInternalData??null},
      error_code=${result.errorCode??null},completed_at=now(),updated_at=now()
      WHERE id=${claimed.id}::uuid AND status='IN_FLIGHT'
      RETURNING *`;
    if(!rows.length)throw new Error("Fiscal submission state changed unexpectedly");
    await tx`INSERT INTO public.fiscal_events
      (business_id,submission_id,event_type,actor_id,
       details) VALUES(${businessId}::uuid,${claimed.id}::uuid,${event},
         ${userId}::uuid,jsonb_build_object('environment','SANDBOX'))`;
    return rows[0];
  });
  return safeEntry(saved);
}
