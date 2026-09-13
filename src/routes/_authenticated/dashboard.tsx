import { createFileRoute, Link } from "@tanstack/react-router";

import { useWorkspace } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocuments, useLedger, usePayments } from "@/lib/db";
import { DOC_TYPE_LABEL, money, shortDate, statusLabel, STATUS_TONE } from "@/lib/format";
import type { DocType } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Financial Document OS" },
      {
        name: "description",
        content: "Receivables, overdue invoices and recent payments at a glance.",
      },
      { property: "og:title", content: "Dashboard — Financial Document OS" },
      { property: "og:description", content: "Track receivables, overdue invoices and payments." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { business, businessId } = useWorkspace();
  const ledger = useLedger(businessId);
  const documents = useDocuments(businessId);
  const payments = usePayments(businessId);

  const rows = ledger.data ?? [];
  const outstanding = rows.reduce((sum, r) => sum + Number(r.balance ?? 0), 0);
  const overdue = rows.filter((r) => r.payment_status === "OVERDUE");
  const overdueTotal = overdue.reduce((sum, r) => sum + Number(r.balance ?? 0), 0);
  const paidTotal = rows.reduce(
    (sum, r) => sum + Number(r.paid_amount ?? 0) + Number(r.credited_amount ?? 0),
    0,
  );
  const drafts = (documents.data ?? []).filter((d) => d.status === "DRAFT").length;
  const recentPayments = (payments.data ?? []).slice(0, 6);
  const loading = ledger.isPending || documents.isPending || payments.isPending;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-primary">{business.name}</p>
          <h1 className="mt-1 text-3xl">Dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/documents/new">New document</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/payments">Record payment</Link>
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Outstanding" value={money(outstanding, business.base_currency)} />
          <Stat
            label="Overdue"
            value={money(overdueTotal, business.base_currency)}
            hint={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`}
          />
          <Stat label="Settled to date" value={money(paidTotal, business.base_currency)} />
          <Stat label="Drafts" value={String(drafts)} hint="Not yet issued" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Open invoices</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/documents">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {ledger.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : rows.filter((r) => Number(r.balance ?? 0) > 0).length === 0 ? (
              <Empty text="No open invoices. Everything is settled." />
            ) : (
              <ul className="divide-y divide-border">
                {rows
                  .filter((r) => Number(r.balance ?? 0) > 0)
                  .slice(0, 8)
                  .map((row) => (
                    <li key={row.invoice_id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Link
                          to="/documents/$documentId"
                          params={{ documentId: row.invoice_id! }}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {row.doc_number ?? "Draft"}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.client_name} · due {shortDate(row.due_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular text-sm">{money(row.balance, row.currency ?? "KES")}</p>
                        <Badge
                          variant="secondary"
                          className={STATUS_TONE[row.payment_status ?? ""] ?? ""}
                        >
                          {statusLabel(row.payment_status)}
                        </Badge>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent payments</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/payments">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {payments.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : recentPayments.length === 0 ? (
              <Empty text="No payments recorded yet." />
            ) : (
              <ul className="divide-y divide-border">
                {recentPayments.map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {(payment as { clients?: { name: string } | null }).clients?.name ??
                          "Client"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {shortDate(payment.payment_date)} · {payment.reference ?? "no reference"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm">{money(payment.amount, payment.currency)}</p>
                      <Badge variant="secondary" className={STATUS_TONE[payment.status] ?? ""}>
                        {statusLabel(payment.status)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : (documents.data ?? []).length === 0 ? (
            <Empty text="No documents yet. Create your first invoice or quotation." />
          ) : (
            <ul className="divide-y divide-border">
              {(documents.data ?? []).slice(0, 8).map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Link
                      to="/documents/$documentId"
                      params={{ documentId: doc.id }}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {doc.doc_number ?? "Draft"} · {DOC_TYPE_LABEL[doc.type as DocType]}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{doc.client_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm">{money(doc.total_amount, doc.currency)}</p>
                    <Badge variant="secondary" className={STATUS_TONE[doc.status] ?? ""}>
                      {statusLabel(doc.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="tabular mt-2 text-2xl">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
