// Phase 8 — authenticated local operational diagnostics.
// No credentials, customer contact details or personal records leave this endpoint.
import {database,withUser} from "./database.mjs";
import {assertLocalRuntime} from "./http-security.mjs";
import {providerAvailability} from "./communication-providers.mjs";
import {paymentConfig} from "./mpesa-daraja.mjs";
import {fiscalRuntime} from "./fiscal-oscu-bridge.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function error(message,status=400){const e=new Error(message);e.httpStatus=status;return e;}
export async function releaseReadiness(userId,body,env=process.env){
 const businessId=body?.businessId;
 if(typeof businessId!=="string"||!UUID.test(businessId))throw error("Invalid business ID");
 const setup=assertLocalRuntime({...env,DATABASE_URL:env.DATABASE_URL??process.env.DATABASE_URL});
 const rows=await withUser(userId,tx=>tx`SELECT
    public.has_business_role(${businessId}::uuid,
      ARRAY['OWNER','ADMIN']::public.member_role[]) AS permitted`);
 if(!rows[0]?.permitted)throw error("Only owners and admins can inspect operational readiness",403);
 const version=await database`SELECT current_setting('server_version_num')::integer AS version`;
 const schema=await database`SELECT
    to_regclass('public.business_branding') IS NOT NULL AS branding,
    to_regclass('public.communication_outbox') IS NOT NULL AS communications,
    to_regclass('public.fiscal_submissions') IS NOT NULL AS fiscal,
    to_regclass('public.mpesa_intents') IS NOT NULL AS mpesa,
    to_regclass('public.automation_jobs') IS NOT NULL AS automation,
    to_regclass('fdos_local.sessions') IS NOT NULL AS sessions`;
 const counts=await withUser(userId,tx=>tx`SELECT
   (SELECT count(*)::integer FROM public.communication_outbox
    WHERE business_id=${businessId}::uuid AND status='UNKNOWN') AS uncertain_messages,
   (SELECT count(*)::integer FROM public.mpesa_c2b_inbox
    WHERE business_id=${businessId}::uuid AND status='REVIEW_REQUIRED') AS unreconciled_mpesa,
   (SELECT count(*)::integer FROM public.automation_jobs
    WHERE business_id=${businessId}::uuid AND status='UNKNOWN') AS uncertain_automation,
   (SELECT count(*)::integer FROM public.fiscal_submissions
    WHERE business_id=${businessId}::uuid AND status='UNKNOWN') AS uncertain_fiscal,
   (SELECT count(*)::integer FROM public.documents
    WHERE business_id=${businessId}::uuid AND type='INVOICE'
      AND status='ISSUED' AND kra_status<>'TRANSMITTED') AS invoices_without_etims`);
 const provider=providerAvailability(env),mpesa=paymentConfig(env),fiscal=fiscalRuntime(env);
 const blockers=[
  "No independently certified KRA eTIMS fiscal device or production acceptance evidence.",
  "No verified live M-Pesa settlement/callback deployment and merchant statement reconciliation.",
  "No publicly accessible HTTPS customer portal, verified sender/Meta delivery webhooks or SSO/MFA.",
  "Local-only PostgreSQL and single-machine API are not a production hosting/backup strategy.",
  "No certified off-host encrypted backup restore drill, monitoring/on-call or production disaster recovery.",
 ];
 if(Object.values(schema[0]).some(v=>v!==true))blockers.unshift("Required local database modules are missing.");
 if(version[0]?.version<160000)blockers.unshift("PostgreSQL 16 or later is required for local certification.");
 return {
  releaseGate:"BLOCKED",
  certification:"LOCAL_TESTING_ONLY",
  runtime:{...setup,backend:"LOCAL_POSTGRES",
    publicHttpsAvailable:false,productionEnabled:false},
  database:{postgresMajor:Math.floor(version[0].version/10000),
    moduleChecks:schema[0],moduleReady:Object.values(schema[0]).every(Boolean)},
  financialWorklist:{
    uncertainMessages:counts[0].uncertain_messages,
    unreconciledMpesa:counts[0].unreconciled_mpesa,
    uncertainAutomation:counts[0].uncertain_automation,
    uncertainFiscal:counts[0].uncertain_fiscal,
    invoicesWithoutEtims:counts[0].invoices_without_etims,
  },
  providers:{
    communications:provider.mode,mpesa:mpesa.mode,etims:fiscal.mode,
    emailConfigured:provider.emailConfigured,whatsappConfigured:provider.whatsappConfigured,
  },
  productionBlockers:blockers,
  checkedAt:new Date().toISOString(),
 };
}
