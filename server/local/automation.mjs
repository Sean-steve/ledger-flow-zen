// Phase 6 — local PostgreSQL automation and notification authority.
// Scheduling/queueing is distinct from delivery. No external send unless
// a user clicks Send, or both business and server grant unattended delivery.
import { database,withUser } from "./database.mjs";
import { sendCommunication } from "./communications.mjs";
import { providerAvailability } from "./communication-providers.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS=new Set(["EMAIL","WHATSAPP"]);
function bad(message,status=400) {const error=new Error(message);error.httpStatus=status;return error;}
function uuid(value,label) {
  if(typeof value!=="string"||!UUID.test(value))throw bad("Invalid "+label);
  return value;
}
const ROLES=["OWNER","ADMIN","ACCOUNTANT"];
async function checkRole(userId,businessId,roles=ROLES) {
  return withUser(userId,async tx=>{
    const r=await tx`SELECT public.has_business_role(
      ${businessId}::uuid,${tx.array(roles)}::public.member_role[]
    ) AS allowed`;
    if(!r[0]?.allowed)throw bad("You cannot manage automation for this business",403);
  });
}
function localParts(date,tz) {
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"
  }).formatToParts(date);
  const get=k=>parts.find(x=>x.type===k)?.value;
  return {day:`${get("year")}-${get("month")}-${get("day")}`,hour:Number(get("hour"))};
}
function timezone(env) {
  const tz=env.FDOS_AUTOMATION_TIMEZONE??"Africa/Nairobi";
  try{new Intl.DateTimeFormat("en-GB",{timeZone:tz}).format(new Date());return tz;}
  catch{throw bad("Invalid automation timezone");}
}
export function automationRuntime(env=process.env) {
  const available=providerAvailability(env);
  const live=env.FDOS_AUTOMATION_LIVE_ENABLED==="YES" &&
    env.FDOS_AUTOMATION_LIVE_APPROVED==="YES" && available.mode==="live";
  return {
    mode:live?"LIVE_OPT_IN":"PREVIEW",
    liveEnabled:live,
    timezone:timezone(env),
    notice:live
      ?"Automated sending is eligible only for explicitly opted-in businesses and safe, authorized recipients."
      :"Local reminder generation only. No unattended customer emails or WhatsApp messages.",
  };
}
function utcDay(day) {
  if(typeof day!=="string"||!/\d{4}-\d{2}-\d{2}/.test(day))
    throw bad("Invalid automation date");
  const t=Date.parse(day+"T00:00:00Z");
  if(!Number.isFinite(t))throw bad("Invalid automation date");
  return t;
}
export function reminderMilestone(dueDay,today,policy) {
  const diff=Math.round((utcDay(dueDay)-utcDay(today))/86400000);
  if(diff>0&&policy.due_soon_days>0&&diff<=policy.due_soon_days)
    return {kind:"DUE_SOON",bucket:"before"};
  if(diff===0&&policy.on_due)return {kind:"DUE_TODAY",bucket:"due"};
  if(diff<0&&policy.overdue_every_days>0){
    const ordinal=Math.floor((-diff-1)/policy.overdue_every_days)+1;
    return {kind:"OVERDUE",bucket:`cycle-${ordinal}`};
  }
  return null;
}
function customerGate(row,channel) {
  if(row.client_status!=="ACTIVE")return "CLIENT_NOT_ACTIVE";
  if(channel==="EMAIL") {
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email??"").trim()))
      return "MISSING_EMAIL";
    if(row.email_opted_out_at)return "EMAIL_OPTOUT";
  }else {
    if(!/^((\+?254[17]\d{8})|(0[17]\d{8}))$/.test(String(row.phone??"").replace(/[\s()-]/g,"")))
      return "MISSING_WHATSAPP";
    if(!row.whatsapp_opted_in_at||row.whatsapp_opted_out_at)return "WHATSAPP_NOT_OPTED_IN";
  }
  return null;
}
function viewJob(x) {
  return {
    id:x.id,businessId:x.business_id,documentId:x.document_id,
    clientId:x.client_id,kind:x.kind,channel:x.channel,status:x.status,
    scheduledOn:x.scheduled_on,balanceSnapshot:Number(x.balance_snapshot),
    currency:x.currency,holdCode:x.hold_code??null,
    outboxId:x.outbox_id??null,createdAt:x.created_at,processedAt:x.processed_at??null,
  };
}
function viewNotification(x) {
  return {id:x.id,businessId:x.business_id,kind:x.kind,
    title:x.title,message:x.message,recordId:x.record_id,
    createdAt:x.created_at,readAt:x.read_at??null};
}
export async function getAutomationPolicy(userId,input) {
  const businessId=uuid(input?.businessId,"business ID");
  await checkRole(userId,businessId,["OWNER","ADMIN","ACCOUNTANT","VIEWER"]);
  const rows=await withUser(userId,tx=>tx`SELECT * FROM public.automation_policies
    WHERE business_id=${businessId}::uuid`);
  const p=rows[0];
  return {businessId,enabled:p?.enabled??false,channel:p?.channel??"EMAIL",
    dueSoonDays:p?.due_soon_days??3,onDue:p?.on_due??true,
    overdueEveryDays:p?.overdue_every_days??7,
    autoSendEnabled:p?.auto_send_enabled??false,
    maxPerRun:p?.max_per_run??30,lastScannedAt:p?.last_scanned_at??null};
}
export async function saveAutomationPolicy(userId,input) {
  const businessId=uuid(input?.businessId,"business ID");
  await checkRole(userId,businessId,["OWNER","ADMIN"]);
  const enabled=input?.enabled,auto=input?.autoSendEnabled,onDue=input?.onDue;
  if(![enabled,auto,onDue].every(v=>typeof v==="boolean"))throw bad("Invalid automation toggles");
  if(!CHANNELS.has(input?.channel))throw bad("Invalid automation channel");
  const numeric=(name,min,max)=>{
    const v=input[name];if(!Number.isInteger(v)||v<min||v>max)
      throw bad("Invalid "+name);return v;
  };
  const soon=numeric("dueSoonDays",0,14),late=numeric("overdueEveryDays",0,30);
  const limit=numeric("maxPerRun",1,100);
  const policy=await database`INSERT INTO public.automation_policies
    (business_id,enabled,channel,due_soon_days,on_due,overdue_every_days,
     auto_send_enabled,max_per_run,updated_by)
    VALUES(${businessId}::uuid,${enabled},${input.channel},${soon},${onDue},
      ${late},${auto},${limit},${userId}::uuid)
    ON CONFLICT(business_id) DO UPDATE SET
      enabled=EXCLUDED.enabled,channel=EXCLUDED.channel,
      due_soon_days=EXCLUDED.due_soon_days,on_due=EXCLUDED.on_due,
      overdue_every_days=EXCLUDED.overdue_every_days,
      auto_send_enabled=EXCLUDED.auto_send_enabled,max_per_run=EXCLUDED.max_per_run,
      updated_by=EXCLUDED.updated_by,updated_at=now()
    RETURNING *`;
  return getAutomationPolicy(userId,{businessId});
}
export async function listAutomationJobs(userId,input) {
  const businessId=uuid(input?.businessId,"business ID");
  await checkRole(userId,businessId,["OWNER","ADMIN","ACCOUNTANT","VIEWER"]);
  const rows=await withUser(userId,tx=>tx`SELECT * FROM public.automation_jobs
    WHERE business_id=${businessId}::uuid ORDER BY created_at DESC LIMIT 150`);
  return rows.map(viewJob);
}
export async function listFinancialNotifications(userId,input) {
  const businessId=uuid(input?.businessId,"business ID");
  await checkRole(userId,businessId,["OWNER","ADMIN","ACCOUNTANT","VIEWER"]);
  const rows=await withUser(userId,tx=>tx`SELECT * FROM public.financial_notifications
    WHERE business_id=${businessId}::uuid ORDER BY created_at DESC LIMIT 150`);
  return rows.map(viewNotification);
}
export async function markNotificationRead(userId,input) {
  const businessId=uuid(input?.businessId,"business ID");
  const notificationId=uuid(input?.notificationId,"notification ID");
  await checkRole(userId,businessId);
  const rows=await database`UPDATE public.financial_notifications SET read_at=COALESCE(read_at,now())
    WHERE id=${notificationId}::uuid AND business_id=${businessId}::uuid RETURNING *`;
  if(!rows.length)throw bad("Financial notification not found",404);
  return viewNotification(rows[0]);
}
async function scanEvents(businessId) {
  const [payments,c2b]=await Promise.all([
    database`SELECT id,status::text AS status FROM public.payments
      WHERE business_id=${businessId}::uuid
        AND created_at>=now()-interval '30 days'
      ORDER BY created_at DESC LIMIT 100`,
    database`SELECT id FROM public.mpesa_c2b_inbox
      WHERE business_id=${businessId}::uuid AND status='REVIEW_REQUIRED'
      ORDER BY created_at DESC LIMIT 100`,
  ]);
  let created=0;
  for(const payment of payments){
    const key="payment:"+payment.id;
    const rows=await database`INSERT INTO public.financial_notifications
      (business_id,source_key,kind,title,message,record_id)
      VALUES(${businessId}::uuid,${key},'PAYMENT_RECORD_CREATED',
        'Payment entry recorded',
        'A financial payment entry was recorded. Verify its source and reconciliation status.',
        ${payment.id}::uuid)
      ON CONFLICT(business_id,source_key) DO NOTHING RETURNING id`;
    if(rows.length)created++;
  }
  for(const record of c2b){
    const key="c2b-review:"+record.id;
    const rows=await database`INSERT INTO public.financial_notifications
      (business_id,source_key,kind,title,message,record_id)
      VALUES(${businessId}::uuid,${key},'MPESA_REVIEW_REQUIRED',
        'M-Pesa transaction requires review',
        'An unverified C2B notification needs independent merchant-statement verification before posting.',
        ${record.id}::uuid)
      ON CONFLICT(business_id,source_key) DO NOTHING RETURNING id`;
    if(rows.length)created++;
  }
  return created;
}
export async function scanAutomation(userId,input,options={}) {
  const businessId=uuid(input?.businessId,"business ID");
  await checkRole(userId,businessId);
  const env=options.env??process.env;
  const today=options.today??localParts(options.now??new Date(),timezone(env)).day;
  utcDay(today);
  const policy=await getAutomationPolicy(userId,{businessId});
  let notifications=await scanEvents(businessId);
  if(!policy.enabled)return {enabled:false,created:0,held:0,notifications,checkedOn:today};
  const records=await withUser(userId,tx=>tx`SELECT
      l.invoice_id,l.doc_number,l.client_id,l.due_date::text AS due_day,
      l.balance,l.currency,c.status::text AS client_status,c.email,c.phone,
      pref.email_opted_out_at,pref.whatsapp_opted_in_at,pref.whatsapp_opted_out_at
    FROM public.invoice_ledger l
    JOIN public.clients c ON c.id=l.client_id AND c.business_id=l.business_id
    LEFT JOIN public.client_communication_preferences pref
       ON pref.client_id=c.id AND pref.business_id=c.business_id
    WHERE l.business_id=${businessId}::uuid AND l.status='ISSUED'
      AND l.balance>0.005 AND l.due_date IS NOT NULL
    ORDER BY l.due_date ASC LIMIT 500`);
  let created=0,held=0;
  for(const row of records){
    if(created>=policy.maxPerRun)break;
    const m=reminderMilestone(row.due_day,today,{
      due_soon_days:policy.dueSoonDays,
      on_due:policy.onDue,overdue_every_days:policy.overdueEveryDays,
    });
    if(!m)continue;
    const hold=customerGate(row,policy.channel);
    const sourceKey=`invoice:${row.invoice_id}:${m.kind}:${row.due_day}:${m.bucket}:${policy.channel}`;
    const jobs=await database`INSERT INTO public.automation_jobs
     (business_id,document_id,client_id,source_key,kind,channel,status,
      scheduled_on,balance_snapshot,currency,hold_code,created_by)
     VALUES(${businessId}::uuid,${row.invoice_id}::uuid,${row.client_id}::uuid,
       ${sourceKey},${m.kind},${policy.channel},
       ${hold?"HELD":"READY"},${today}::date,${row.balance},${row.currency},
       ${hold},${userId}::uuid)
     ON CONFLICT(business_id,source_key) DO NOTHING RETURNING id,status`;
    if(!jobs.length)continue;
    created++;
    if(hold)held++;
    else {
      const noteKey="reminder-ready:"+jobs[0].id;
      const note=await database`INSERT INTO public.financial_notifications
        (business_id,source_key,kind,title,message,record_id)
        VALUES(${businessId}::uuid,${noteKey},'REMINDER_READY',
         'Invoice reminder ready for review',
         'A scheduled invoice reminder was queued. Check the balance and customer communication preferences before delivery.',
         ${row.invoice_id}::uuid)
        ON CONFLICT(business_id,source_key) DO NOTHING RETURNING id`;
      if(note.length)notifications++;
    }
  }
  await database`UPDATE public.automation_policies SET last_scanned_at=now()
    WHERE business_id=${businessId}::uuid`;
  return {enabled:true,created,held,notifications,checkedOn:today};
}
export async function dispatchAutomationJob(userId,input,options={}) {
  const businessId=uuid(input?.businessId,"business ID");
  const jobId=uuid(input?.jobId,"automation job ID");
  await checkRole(userId,businessId);
  const automatic=options.automatic===true;
  const env=options.env??process.env;
  const runtime=automationRuntime(env);
  const policy=await getAutomationPolicy(userId,{businessId});
  if(!policy.enabled)throw bad("Automation policy is disabled");
  if(automatic&&!(runtime.liveEnabled&&policy.autoSendEnabled))
    throw bad("Unattended customer delivery is disabled",403);
  const job=await database`SELECT * FROM public.automation_jobs
    WHERE business_id=${businessId}::uuid AND id=${jobId}::uuid`;
  if(!job.length)throw bad("Scheduled reminder not found",404);
  const existing=job[0];
  if(existing.status!=="READY")
    return {...viewJob(existing),duplicate:true};
  // Re-evaluate authoritative balance and customer opt-outs at the moment of send.
  const rows=await withUser(userId,tx=>tx`SELECT l.balance,l.status::text AS status,
      c.status::text AS client_status,c.email,c.phone,
      pref.email_opted_out_at,pref.whatsapp_opted_in_at,pref.whatsapp_opted_out_at
    FROM public.invoice_ledger l JOIN public.clients c
       ON c.id=l.client_id AND c.business_id=l.business_id
    LEFT JOIN public.client_communication_preferences pref
       ON pref.business_id=c.business_id AND pref.client_id=c.id
    WHERE l.business_id=${businessId}::uuid AND l.invoice_id=${existing.document_id}::uuid`);
  const row=rows[0];
  const reason=!row||row.status!=="ISSUED"||Number(row.balance)<=0.005
    ?"INVOICE_NO_LONGER_OUTSTANDING"
    :customerGate(row,existing.channel);
  if(reason){
    const status=reason==="INVOICE_NO_LONGER_OUTSTANDING"?"SKIPPED":"HELD";
    const updated=await database`UPDATE public.automation_jobs
      SET status=${status},hold_code=${reason},processed_at=now(),updated_at=now()
      WHERE id=${jobId}::uuid AND business_id=${businessId}::uuid
        AND status='READY' RETURNING *`;
    return viewJob(updated[0]??existing);
  }
  // Claim the send in a durable state before the provider call. Crashes are
  // deliberately UNKNOWN/uncertain, never blindly replayed.
  const claimed=await database`UPDATE public.automation_jobs SET
    status='UNKNOWN',hold_code='DELIVERY_IN_PROGRESS_OR_UNCERTAIN',updated_at=now()
    WHERE id=${jobId}::uuid AND business_id=${businessId}::uuid
      AND status='READY' RETURNING *`;
  if(!claimed.length){
    const latest=await database`SELECT * FROM public.automation_jobs WHERE id=${jobId}::uuid`;
    return {...viewJob(latest[0]),duplicate:true};
  }
  try {
    const output=await sendCommunication(userId,{
      businessId,documentId:existing.document_id,channel:existing.channel,
      requestKey:existing.request_key,
    },{
      env,
      purpose:"PAYMENT_REMINDER",
      transport:options.transport,
    });
    const newStatus=({
      PREVIEW:"PREVIEWED",ACCEPTED:"ACCEPTED",
      FAILED:"FAILED",UNKNOWN:"UNKNOWN",QUEUED:"UNKNOWN",
    })[output.status]??"UNKNOWN";
    const saved=await database`UPDATE public.automation_jobs
      SET status=${newStatus},outbox_id=${output.id}::uuid,
        hold_code=${newStatus==="UNKNOWN"?"DELIVERY_UNCERTAIN":null},
        processed_at=now(),updated_at=now()
      WHERE id=${jobId}::uuid AND business_id=${businessId}::uuid
      RETURNING *`;
    return viewJob(saved[0]);
  }catch(error){
    await database`UPDATE public.automation_jobs
      SET status='UNKNOWN',hold_code='DELIVERY_CHECK_REQUIRED',
          processed_at=now(),updated_at=now()
      WHERE id=${jobId}::uuid AND business_id=${businessId}::uuid`;
    throw error;
  }
}
export async function runAutomationWorker(options={}) {
  const env=options.env??process.env;
  const configured=automationRuntime(env);
  const bus=await database`SELECT p.business_id,b.owner_id,p.max_per_run,p.auto_send_enabled
    FROM public.automation_policies p JOIN public.businesses b ON b.id=p.business_id
    WHERE p.enabled=true ORDER BY p.business_id LIMIT 500`;
  const summary={scanned:0,created:0,held:0,autoDispatched:0,failed:0};
  const current=localParts(options.now??new Date(),timezone(env));
  for(const b of bus){
    try{
      const result=await scanAutomation(b.owner_id,{businessId:b.business_id},options);
      summary.scanned++;summary.created+=result.created;summary.held+=result.held;
      if(!configured.liveEnabled||!b.auto_send_enabled||current.hour<9||current.hour>=17)
        continue;
      const ready=await database`SELECT id FROM public.automation_jobs
        WHERE business_id=${b.business_id}::uuid AND status='READY'
        ORDER BY created_at ASC LIMIT ${Math.min(Number(b.max_per_run),10)}`;
      for(const job of ready){
        try {
          const state=await dispatchAutomationJob(b.owner_id,{
            businessId:b.business_id,jobId:job.id,
          },{...options,automatic:true});
          if(state.status==="ACCEPTED")summary.autoDispatched++;
        }catch{summary.failed++;}
      }
    }catch{summary.failed++;}
  }
  return summary;
}
