import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,SelectContent,SelectItem,SelectTrigger,SelectValue,
} from "@/components/ui/select";
import {
  useCommunicationPreferences,useUpdateCommunicationPreferences,
} from "@/lib/communications";

export function ClientCommunicationPreferences({
 open,onOpenChange,businessId,clientId,clientName,
}: {
 open:boolean;onOpenChange:(open:boolean)=>void;
 businessId:string;clientId:string;clientName:string;
}){
 const preferences=useCommunicationPreferences(businessId,clientId);
 const save=useUpdateCommunicationPreferences();
 const [evidence,setEvidence]=useState<"DIRECT_REQUEST"|"WEB_FORM"|"WRITTEN"|"OTHER">("DIRECT_REQUEST");
 const [confirmed,setConfirmed]=useState(false);
 const prefs=preferences.data;
 async function update(channel:"EMAIL"|"WHATSAPP",optedIn:boolean){
  if(channel==="WHATSAPP"&&optedIn&&!confirmed){
    toast.error("Confirm that the customer gave permission first");return;
  }
  try{
    await save.mutateAsync({businessId,clientId,channel,optedIn,source:evidence});
    toast.success("Communication preference saved");setConfirmed(false);
  }catch(error){toast.error(error instanceof Error?error.message:"Could not save preference");}
 }
 return <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-lg">
   <DialogHeader><DialogTitle>Messaging preferences · {clientName}</DialogTitle></DialogHeader>
   {preferences.isPending?<p className="text-sm">Loading preferences…</p>:
    preferences.isError?<p className="text-sm text-destructive">{preferences.error.message}</p>:
    <div className="space-y-5">
     <Card><CardContent className="space-y-3 py-4">
      <p className="text-sm font-medium">WhatsApp customer permission</p>
      <p className="text-xs text-muted-foreground">
       Record consent only after the customer clearly agrees to receive financial document messages.
       Opt-out takes effect immediately.
      </p>
      <p className="text-xs">Status: <strong>{prefs?.whatsappOptedIn?"Opted in":"Not opted in"}</strong></p>
      {!prefs?.whatsappOptedIn?
       <>
        <Label>Consent evidence</Label>
        <Select value={evidence} onValueChange={v=>setEvidence(v as typeof evidence)}>
         <SelectTrigger><SelectValue/></SelectTrigger>
         <SelectContent>
          <SelectItem value="DIRECT_REQUEST">Direct customer request</SelectItem>
          <SelectItem value="WEB_FORM">Website form</SelectItem>
          <SelectItem value="WRITTEN">Written permission</SelectItem>
          <SelectItem value="OTHER">Other verified consent</SelectItem>
         </SelectContent>
        </Select>
        <label className="flex items-start gap-2 text-xs">
         <Checkbox checked={confirmed} onCheckedChange={v=>setConfirmed(v===true)}/>
         I confirm this customer opted in to receive business document messages on WhatsApp.
        </label>
        <Button disabled={!confirmed||save.isPending} onClick={()=>void update("WHATSAPP",true)}>
          Record WhatsApp opt-in
        </Button>
       </>:
       <Button variant="outline" disabled={save.isPending} onClick={()=>void update("WHATSAPP",false)}>
        Record WhatsApp opt-out
       </Button>}
     </CardContent></Card>
     <Card><CardContent className="space-y-3 py-4">
      <p className="text-sm font-medium">Email document notifications</p>
      <p className="text-xs text-muted-foreground">
       Current preference: {prefs?.emailOptedOut?"Opted out":"Allowed"}
      </p>
      <Button variant="outline" disabled={save.isPending}
       onClick={()=>void update("EMAIL",Boolean(prefs?.emailOptedOut))}>
       {prefs?.emailOptedOut?"Allow email notifications":"Record email opt-out"}
      </Button>
     </CardContent></Card>
    </div>}
   <DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Close</Button></DialogFooter>
  </DialogContent>
 </Dialog>;
}
