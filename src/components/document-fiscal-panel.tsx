import { useState } from "react";
import { FileCheck2,ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import {
 useFiscalConfig,useFiscalDocument,usePrepareFiscal,
} from "@/lib/fiscal";

export function DocumentFiscalPanel({
 businessId,documentId,documentType,docNumber,documentStatus,
}:{
 businessId:string;documentId:string;documentType:string;
 docNumber:string|null;documentStatus:string;
}){
 const config=useFiscalConfig();
 const records=useFiscalDocument(businessId,documentId);
 const prepare=usePrepareFiscal();
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 const available=["INVOICE","CREDIT_NOTE"].includes(documentType)&&
   documentStatus==="ISSUED";
 async function submit(mode:"PREVIEW"|"SANDBOX"){
  try{
   const result=await prepare.mutateAsync({businessId,documentId,mode,requestKey});
   setRequestKey(crypto.randomUUID());
   toast.success(result.duplicate?"Fiscal request already recorded":
    result.status==="PREVIEW"?"Fiscal preview created":
    result.status==="SANDBOX_ACKNOWLEDGED"?"OSCU sandbox acknowledgment recorded":
    "Sandbox outcome requires review");
  }catch(error){
   toast.error(error instanceof Error?error.message:"Could not prepare fiscal submission");
  }
 }
 return <Card className="print:hidden">
  <CardHeader><CardTitle className="flex items-center gap-2 text-base">
   <FileCheck2 className="size-4"/> KRA eTIMS · fiscal evidence
  </CardTitle></CardHeader>
  <CardContent className="space-y-3">
   <p className="text-xs text-muted-foreground">
     {config.data?.notice??"Loading fiscal integration mode…"}
   </p>
   <div className="flex flex-wrap gap-2">
    <Badge variant="secondary">{config.data?.mode??"PREVIEW"}</Badge>
    <Badge variant="outline">Production not certified</Badge>
   </div>
   {available?<>
    <p className="text-xs text-muted-foreground">
      {docNumber}: previews never contact KRA. Sandbox results are test evidence
      only and do not produce a valid fiscal tax invoice.
    </p>
    <Button size="sm" className="w-full" variant="outline"
      disabled={prepare.isPending||config.isPending}
      onClick={()=>void submit("PREVIEW")}>
      {prepare.isPending?"Processing…":"Prepare fiscal preview"}
    </Button>
    <Button size="sm" className="w-full"
      disabled={prepare.isPending||!config.data?.sandboxReady}
      onClick={()=>void submit("SANDBOX")}>
      Submit to approved OSCU sandbox
    </Button>
   </>:<p className="text-xs text-muted-foreground">
    Fiscal preparation is limited to issued, non-void invoices and credit notes.
   </p>}
   {records.isError?<p className="text-xs text-destructive">
    {records.error.message}</p>:null}
   {(records.data??[]).map(record=><div key={record.id} className="space-y-1 rounded-md border p-2 text-xs">
    <div className="flex items-center gap-2"><Badge variant="secondary">{record.status}</Badge>
     <span>{record.mode}</span></div>
    <p>Fingerprint: {record.snapshotSha256.slice(0,16)}…</p>
    {record.sandboxReceiptNumber?<p>Test receipt: {record.sandboxReceiptNumber}</p>:null}
    {record.errorCode?<p className="text-destructive">Issue: {record.errorCode}</p>:null}
    {record.status==="UNKNOWN"?<p className="text-destructive">Do not resend until you reconcile with the OSCU sandbox.</p>:null}
   </div>)}
   <p className="flex items-start gap-1 text-xs text-muted-foreground">
    <ShieldAlert className="mt-0.5 size-3 shrink-0"/>
    KRA control codes and QR/signatures are never invented.
   </p>
   <Button variant="ghost" asChild size="sm">
    <Link to="/fiscal">Open Fiscal Center →</Link>
   </Button>
  </CardContent>
 </Card>;
}
