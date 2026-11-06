import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,SelectContent,SelectItem,SelectTrigger,SelectValue,
} from "@/components/ui/select";
import {
  useCommunicationConfig,useSendCommunication,
  type CommunicationChannel,type CommunicationRecord,
} from "@/lib/communications";

export function CommunicationSendDialog({
  open,onOpenChange,businessId,documentId,receiptId,reference,clientEmail,clientPhone,
}: {
  open:boolean;
  onOpenChange:(next:boolean)=>void;
  businessId:string;
  documentId?:string | undefined;
  receiptId?:string | undefined;
  reference:string;
  clientEmail?:string | null | undefined;
  clientPhone?:string | null | undefined;
}) {
  const config=useCommunicationConfig();
  const send=useSendCommunication();
  const [channel,setChannel]=useState<CommunicationChannel>("EMAIL");
  const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
  const [result,setResult]=useState<CommunicationRecord|null>(null);
  function reset(next:boolean) {
    if(!next){setRequestKey(crypto.randomUUID());setResult(null);send.reset();}
    onOpenChange(next);
  }
  async function submit() {
    try {
      const record=await send.mutateAsync({
        businessId,...(documentId?{documentId}:{}),...(receiptId?{receiptId}:{}),channel,requestKey,
      });
      setResult(record);
      toast.success(record.status==="PREVIEW"?"Local preview recorded":
        record.status==="ACCEPTED"?"Provider accepted the message":"Delivery requires review");
    }catch(error) {
      toast.error(error instanceof Error?error.message:"Communication failed");
    }
  }
  const live=config.data?.mode==="live";
  const destination=channel==="EMAIL"?clientEmail:clientPhone;
  const ready=channel==="EMAIL"?config.data?.emailConfigured:config.data?.whatsappConfigured;
  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send {reference}</DialogTitle>
          <DialogDescription>
            {config.data?.notice??"Checking communication settings…"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Delivery channel</Label>
            <Select value={channel} onValueChange={v=>{
              setChannel(v as CommunicationChannel);
              setResult(null);setRequestKey(crypto.randomUUID());send.reset();
            }}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="EMAIL"><span className="inline-flex items-center gap-2"><Mail className="size-4"/>Email</span></SelectItem>
                <SelectItem value="WHATSAPP"><span className="inline-flex items-center gap-2"><MessageCircle className="size-4"/>WhatsApp</span></SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{live?"Live provider":"Local preview"}</span>
              <Badge variant={live?"default":"secondary"}>{live?"LIVE":"PREVIEW"}</Badge>
            </div>
            <p className="mt-2 break-all text-muted-foreground">
              Recipient: {destination || "No contact details recorded"}
            </p>
            {live&&!ready?<p className="mt-2 text-destructive">Provider credentials or public HTTPS URL are missing.</p>:null}
            {channel==="WHATSAPP"?
              <p className="mt-2 text-xs text-muted-foreground">
                Live WhatsApp delivery requires recorded client opt-in and an approved Meta template.
                Record consent on the Clients page before sending.
              </p>:null}
            {!live?<p className="mt-2 text-xs text-muted-foreground">No email or WhatsApp message will be sent in preview mode. Customer links remain local.</p>:null}
          </div>
          {result?
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <Badge variant={result.status==="FAILED"?"destructive":"secondary"}>{result.status}</Badge>
              <p className="break-words">{result.preview_text}</p>
              {result.status==="ACCEPTED"?<p className="text-xs text-muted-foreground">Accepted by provider, not confirmed delivered. Provider message ID: {result.provider_id}</p>:null}
              {result.status==="UNKNOWN"?<p className="text-xs text-destructive">Delivery status is uncertain. Check your provider account before making a new request to avoid duplicate messages.</p>:null}
              {result.status==="FAILED"?<p className="text-xs text-destructive">Provider rejected the message. Check configuration and outbox history.</p>:null}
            </div>:null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={()=>reset(false)}>Close</Button>
          {!result?
            <Button disabled={send.isPending||!destination||(live&&!ready)} onClick={()=>void submit()}>
              <Send className="size-4"/>{send.isPending?"Processing…":live?"Send to customer":"Create preview"}
            </Button>:null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function CommunicationStatus({status}: {status:CommunicationRecord["status"]}):ReactNode{
  return <Badge variant={status==="FAILED"?"destructive":"secondary"}>{status}</Badge>;
}
