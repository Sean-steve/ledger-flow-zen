import { createFileRoute,Link } from "@tanstack/react-router";
import { useEffect,useMemo,useState } from "react";
import { toast } from "sonner";
import { Smartphone,ShieldAlert,RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,SelectContent,SelectItem,SelectTrigger,SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/app-shell";
import { useClients,useDocuments,useLedger } from "@/lib/db";
import { money } from "@/lib/format";
import {
 useMpesaConfig,useMpesaProfile,useMpesaIntents,useMpesaMetrics,
 useMpesaC2bInbox,useSaveMpesaProfile,useCreateMpesaRequest,
 useSimulateMpesaConfirmation,
} from "@/lib/mpesa";

export const Route=createFileRoute("/_authenticated/mpesa")({
 head:()=>({meta:[{title:"M-Pesa Payments — Financial Document OS"}]}),
 component:MpesaPage,
});
function MpesaPage(){
 const {businessId}=useWorkspace();
 const config=useMpesaConfig();
 const profile=useMpesaProfile(businessId);
 const intents=useMpesaIntents(businessId);
 const metrics=useMpesaMetrics(businessId);
 const inbox=useMpesaC2bInbox(businessId);
 const clients=useClients(businessId);
 const documents=useDocuments(businessId);
 const ledger=useLedger(businessId);
 const save=useSaveMpesaProfile();
 const request=useCreateMpesaRequest();
 const simulate=useSimulateMpesaConfirmation();
 const [shortcode,setShortcode]=useState("");
 const [shortcodeType,setShortcodeType]=useState<"PAYBILL"|"TILL">("PAYBILL");
 const [invoiceId,setInvoiceId]=useState("");
 const [phone,setPhone]=useState("");
 const [amount,setAmount]=useState("");
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 useEffect(()=>{
  setShortcode(profile.data?.shortcode??"");
  setShortcodeType(profile.data?.shortcodeType??"PAYBILL");
 },[profile.data]);
 const invoices=useMemo(()=>{
  const outstanding=new Map((ledger.data??[]).map(row=>[row.invoice_id,Number(row.balance??0)]));
  return (documents.data??[]).filter(d=>
    d.type==="INVOICE"&&d.status==="ISSUED"&&d.currency==="KES"&&
    (outstanding.get(d.id)??0)>=1).map(d=>({
      id:d.id,number:d.doc_number??"Invoice",
      clientId:d.client_id,balance:outstanding.get(d.id)??0,
    }));
 },[documents.data,ledger.data]);
 const selected=invoices.find(i=>i.id===invoiceId);
 function pickInvoice(value:string){
  setInvoiceId(value);setRequestKey(crypto.randomUUID());
  const item=invoices.find(i=>i.id===value);
  if(item){
    setPhone(clients.data?.find(c=>c.id===item.clientId)?.phone??"");
    setAmount(String(Math.floor(item.balance)));
  }
 }
 async function saveProfile(){
  try{
   await save.mutateAsync({businessId,shortcode,shortcodeType});
   toast.success("M-Pesa profile saved (no provider activated)");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not save shortcode");}
 }
 async function createRequest(){
  if(!selected)return;
  try{
   const result=await request.mutateAsync({
    businessId,invoiceId,phone,amount:Number(amount),requestKey,
   });
   toast.success(result.status==="PREVIEW"?
    "Local test request created — no phone prompt sent":
    result.status==="PENDING"?"Safaricom sandbox accepted test STK request":
    "Request needs review");
   setRequestKey(crypto.randomUUID());
  }catch(e){toast.error(e instanceof Error?e.message:"Could not create request");}
 }
 async function confirm(id:string){
  try{
   const r=await simulate.mutateAsync({businessId,intentId:id});
   if(r.status==="CONFIRMED")
     toast.success("Simulated payment posted — test receipt generated");
   else toast.error("Confirmation needs review; no payment posted");
  }catch(e){toast.error(e instanceof Error?e.message:"Could not simulate confirmation");}
 }
 function reload(){
  void intents.refetch();void inbox.refetch();void metrics.refetch();void ledger.refetch();
 }
 const preview=config.data?.mode!=="SANDBOX";
 return <div className="space-y-6">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div><h1 className="text-3xl">M-Pesa Payments</h1>
    <p className="mt-1 text-sm text-muted-foreground">STK requests, payment confirmation, invoice allocation and receipt tracking.</p></div>
   <Button variant="outline" onClick={reload}><RefreshCw className="size-4"/> Refresh</Button>
  </header>
  <Card><CardContent className="space-y-2 py-4">
    <div className="flex flex-wrap gap-2">
     <Badge variant="secondary">{preview?"LOCAL TEST / NO REAL MONEY":"DARAJA SANDBOX"}</Badge>
     <Badge variant="outline">PRODUCTION DISABLED</Badge>
    </div>
    <p className="text-sm">{config.data?.notice??"Reading payment mode…"}</p>
    <p className="text-xs text-muted-foreground">A test confirmation creates a local-only test receipt.
     C2B callback records are not payment proof. No live Safaricom traffic or real customer charging is enabled.</p>
   </CardContent></Card>
  <div className="grid gap-3 md:grid-cols-4">
   {([
    ["Requests pending",String((metrics.data?.pending_simulations??0)+(metrics.data?.pending_stk??0))],
    ["Confirmed test transactions",String(metrics.data?.confirmed??0)],
    ["Exceptions",String(metrics.data?.exceptions??0)],
    ["C2B review",String(metrics.data?.c2b_review_count??0)],
   ] as const).map(([label,value])=><Card key={label}><CardContent className="py-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold">{value}</p>
   </CardContent></Card>)}
  </div>
  <Card><CardHeader><CardTitle className="text-base">Business Paybill / Till configuration</CardTitle></CardHeader>
   <CardContent className="space-y-3">
    <p className="text-xs text-muted-foreground">Saved per business. Daraja sandbox keys stay in server environment variables.</p>
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
     <div className="space-y-1"><Label>Shortcode</Label>
      <Input inputMode="numeric" value={shortcode} onChange={e=>setShortcode(e.target.value)} placeholder="174379"/></div>
     <div className="space-y-1"><Label>Type</Label>
      <Select value={shortcodeType} onValueChange={v=>setShortcodeType(v as typeof shortcodeType)}>
       <SelectTrigger><SelectValue/></SelectTrigger>
       <SelectContent><SelectItem value="PAYBILL">Paybill</SelectItem><SelectItem value="TILL">Till</SelectItem></SelectContent>
      </Select>
     </div>
     <div className="flex items-end"><Button disabled={save.isPending||!shortcode} onClick={()=>void saveProfile()}>
      Save shortcode</Button></div>
    </div>
   </CardContent>
  </Card>
  <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Smartphone className="size-4"/>
   Request STK payment</CardTitle></CardHeader>
   <CardContent className="space-y-4">
    <p className="text-xs text-muted-foreground">
     Select an issued KES invoice. Payments can be partial, but a request cannot exceed the outstanding balance.
     M-Pesa STK requests use whole KES amounts.
    </p>
    <div className="space-y-2"><Label>Invoice</Label>
     <Select value={invoiceId} onValueChange={pickInvoice}>
      <SelectTrigger><SelectValue placeholder="Choose an invoice"/></SelectTrigger>
      <SelectContent>{invoices.map(i=><SelectItem key={i.id} value={i.id}>
       {i.number} · {money(i.balance,"KES")} outstanding
      </SelectItem>)}</SelectContent>
     </Select>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
     <div className="space-y-1"><Label>Customer phone</Label>
      <Input value={phone} onChange={e=>{setPhone(e.target.value);setRequestKey(crypto.randomUUID());}}
       placeholder="0712345678"/></div>
     <div className="space-y-1"><Label>Amount (whole KES)</Label>
      <Input type="number" min={1} step={1} value={amount}
       onChange={e=>{setAmount(e.target.value);setRequestKey(crypto.randomUUID());}}/>
     </div>
    </div>
    <Button disabled={!selected||!profile.data?.shortcode||request.isPending||
      (!preview&&!config.data?.sandboxReady)||!phone||!Number(amount)}
      onClick={()=>void createRequest()}>
      {request.isPending?"Processing…":
        preview?"Create local STK test request":"Request Safaricom sandbox STK"}
    </Button>
   </CardContent>
  </Card>
  <Card><CardHeader><CardTitle className="text-base">STK request history</CardTitle></CardHeader>
   <CardContent className="space-y-3">
    {intents.isPending?<p className="text-sm">Loading requests…</p>:
     intents.isError?<p className="text-sm text-destructive">{intents.error.message}</p>:
     !intents.data?.length?<p className="text-sm text-muted-foreground">No STK requests yet.</p>:
     intents.data.map(item=><div key={item.id} className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <span className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{item.mode==="PREVIEW"?"TEST":"SANDBOX"}</Badge>
        <Badge variant={item.status==="FAILED"?"destructive":"outline"}>{item.status}</Badge>
        <strong>{money(item.amount,"KES")}</strong>
       </span>
       <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p className="mt-2 text-xs">Invoice:
       {" "}<Link className="underline" to="/documents/$documentId" params={{documentId:item.invoiceId}}>View invoice</Link>
       {" · "}Phone {item.phoneMasked}
      </p>
      {item.errorCode?<p className="mt-1 text-xs text-destructive">{item.errorCode}</p>:null}
      {item.status==="PREVIEW"?<Button size="sm" variant="outline" className="mt-2"
       disabled={simulate.isPending}
       onClick={()=>void confirm(item.id)}>Simulate successful payment (TEST ONLY)</Button>:null}
      {item.status==="CONFIRMED"?<p className="mt-2 text-xs">
       {item.providerReceipt} · <Link className="underline" to="/receipts">Receipt ready — view and send</Link>
      </p>:null}
      {["UNKNOWN","REVIEW_REQUIRED"].includes(item.status)?
       <p className="mt-2 text-xs text-destructive">
        Outcome requires independent verification. Do not retry payment or mark invoice paid automatically.
       </p>:null}
     </div>)}
   </CardContent>
  </Card>
  <Card><CardHeader><CardTitle className="text-base">Unverified C2B / Paybill confirmations</CardTitle></CardHeader>
   <CardContent className="space-y-3">
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
     <ShieldAlert className="mt-0.5 size-4 shrink-0"/>
     These callbacks are evidence only. Check the M-Pesa organization statement or an authenticated
     transaction-status result before recording funds manually in Payments. No receipt is issued here.
    </div>
    {inbox.isPending?<p className="text-sm">Loading confirmations…</p>:
     inbox.isError?<p className="text-sm text-destructive">{inbox.error.message}</p>:
     !inbox.data?.length?<p className="text-sm text-muted-foreground">No C2B confirmations received.</p>:
     inbox.data.map(row=><div className="rounded-md border p-3 text-xs" key={row.id}>
      <div className="flex flex-wrap items-center gap-2">
       <Badge variant="destructive">{row.status}</Badge>
       <span>{money(row.amount,"KES")} · Ref {row.provider_receipt}</span>
      </div>
      <p className="mt-1 text-muted-foreground">Account: {row.bill_reference??"Not provided"}
        {" · "}Customer {row.phone_masked??"Unknown"}</p>
     </div>)}
    <Button variant="outline" asChild size="sm"><Link to="/payments">Go to manual Payments →</Link></Button>
   </CardContent>
  </Card>
 </div>;
}
