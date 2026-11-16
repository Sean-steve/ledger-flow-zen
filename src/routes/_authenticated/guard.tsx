import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link2, RefreshCcw, ShieldCheck, Send, LockKeyhole, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/app-shell";
import { useSession, useLedger } from "@/lib/db";
import { useTeam } from "@/lib/business-config";
import {
  guardRequest, type GuardRuntime, type GuardOutboxRow,
  type GuardLinkResult, type GuardQueueResult, type GuardDeliveryResult,
} from "@/lib/guard-integration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/guard")({
  head: () => ({ meta: [{ title: "Nflake Guard Integration — Financial Document OS" }] }),
  component: GuardIntegrationPage,
});

function GuardIntegrationPage() {
  const { businessId, business } = useWorkspace();
  const session = useSession();
  const team = useTeam(businessId);
  const ledger = useLedger(businessId);
  const [runtime, setRuntime] = useState<GuardRuntime | null>(null);
  const [rows, setRows] = useState<GuardOutboxRow[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [guardProjectId, setGuardProjectId] = useState("");
  const [busy, setBusy] = useState("");
  const [loadError, setLoadError] = useState("");
  const owner = team.data?.members.some(m => m.userId === session.userId && m.role === "OWNER") ?? false;
  const invoices = (ledger.data ?? []).filter(x => x.status === "ISSUED" && x.currency === "KES");
  const selected = invoices.find(x => x.invoice_id === invoiceId);
  const alreadyLinked = rows.some(row => row.invoiceId === invoiceId);
  const recent = rows.filter(row => row.eventId).slice(0, 20);

  useEffect(() => {
    if (!businessId) return;
    let alive = true;
    setInvoiceId("");
    setRows([]);
    setRuntime(null);
    Promise.all([
      guardRequest<GuardRuntime>("config"),
      guardRequest<GuardOutboxRow[]>("outbox", { businessId })
    ]).then(([mode, outbox]) => {
      if (alive) { setRuntime(mode); setRows(outbox); setLoadError(""); }
    }).catch(error => {
      if (alive) setLoadError(error instanceof Error ? error.message : "Guard connector unavailable");
    });
    return () => { alive = false; };
  }, [businessId]);

  async function refresh() {
    if (!businessId) return;
    const [mode, outbox] = await Promise.all([
      guardRequest<GuardRuntime>("config"),
      guardRequest<GuardOutboxRow[]>("outbox", { businessId })
    ]);
    setRuntime(mode);
    setRows(outbox);
    setLoadError("");
    await ledger.refetch();
  }
  async function act(label: string, task: () => Promise<string>) {
    setBusy(label);
    try {
      const message = await task();
      await refresh();
      toast.success(message);
    } catch(error) {
      toast.error(error instanceof Error ? error.message : "Guard operation failed");
    } finally { setBusy(""); }
  }
  async function link() {
    if (!businessId || !selected || !owner || !guardProjectId.trim()) return;
    await act("link", async () => {
      const result = await guardRequest<GuardLinkResult>("link", {
        businessId, invoiceId: selected.invoice_id, guardProjectId: guardProjectId.trim()
      });
      setGuardProjectId("");
      return "Invoice linked to Guard project " + result.guardProjectId.slice(0, 8) + "…";
    });
  }
  async function queue() {
    if (!businessId || !invoiceId || !owner) return;
    await act("queue", async () => {
      const result = await guardRequest<GuardQueueResult>("queue", { businessId, invoiceId });
      return result.queued ? "New sandbox snapshot queued: " + result.type : "No change in derived invoice balance.";
    });
  }
  async function dispatch() {
    if (!businessId || !invoiceId || !owner || !runtime?.deliveryEnabled) return;
    await act("dispatch", async () => {
      const result = await guardRequest<GuardDeliveryResult>("dispatch", { businessId, invoiceId });
      return "Sandbox delivery: " + result.delivered + " delivered, " +
        result.retry + " pending retry, " + result.held + " held.";
    });
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl">Nflake Guard Integration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Link issued invoices from {business.name} to independently hosted Guard licences.
        </p>
      </div>
      <Button variant="outline" onClick={() => void act("refresh", async () => {
        await refresh(); return "Guard outbox refreshed.";
      })} disabled={!!busy}>
        <RefreshCcw className="size-4"/> Refresh
      </Button>
    </header>
    <Card className="border-amber-500/40">
      <CardContent className="space-y-3 py-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <AlertTriangle className="size-5 text-amber-500"/>
          <Badge variant="secondary">{runtime?.mode ?? "PREVIEW"}</Badge>
          <Badge variant="outline">LIVE RESTRICTIONS DISABLED</Badge>
          <Badge variant="outline">{runtime?.deliveryEnabled ? "Local sandbox connected" : "Local delivery unavailable"}</Badge>
        </div>
        <p>Financial Document OS continues to own invoice balances, payments and reversals. Guard only
          receives signed <strong>test snapshots</strong> of a registered KES invoice. No real bank settlement
          is being certified and no customer website is disabled.</p>
        <p className="text-xs text-muted-foreground">
          This is local Phase 2 integration testing. Real activation requires a production-ready security,
          payments and licensing review. Guard and the invoicing application retain separate databases.
        </p>
        {loadError ? <p className="text-destructive">{loadError}</p> : null}
        {!owner ? <p className="text-amber-500">Only the business OWNER can link invoices and dispatch sandbox events.</p> : null}
      </CardContent>
    </Card>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-5"/> Link an issued invoice
        </CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            First register a matching fictional project in the separate Guard console.
            Its <code>external_invoice_id</code> must equal the full invoice UUID shown below.
          </p>
          <div className="space-y-2">
            <Label htmlFor="guard-invoice">Issued KES invoice</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger id="guard-invoice"><SelectValue placeholder="Choose an issued invoice"/></SelectTrigger>
              <SelectContent>
                {invoices.map(x => <SelectItem key={x.invoice_id} value={x.invoice_id}>
                  {(x.doc_number || "Invoice") + " · KES " + Number(x.balance || 0).toFixed(2)}
                </SelectItem>)}
              </SelectContent>
            </Select>
            {selected ? <div className="rounded border bg-muted/40 p-3 text-xs">
              <span className="text-muted-foreground">External invoice ID (copy to Guard)</span>
              <code className="mt-1 block break-all select-all">{selected.invoice_id}</code>
            </div> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="guard-project-id">Guard project UUID</Label>
            <Input id="guard-project-id" value={guardProjectId} onChange={e => setGuardProjectId(e.target.value)}
              maxLength={36} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              disabled={!owner || alreadyLinked}/>
          </div>
          <Button onClick={() => void link()} disabled={!owner || !!busy || !selected || !guardProjectId.trim() || alreadyLinked}>
            <LockKeyhole className="size-4"/> {alreadyLinked ? "Already linked" : busy === "link" ? "Linking…" : "Link invoice"}
          </Button>
          {invoices.length === 0 ? <p className="text-xs text-muted-foreground">No issued KES invoices available in this business.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-5"/> Sandbox snapshot controls
        </CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A snapshot is calculated server-side from the canonical ledger, never from this form.
            The outbox preserves event IDs and only sends to a loopback Guard server.
          </p>
          <div className="rounded border bg-muted/30 p-4 text-sm space-y-2">
            <p><strong>Selected invoice:</strong> {selected?.doc_number || "None selected"}</p>
            <p><strong>Current derived balance:</strong> {selected ? "KES " + Number(selected.balance || 0).toFixed(2) : "—"}</p>
            <p><strong>Linked:</strong> {alreadyLinked ? "Yes" : "No"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void queue()} disabled={!owner || !!busy || !alreadyLinked}>
              Queue latest snapshot
            </Button>
            <Button onClick={() => void dispatch()} disabled={!owner || !!busy || !alreadyLinked || !runtime?.deliveryEnabled}>
              <Send className="size-4"/> Dispatch sandbox
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Manual sync is immediate. An optional local worker can poll all linked invoices on a
            schedule; it is not installed or activated automatically.
          </p>
        </CardContent>
      </Card>
    </div>
    <Card>
      <CardHeader><CardTitle className="text-base">Financial event outbox</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {recent.length === 0 ? <p className="text-muted-foreground">
          No snapshots have been queued. Link a fictional invoice to begin testing.
        </p> : recent.map(row => <div className="flex flex-wrap items-center justify-between gap-3 rounded border p-3" key={row.eventId}>
          <div className="min-w-0">
            <p className="font-medium">Invoice {row.invoiceId.slice(0, 8)}… · Sequence {row.sequence}</p>
            <p className="text-xs text-muted-foreground">
              Event {row.eventId?.slice(0, 8)}… · Attempts {row.attempts ?? 0}
              {row.lastHttpStatus ? " · HTTP " + row.lastHttpStatus : ""}
            </p>
          </div>
          <Badge variant={row.status === "HELD" ? "destructive" : "secondary"}>{row.status}</Badge>
        </div>)}
        <p className="pt-2 text-xs text-muted-foreground">
          Events held after repeated failures require manual operational review. Missing or delayed events
          must never activate a payment restriction.
        </p>
      </CardContent>
    </Card>
  </div>;
}
