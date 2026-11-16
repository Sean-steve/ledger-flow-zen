import {createFileRoute,Link,useNavigate} from "@tanstack/react-router";
import {useMemo} from "react";
import {ShieldAlert,DatabaseBackup,RefreshCcw,LogOut,CheckCircle2,Info} from "lucide-react";
import {toast} from "sonner";
import {useWorkspace} from "@/components/app-shell";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {useReadiness,useRevokeAllSessions} from "@/lib/operational-readiness";
export const Route=createFileRoute("/_authenticated/system-status")({
 head:()=>({meta:[{title:"System Readiness — Financial Document OS"}]}),
 component:SystemReadiness,
});
function SystemReadiness(){
 const {businessId,business}=useWorkspace();
 const report=useReadiness(businessId);
 const revoke=useRevokeAllSessions();
 const navigate=useNavigate();
 const checks=useMemo(()=>Object.entries(report.data?.database.moduleChecks??{}),[report.data]);
 async function logoutEverything(){
  if(!window.confirm("Sign out all sessions for your account on every device?"))return;
  try{
   await revoke.mutateAsync();
   toast.success("All local sessions revoked");
   await navigate({to:"/auth",replace:true});
  }catch(error){toast.error(error instanceof Error?error.message:"Could not revoke sessions");}
 }
 return <div className="space-y-6">
  <header className="flex flex-wrap items-start justify-between gap-4">
   <div><h1 className="text-3xl">System Readiness</h1>
    <p className="mt-1 text-sm text-muted-foreground">
     Local operational diagnostics for {business.name}. This is not a production certificate.
    </p></div>
   <Button variant="outline" onClick={()=>void report.refetch()} disabled={report.isFetching}>
    <RefreshCcw className="size-4"/>{report.isFetching?"Checking…":"Run checks"}
   </Button>
  </header>
  {report.isError?<Card><CardContent className="py-6 text-sm text-destructive">
   {report.error.message}. Operational diagnostics are restricted to business owners and admins.
  </CardContent></Card>:null}
  {report.data?<div className="space-y-6">
   <Card className="border-destructive/35"><CardContent className="flex flex-wrap items-start gap-4 py-5">
    <ShieldAlert className="size-7 shrink-0 text-destructive"/>
    <div className="space-y-2">
     <Badge variant="destructive">PRODUCTION BLOCKED</Badge>
     <p className="text-sm">Local development and testing may continue.
      This application is not a certified public financial service.</p>
     <p className="text-xs text-muted-foreground">
      Last checked: {new Date(report.data.checkedAt).toLocaleString()} ·
      Backend: {report.data.runtime.backend} · PostgreSQL {report.data.database.postgresMajor}.
     </p>
    </div>
   </CardContent></Card>
   <div className="grid gap-4 md:grid-cols-2">
    <Card><CardHeader><CardTitle className="text-base">Local database modules</CardTitle></CardHeader>
     <CardContent className="space-y-2 text-sm">
      {checks.map(([name,passed])=><div className="flex items-center justify-between" key={name}>
       <span className="capitalize">{name.replaceAll("_"," ")}</span>
       <Badge variant={passed?"secondary":"destructive"}>{passed?"Available":"Missing"}</Badge>
      </div>)}
      {report.data.database.moduleReady?<p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-4"/>Core local modules detected.</p>:null}
     </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Items needing review</CardTitle></CardHeader>
     <CardContent className="space-y-2 text-sm">
      {Object.entries(report.data.financialWorklist).map(([key,count])=>
       <div className="flex items-center justify-between gap-2" key={key}>
        <span className="capitalize">{key.replace(/([a-z])([A-Z])/g,"$1 $2")}</span>
        <Badge variant={count>0?"destructive":"secondary"}>{count}</Badge>
       </div>)}
      <p className="pt-2 text-xs text-muted-foreground">
       Unverified M-Pesa transactions, unknown provider outcomes and non-fiscalized invoices
       must not be represented as independently verified.
      </p>
     </CardContent></Card>
   </div>
   <Card><CardHeader><CardTitle className="text-base">External provider activation</CardTitle></CardHeader>
    <CardContent className="grid gap-3 text-sm md:grid-cols-3">
     <div className="rounded border p-3">Messages: <strong>{report.data.providers.communications}</strong>
      <p className="text-xs text-muted-foreground">Email configured: {report.data.providers.emailConfigured?"Yes":"No"}</p>
      <p className="text-xs text-muted-foreground">WhatsApp configured: {report.data.providers.whatsappConfigured?"Yes":"No"}</p></div>
     <div className="rounded border p-3">M-Pesa: <strong>{report.data.providers.mpesa}</strong>
      <p className="text-xs text-muted-foreground">Production collection not certified.</p></div>
     <div className="rounded border p-3">KRA eTIMS: <strong>{report.data.providers.etims}</strong>
      <p className="text-xs text-muted-foreground">Certified invoice transmission deferred.</p></div>
    </CardContent></Card>
   <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base">
    <ShieldAlert className="size-5"/>Outstanding production release gates</CardTitle></CardHeader>
    <CardContent><ol className="list-decimal space-y-3 pl-5 text-sm">
     {report.data.productionBlockers.map(x=><li key={x}>{x}</li>)}
    </ol></CardContent></Card>
  </div>:null}
  <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base">
   <DatabaseBackup className="size-5"/>Backup and recovery</CardTitle></CardHeader>
   <CardContent className="space-y-3 text-sm">
    <p>Create a local PostgreSQL backup and validate it by restoring into
     a disposable database before releasing software or applying new migrations.
     The source volume is preserved.</p>
    <code className="block overflow-auto rounded bg-muted p-3 text-xs">bash scripts/recovery/backup-local.sh</code>
    <code className="block overflow-auto rounded bg-muted p-3 text-xs">bash scripts/recovery/verify-local-backup.sh /full/path/to/backup.dump</code>
    <p className="text-xs text-muted-foreground">
     Backup files contain sensitive financial records and password hashes. Encrypt
     before off-host storage. No backups or production deployments occur automatically.
    </p>
   </CardContent></Card>
  <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base">
   <LogOut className="size-5"/>Session security</CardTitle></CardHeader>
   <CardContent className="space-y-3">
    <p className="text-sm">Revoke all local sessions associated with your account, including this one.</p>
    <Button variant="outline" onClick={()=>void logoutEverything()} disabled={revoke.isPending}>
     <LogOut className="size-4"/>{revoke.isPending?"Revoking…":"Sign out everywhere"}
    </Button>
   </CardContent></Card>
  <p className="flex items-center gap-2 text-xs text-muted-foreground">
   <Info className="size-4"/>See <Link to="/configuration" className="underline">Business Setup</Link>
   for owner-managed provider permissions. Production activation is a separate project gate.
  </p>
 </div>;
}
