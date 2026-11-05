import { createFileRoute,Link } from "@tanstack/react-router";
import { useEffect,useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/components/app-shell";
import {
 useFiscalConfig,useFiscalProfile,useFiscalSubmissions,useSaveFiscalProfile,
} from "@/lib/fiscal";

export const Route=createFileRoute("/_authenticated/fiscal")({
 head:()=>({meta:[{title:"KRA eTIMS Fiscal Center — Financial Document OS"}]}),
 component:FiscalCenter,
});
const TAXES=["VAT_16","VAT_8","ZERO_RATED","EXEMPT"] as const;
function FiscalCenter(){
 const {businessId}=useWorkspace();
 const config=useFiscalConfig();
 const profile=useFiscalProfile(businessId);
 const submissions=useFiscalSubmissions(businessId);
 const save=useSaveFiscalProfile();
 const [branch,setBranch]=useState("00");
 const [device,setDevice]=useState("");
 const [tax,setTax]=useState<Record<string,string>>({});
 useEffect(()=>{
  if(!profile.data)return;
  setBranch(profile.data.branchId);
  setDevice(profile.data.deviceSerial??"");
  setTax(profile.data.taxMapping);
 },[profile.data]);
 async function apply(){
  if(!businessId)return;
  try{
   await save.mutateAsync({
    businessId,branchId:branch,deviceSerial:device||null,
    taxMapping:Object.fromEntries(Object.entries(tax).filter(([,v])=>v.trim())),
   });
   toast.success("OSCU profile saved; this does not activate KRA");
  }catch(error){toast.error(error instanceof Error?error.message:"Could not save fiscal profile");}
 }
 return <div className="space-y-6">
  <header><h1 className="text-3xl">KRA eTIMS Fiscal Center</h1>
   <p className="mt-1 text-sm text-muted-foreground">
    OSCU setup, tax mapping and fiscal evidence. Production KRA transmission is disabled.
   </p></header>
  <Card><CardContent className="space-y-2 py-4">
   <div className="flex flex-wrap gap-2">
    <Badge variant="secondary">{config.data?.mode??"PREVIEW"}</Badge>
    <Badge variant="outline">NOT KRA CERTIFIED</Badge>
   </div>
   <p className="text-sm">{config.data?.notice??"Checking KRA adapter…"}</p>
   <p className="text-xs text-muted-foreground">KRA sandbox submissions need an approved OSCU test device and a configured sidecar.
     PREVIEW mode contacts no KRA service. The app does not issue a tax-compliant fiscal invoice.</p>
  </CardContent></Card>
  <Card><CardHeader><CardTitle className="text-base">OSCU business profile</CardTitle></CardHeader>
   <CardContent className="space-y-4">
    {profile.isError?<p className="text-sm text-destructive">{profile.error.message}</p>:null}
    <p className="text-sm">KRA PIN: <strong>{profile.data?.taxpayerPin??"Missing"}</strong>
      {" · "}Solution: <strong>OSCU</strong></p>
    {!profile.data?.taxpayerPin?<p className="text-xs text-destructive">
     Set your actual KRA PIN in <Link className="underline" to="/settings">Settings</Link> first.
    </p>:null}
    <div className="grid gap-4 md:grid-cols-2">
     <div className="space-y-2"><Label>OSCU branch ID</Label>
      <Input value={branch} onChange={e=>setBranch(e.target.value)} maxLength={4} placeholder="00"/></div>
     <div className="space-y-2"><Label>OSCU device serial (from KRA approval)</Label>
      <Input value={device} onChange={e=>setDevice(e.target.value)} placeholder="Authorized sandbox device ID"/></div>
    </div>
    <div className="space-y-2">
     <p className="text-sm font-medium">Tax category → certified OSCU code</p>
     <p className="text-xs text-muted-foreground">
      Do not guess codes. Populate these only from the approved KRA OSCU specification
      and the registered test device/integrator's mapping.
     </p>
     <div className="grid gap-3 md:grid-cols-2">
      {TAXES.map(category=><div className="space-y-1" key={category}>
       <Label>{category}</Label>
       <Input value={tax[category]??""}
        onChange={e=>setTax(prev=>({...prev,[category]:e.target.value}))}
        placeholder="Official code"/>
      </div>)}
     </div>
    </div>
    <Button disabled={save.isPending||profile.isPending} onClick={()=>void apply()}>
     {save.isPending?"Saving…":"Save OSCU profile"}
    </Button>
   </CardContent>
  </Card>
  <Card><CardHeader><CardTitle className="text-base">Submission ledger</CardTitle></CardHeader>
   <CardContent className="space-y-3">
    <Button size="sm" variant="outline" onClick={()=>void submissions.refetch()}>Refresh status</Button>
    {submissions.isPending?<p className="text-sm">Loading fiscal records…</p>:
     submissions.isError?<p className="text-sm text-destructive">{submissions.error.message}</p>:
     (submissions.data??[]).length===0?<p className="text-sm text-muted-foreground">
      No fiscal previews or sandbox test submissions yet. Open an issued invoice to begin.
     </p>:
     <div className="space-y-2">
      {(submissions.data??[]).map(record=><div key={record.id} className="rounded border p-3 text-sm">
       <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="space-x-2">
         <Badge variant="secondary">{record.mode}</Badge>
         <Badge variant={record.status==="REJECTED"?"destructive":"outline"}>{record.status}</Badge>
        </span>
        <Link to="/documents/$documentId" params={{documentId:record.documentId}}
         className="text-xs underline">View document</Link>
       </div>
       <p className="mt-2 text-xs text-muted-foreground">
        {new Date(record.createdAt).toLocaleString()} · SHA-256 {record.snapshotSha256.slice(0,20)}…
       </p>
       {record.sandboxReceiptNumber?<p className="text-xs">Sandbox receipt: {record.sandboxReceiptNumber}</p>:null}
       {record.errorCode?<p className="text-xs text-destructive">State: {record.errorCode}</p>:null}
       {record.status==="UNKNOWN"?<p className="text-xs text-destructive">
        Never resubmit before reconciling the outcome with the authorized OSCU test device.
       </p>:null}
      </div>)}
     </div>}
   </CardContent>
  </Card>
  <p className="text-xs text-muted-foreground">
   Credit notes must reference an original invoice fiscalized by the same OSCU sandbox.
   Production certification, QR/signature verification and KRA acceptance remain separate gates.
  </p>
 </div>;
}
