import {createFileRoute,Link} from "@tanstack/react-router";
import {useEffect,useMemo,useState} from "react";
import {BellRing,CalendarClock,CheckCheck,Play,ShieldAlert,Send} from "lucide-react";
import {toast} from "sonner";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {
 Select,SelectContent,SelectItem,SelectTrigger,SelectValue,
} from "@/components/ui/select";
import {useWorkspace} from "@/components/app-shell";
import {
 useAutomationConfig,useAutomationPolicy,useAutomationJobs,
 useFinancialNotifications,useUpdateAutomationPolicy,useScanAutomation,
 useDeliverAutomationJob,useMarkFinancialNotificationRead,
 type AutomationPolicy,
} from "@/lib/automation";

export const Route=createFileRoute("/_authenticated/automation")({
 head:()=>({meta:[{title:"Automation & Financial Notifications — Financial Document OS"}]}),
 component:AutomationPage,
});
function AutomationPage(){
 const {businessId}=useWorkspace();
 const config=useAutomationConfig();
 const profile=useAutomationPolicy(businessId);
 const jobs=useAutomationJobs(businessId);
 const notifications=useFinancialNotifications(businessId);
 const update=useUpdateAutomationPolicy();
 const scan=useScanAutomation();
 const deliver=useDeliverAutomationJob();
 const mark=useMarkFinancialNotificationRead();
 const [policy,setPolicy]=useState<AutomationPolicy|null>(null);
 useEffect(()=>{if(profile.data)setPolicy(profile.data)},[profile.data]);
 const unread=useMemo(()=>(notifications.data??[]).filter(n=>!n.readAt).length,[notifications.data]);
 async function save(){
  if(!policy)return;
  try{
   await update.mutateAsync(policy);
   toast.success("Automation rules saved");
  }catch(error){toast.error(error instanceof Error?error.message:"Could not save rules");}
 }
 async function runCheck(){
  if(!businessId)return;
  try{
   const result=await scan.mutateAsync(businessId);
   toast.success(result.enabled?`Reminder check complete: ${result.created} new jobs, ${result.held} held.`:
    `Financial alerts refreshed. Reminders are disabled.`);
  }catch(error){toast.error(error instanceof Error?error.message:"Automation scan failed");}
 }
 async function send(jobId:string){
  if(!businessId)return;
  const live=config.data?.liveEnabled;
  if(live&&!window.confirm("Send this reminder using the configured live provider?"))return;
  try{
   const result=await deliver.mutateAsync({businessId,jobId});
   toast.success(result.status==="PREVIEWED"?"Reminder preview recorded — nothing sent":
    result.status==="ACCEPTED"?"Provider accepted reminder":
    result.status==="SKIPPED"?"Invoice already settled or changed":
    "Reminder requires review — see its current status");
  }catch(error){toast.error(error instanceof Error?error.message:"Reminder dispatch failed");}
 }
 return <div className="space-y-6">
  <header className="flex flex-wrap items-start justify-between gap-4">
   <div>
    <h1 className="text-3xl">Automation & Notifications</h1>
    <p className="mt-1 text-sm text-muted-foreground">
      Invoice reminders, payment alerts and consent-safe delivery.
    </p>
   </div>
   <Button variant="outline" onClick={()=>void runCheck()} disabled={scan.isPending}>
    <Play className="size-4"/>{scan.isPending?"Checking…":"Run check now"}
   </Button>
  </header>
  <Card><CardContent className="flex items-start gap-3 py-4">
   <ShieldAlert className="mt-1 size-5 shrink-0 text-muted-foreground"/>
   <div className="space-y-2 text-sm">
    <div className="flex flex-wrap gap-2">
     <Badge variant="secondary">{config.data?.mode??"PREVIEW"}</Badge>
     <Badge variant="outline">Timezone: {config.data?.timezone??"Africa/Nairobi"}</Badge>
    </div>
    <p>{config.data?.notice??"Checking server delivery settings…"}</p>
    <p className="text-xs text-muted-foreground">
      The scheduler creates a reviewable queue. Live unattended sending requires separate
      business approval, server activation, a public HTTPS customer portal, approved provider
      credentials, and opt-in. No external messages in preview mode.
    </p>
   </div>
  </CardContent></Card>
  <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base">
    <CalendarClock className="size-4"/> Reminder policy
   </CardTitle></CardHeader>
   <CardContent className="space-y-5">
    {profile.isError?<p className="text-sm text-destructive">{profile.error.message}</p>:null}
    {policy?<>
     <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold">Schedule payment reminders</p>
       <p className="text-xs text-muted-foreground">Off by default for every business.</p></div>
      <Switch checked={policy.enabled} onCheckedChange={enabled=>setPolicy(p=>p?{...p,enabled}:p)}/>
     </div>
     <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label>Preferred channel</Label>
       <Select value={policy.channel} onValueChange={v=>setPolicy(p=>p?{...p,channel:v as AutomationPolicy["channel"]}:p)}>
        <SelectTrigger><SelectValue/></SelectTrigger>
        <SelectContent><SelectItem value="EMAIL">Email</SelectItem><SelectItem value="WHATSAPP">WhatsApp</SelectItem></SelectContent>
       </Select>
       <p className="text-xs text-muted-foreground">WhatsApp needs recorded customer opt-in and a separately approved reminder template.</p>
      </div>
      <div className="space-y-2"><Label>Days before due date (0 disables)</Label>
       <Input type="number" min={0} max={14} value={policy.dueSoonDays}
        onChange={e=>setPolicy(p=>p?{...p,dueSoonDays:Number(e.target.value)}:p)}/>
      </div>
      <div className="space-y-2"><Label>Overdue repeat interval in days (0 disables)</Label>
       <Input type="number" min={0} max={30} value={policy.overdueEveryDays}
        onChange={e=>setPolicy(p=>p?{...p,overdueEveryDays:Number(e.target.value)}:p)}/>
      </div>
      <div className="space-y-2"><Label>Max new reminders per check</Label>
       <Input type="number" min={1} max={100} value={policy.maxPerRun}
        onChange={e=>setPolicy(p=>p?{...p,maxPerRun:Number(e.target.value)}:p)}/>
      </div>
     </div>
     <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-medium">Create due-today reminders</p></div>
      <Switch checked={policy.onDue} onCheckedChange={onDue=>setPolicy(p=>p?{...p,onDue}:p)}/>
     </div>
     <div className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
      <div><p className="text-sm font-medium">Allow unattended live sending</p>
       <p className="max-w-md text-xs text-muted-foreground">
        Even when enabled here, the server refuses unattended live sending unless
        independent operator approval and provider settings are active.
       </p></div>
      <Switch checked={policy.autoSendEnabled}
       onCheckedChange={autoSendEnabled=>setPolicy(p=>p?{...p,autoSendEnabled}:p)}/>
     </div>
     <Button disabled={update.isPending} onClick={()=>void save()}>
      {update.isPending?"Saving…":"Save automation rules"}
     </Button>
     <p className="text-xs text-muted-foreground">
      Last scan: {policy.lastScannedAt?new Date(policy.lastScannedAt).toLocaleString():"Never"}.
      Automatic checks require the separately installed local scheduler; this page does not run in the background.
     </p>
    </>:<p className="text-sm text-muted-foreground">Loading business policy…</p>}
   </CardContent>
  </Card>
  <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
   <CardTitle className="flex items-center gap-2 text-base"><Send className="size-4"/> Reminders queue</CardTitle>
   <Button variant="outline" size="sm" onClick={()=>void jobs.refetch()}>Refresh</Button>
  </div></CardHeader>
  <CardContent className="space-y-3">
   {jobs.isPending?<p className="text-sm">Loading reminders…</p>:
    jobs.isError?<p className="text-sm text-destructive">{jobs.error.message}</p>:
    (jobs.data??[]).length===0?<p className="text-sm text-muted-foreground">
     No reminder jobs yet. Configure rules and select Run check now.
    </p>:
    <div className="space-y-2">
     {(jobs.data??[]).map(job=><div className="flex flex-wrap items-center justify-between gap-3 rounded border p-3" key={job.id}>
      <div className="space-y-1 text-sm">
       <div className="flex flex-wrap gap-2"><Badge variant="secondary">{job.kind.replaceAll("_"," ")}</Badge>
        <Badge variant={job.status==="FAILED"?"destructive":"outline"}>{job.status}</Badge>
        <span className="text-xs text-muted-foreground">{job.channel}</span></div>
       <Link to="/documents/$documentId" params={{documentId:job.documentId}}
        className="text-sm underline">Open invoice</Link>
       <p className="text-xs text-muted-foreground">
        Balance at scheduling: {job.currency} {job.balanceSnapshot.toLocaleString()} · {job.scheduledOn}
       </p>
       {job.holdCode?<p className="text-xs text-destructive">Reason: {job.holdCode}</p>:null}
       {job.status==="UNKNOWN"?<p className="text-xs text-destructive">
        Delivery may have happened. Check the provider/outbox before any further action.
       </p>:null}
      </div>
      {job.status==="READY"?<Button size="sm" variant="outline" disabled={deliver.isPending}
       onClick={()=>void send(job.id)}>
       <Send className="size-4"/>{config.data?.liveEnabled?"Send reminder":"Record preview"}
      </Button>:null}
     </div>)}
    </div>}
  </CardContent></Card>
  <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
   <CardTitle className="flex items-center gap-2 text-base">
    <BellRing className="size-4"/> Financial notifications
    {unread>0?<Badge>{unread} unread</Badge>:null}
   </CardTitle>
   <Button size="sm" variant="outline" onClick={()=>void notifications.refetch()}>Refresh</Button>
  </div></CardHeader>
  <CardContent className="space-y-2">
   {notifications.isPending?<p className="text-sm">Loading notifications…</p>:
    notifications.isError?<p className="text-sm text-destructive">{notifications.error.message}</p>:
    (notifications.data??[]).length===0?<p className="text-sm text-muted-foreground">
      No notifications yet. Checks include reminders, newly recorded payments and unverified M-Pesa C2B items.
    </p>:
    (notifications.data??[]).map(n=><div className="flex flex-wrap items-start justify-between gap-3 rounded border p-3" key={n.id}>
     <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
       <span className="text-sm font-medium">{n.title}</span>
       {!n.readAt?<Badge variant="secondary">New</Badge>:null}
      </div>
      <p className="text-xs text-muted-foreground">{n.message}</p>
      <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
     </div>
     {!n.readAt?<Button size="sm" variant="ghost" disabled={mark.isPending}
      onClick={()=>void mark.mutateAsync({businessId:businessId!,notificationId:n.id})
       .catch(error=>toast.error(error instanceof Error?error.message:"Could not mark read"))}>
       <CheckCheck className="size-4"/> Mark read
     </Button>:null}
    </div>)}
  </CardContent></Card>
 </div>;
}
