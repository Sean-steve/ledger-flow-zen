import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/app-shell";
import { useDocuments, useLedger } from "@/lib/db";
import {
  DOC_TYPES,
  DOC_TYPE_LABEL,
  STATUS_TONE,
  money,
  shortDate,
  statusLabel,
  type DocType,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({
    meta: [
      { title: "Documents — Financial Document OS" },
      {
        name: "description",
        content:
          "Invoices, quotations, pro-forma invoices, credit and debit notes with live payment status.",
      },
      { property: "og:title", content: "Documents — Financial Document OS" },
      {
        property: "og:description",
        content: "Every document your business has raised, with derived payment status.",
      },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { businessId } = useWorkspace();
  const documents = useDocuments(businessId);
  const ledger = useLedger(businessId);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"ALL" | DocType>("ALL");

  const paymentStatus = new Map(
    (ledger.data ?? []).map((row) => [row.invoice_id, row.payment_status]),
  );

  const list = (documents.data ?? []).filter((doc) => {
    if (type !== "ALL" && doc.type !== type) return false;
    const haystack = `${doc.doc_number ?? "draft"} ${doc.client_name}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Numbers are issued by the database at finalisation and can never be reused.
          </p>
        </div>
        <Button asChild>
          <Link to="/documents/new">
            <Plus className="size-4" /> New document
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search number or client"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={type} onValueChange={(value) => setType(value as "ALL" | DocType)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {DOC_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DOC_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {documents.isPending ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : documents.isError ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-destructive">
              {documents.error instanceof Error ? documents.error.message : "Could not load documents"}
            </p>
            <Button variant="outline" onClick={() => documents.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {documents.data?.length ? "No documents match your filters." : "No documents yet."}
            </p>
            <Button asChild variant="outline">
              <Link to="/documents/new">Create the first one</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((doc) => (
            <Link
              key={doc.id}
              to="/documents/$documentId"
              params={{ documentId: doc.id }}
              className="block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {doc.doc_number ?? "Draft"} · {doc.client_name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {DOC_TYPE_LABEL[doc.type as DocType]} · {shortDate(doc.issue_date)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-sm tabular">
                    {money(doc.total_amount, doc.currency)}
                  </div>
                  <Badge className={STATUS_TONE[doc.status] ?? ""} variant="secondary">
                    {statusLabel(doc.status)}
                  </Badge>
                  {doc.type === "INVOICE" && paymentStatus.get(doc.id) ? (
                    <Badge
                      className={STATUS_TONE[paymentStatus.get(doc.id) as string] ?? ""}
                      variant="secondary"
                    >
                      {statusLabel(paymentStatus.get(doc.id))}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
