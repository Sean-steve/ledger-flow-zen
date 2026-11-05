import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, MessageCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/components/app-shell";
import {
  useCommunicationConfig,useCommunicationOutbox,
} from "@/lib/communications";

export const Route=createFileRoute("/_authenticated/outbox")({
  head:()=>({meta:[{title:"Communication Outbox — Financial Document OS"}]}),
  component:OutboxPage,
});
function OutboxPage(){
  const {businessId}=useWorkspace();
  const config=useCommunicationConfig();
  const records=useCommunicationOutbox(businessId);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl">Communication Outbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Email and WhatsApp requests, preview history and provider acceptance status.
        </p>
      </div>
      <Button variant="outline" onClick={()=>void records.refetch()}>Refresh</Button>
    </header>
    <Card><CardContent className="flex items-start gap-3 py-4">
      <ShieldAlert className="mt-1 size-5 shrink-0 text-muted-foreground"/>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{config.data?.mode==="live"?"Live delivery enabled":"Local preview mode"}</p>
        <p className="text-xs text-muted-foreground">
          {config.data?.notice??"Checking provider configuration…"}
        </p>
        <p className="text-xs text-muted-foreground">
          ACCEPTED means the provider accepted the request—not that the customer received it.
          UNKNOWN means delivery must be checked before resending.
        </p>
        <p className="text-xs text-muted-foreground">
          Send from a document or receipt. WhatsApp opt-in is recorded in Clients.
        </p>
      </div>
    </CardContent></Card>
    {records.isPending?<p className="text-sm text-muted-foreground">Loading outbox…</p>:
     records.isError?<Card><CardContent className="space-y-3 py-8">
       <p className="text-sm text-destructive">{records.error?.message}</p>
       <p className="text-xs">Restart the local API to apply the Phase 3 migration.</p>
     </CardContent></Card>:
     (records.data??[]).length===0?<Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
       No communication attempts yet. Open <Link className="underline" to="/documents">Documents</Link> to create the first preview.
     </CardContent></Card>:
     <div className="space-y-3">
      {(records.data??[]).map(row=><Card key={row.id}>
       <CardHeader className="pb-2"><div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
           {row.channel==="EMAIL"?<Mail className="size-4"/>:<MessageCircle className="size-4"/>}
           {row.subject}
          </CardTitle>
          <Badge variant={row.status==="FAILED"?"destructive":"secondary"}>{row.status}</Badge>
       </div></CardHeader>
       <CardContent className="space-y-1 text-xs text-muted-foreground">
        <p>{row.channel} → {row.recipient}</p>
        <p>Created {new Date(row.created_at).toLocaleString()} · {row.delivery_mode.toUpperCase()}</p>
        {row.provider_id?<p className="break-all">Provider ID: {row.provider_id}</p>:null}
        {row.provider_error_code?<p className="text-destructive">Provider result: {row.provider_error_code}</p>:null}
        <p className="break-words">{row.preview_text}</p>
       </CardContent>
      </Card>)}
     </div>
    }
  </div>;
}
