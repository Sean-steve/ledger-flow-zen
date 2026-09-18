import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/components/app-shell";
import { useClientBalances, useDocuments, useLedger, usePayments } from "@/lib/db";
import {
  CHANNEL_LABEL,
  STATUS_TONE,
  money,
  num,
  statusLabel,
  type PaymentChannel,
  type TaxCategory,
  TAX_LABEL,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Financial Document OS" },
      {
        name: "description",
        content: "Receivables ageing, VAT summary, payment channel mix and client balances.",
      },
      { property: "og:title", content: "Reports — Financial Document OS" },
      {
        property: "og:description",
        content: "Every figure is derived from issued documents, allocations and payments.",
      },
    ],
  }),
  component: ReportsPage,
});

const BUCKETS = [
  { label: "Current", test: (days: number) => days <= 0 },
  { label: "1–30 days", test: (days: number) => days >= 1 && days <= 30 },
  { label: "31–60 days", test: (days: number) => days >= 31 && days <= 60 },
  { label: "61–90 days", test: (days: number) => days >= 61 && days <= 90 },
  { label: "90+ days", test: (days: number) => days > 90 },
];

function ReportsPage() {
  const { business, businessId } = useWorkspace();
  const ledger = useLedger(businessId);
  const documents = useDocuments(businessId);
  const payments = usePayments(businessId);
  const balances = useClientBalances(businessId);
  const currency = business.base_currency;

  const ageing = useMemo(() => {
    const open = (ledger.data ?? []).filter((row) => Number(row.balance ?? 0) > 0.005);
    return BUCKETS.map((bucket) => {
      const rows = open.filter((row) => bucket.test(Number(row.days_overdue ?? 0)));
      return {
        label: bucket.label,
        count: rows.length,
        total: rows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0),
      };
    });
  }, [ledger.data]);

  const vat = useMemo(() => {
    const map = new Map<string, { taxable: number; tax: number }>();
    for (const doc of documents.data ?? []) {
      if (doc.status === "DRAFT" || doc.status === "VOID" || doc.status === "CANCELLED") continue;
      if (doc.type === "QUOTATION" || doc.type === "PRO_FORMA") continue;
      const sign = doc.type === "CREDIT_NOTE" ? -1 : 1;
      const rows = Array.isArray(doc.tax_breakdown)
        ? (doc.tax_breakdown as Array<{ category: string; taxable: number; tax: number }>)
        : [];
      for (const row of rows) {
        const current = map.get(row.category) ?? { taxable: 0, tax: 0 };
        current.taxable += sign * Number(row.taxable ?? 0);
        current.tax += sign * Number(row.tax ?? 0);
        map.set(row.category, current);
      }
    }
    return Array.from(map.entries());
  }, [documents.data]);

  const channels = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const payment of payments.data ?? []) {
      if (payment.status === "REVERSED" || payment.status === "FAILED") continue;
      const current = map.get(payment.channel) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += Number(payment.amount ?? 0) * Number(payment.exchange_rate ?? 1);
      map.set(payment.channel, current);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [payments.data]);

  const statusMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const doc of documents.data ?? []) {
      map.set(doc.status, (map.get(doc.status) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [documents.data]);

  const outstanding = (ledger.data ?? []).reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
  const collected = channels.reduce((sum, [, value]) => sum + value.total, 0);
  const loading = ledger.isPending || documents.isPending || payments.isPending;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Derived live from issued documents, allocations and completed payments — nothing is stored
          twice.
        </p>
      </header>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Building reports…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Outstanding receivables
                </CardTitle>
              </CardHeader>
              <CardContent className="tabular text-2xl">{money(outstanding, currency)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Collected (base currency)
                </CardTitle>
              </CardHeader>
              <CardContent className="tabular text-2xl">{money(collected, currency)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net VAT position
                </CardTitle>
              </CardHeader>
              <CardContent className="tabular text-2xl">
                {money(
                  vat.reduce((sum, [, row]) => sum + row.tax, 0),
                  currency,
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Receivables ageing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ageing.every((row) => row.count === 0) ? (
                  <p className="text-sm text-muted-foreground">No open invoices.</p>
                ) : (
                  ageing.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {row.label} <span className="text-xs">({row.count})</span>
                      </span>
                      <span className="tabular font-medium">{money(row.total, currency)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>VAT summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {vat.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issued documents yet.</p>
                ) : (
                  vat.map(([category, row]) => (
                    <div key={category} className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {TAX_LABEL[category as TaxCategory] ?? category}
                      </span>
                      <span className="tabular">
                        {num(row.taxable)} <span className="text-muted-foreground">taxable</span> ·{" "}
                        <span className="font-medium">{num(row.tax)}</span>
                      </span>
                    </div>
                  ))
                )}
                <p className="pt-2 text-xs text-muted-foreground">
                  Credit notes reduce the figures above. This is a working summary, not a filed return.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payments by channel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {channels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                ) : (
                  channels.map(([channel, row]) => (
                    <div key={channel} className="flex items-center justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">
                        {CHANNEL_LABEL[channel as PaymentChannel] ?? channel}{" "}
                        <span className="text-xs">({row.count})</span>
                      </span>
                      <span className="tabular font-medium">{money(row.total, currency)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Documents by status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {statusMix.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents yet.</p>
                ) : (
                  statusMix.map(([status, count]) => (
                    <Badge key={status} className={STATUS_TONE[status] ?? ""} variant="secondary">
                      {statusLabel(status)} · {count}
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Client statements</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(balances.data ?? []).length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">No client activity yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {(balances.data ?? []).map((row) => (
                    <div
                      key={row.client_id ?? row.name}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <span className="min-w-[160px] font-medium">{row.name}</span>
                      <span className="tabular text-muted-foreground">
                        Invoiced {num(row.invoiced)} · Paid {num(row.paid)} · Credited{" "}
                        {num(row.credited)}
                      </span>
                      <span className="tabular font-medium">
                        {money(row.outstanding, row.currency ?? currency)}
                      </span>
                      {Number(row.overdue ?? 0) > 0 ? (
                        <Badge className={STATUS_TONE["OVERDUE"]} variant="secondary">
                          {money(row.overdue, row.currency ?? currency)} overdue
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
