import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  ArrowLeftRight,
  Ban,
  Check,
  Copy,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Pencil,
  Printer,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DocumentBuilder } from "@/components/document-builder";
import { DocumentSheet } from "@/components/document-sheet";
import { useWorkspace } from "@/components/app-shell";
import {
  useCreateShareLink,
  useDocument,
  useDocumentActions,
  useRevokeShareLink,
  useShareLinks,
} from "@/lib/db";
import { exportSheetImage, printSheet } from "@/lib/doc-export";
import { DOC_TYPE_LABEL, STATUS_TONE, dateTime, money, statusLabel, type DocType } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documents/$documentId")({
  head: () => ({
    meta: [
      { title: "Document — Financial Document OS" },
      {
        name: "description",
        content: "Preview, issue, share and export a financial document with derived payment status.",
      },
      { property: "og:title", content: "Document — Financial Document OS" },
      { property: "og:description", content: "One rendering system for preview, print and export." },
    ],
  }),
  component: DocumentDetailPage,
  errorComponent: ({ error }) => (
    <p role="alert" className="text-sm text-destructive">
      {error.message}
    </p>
  ),
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Document not found.</p>,
});

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const { businessId } = useWorkspace();
  const navigate = useNavigate();
  const query = useDocument(documentId);
  const actions = useDocumentActions();
  const shareLinks = useShareLinks(businessId);
  const createShare = useCreateShareLink(businessId);
  const revokeShare = useRevokeShareLink();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading document…</p>;
  if (query.isError)
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Could not load document"}
          </p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );

  const { document, items, business, ledger, allocations, versions } = query.data;
  const isDraft = document.status === "DRAFT";
  const isCreditNote = document.type === "CREDIT_NOTE";
  const convertible =
    (document.type === "QUOTATION" || document.type === "PRO_FORMA") &&
    document.status !== "CONVERTED" &&
    document.status !== "VOID";
  const links = (shareLinks.data ?? []).filter((l) => l.document_id === document.id && !l.revoked_at);
  const activeLink = links[0];
  const shareUrl =
    activeLink && typeof window !== "undefined"
      ? `${window.location.origin}/share/${activeLink.token}`
      : null;
  const filename = `${document.doc_number ?? "draft"}-${document.client_name}`.replace(
    /[^a-z0-9-]+/gi,
    "-",
  );

  function run(promise: Promise<unknown>, success: string) {
    promise
      .then(() => toast.success(success))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Something went wrong"),
      );
  }

  if (editing && isDraft) {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-3xl">Edit draft</h1>
          <Button variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </header>
        <DocumentBuilder existing={{ document, items }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="min-w-0">
          <Link to="/documents" className="text-xs text-muted-foreground hover:text-foreground">
            ← All documents
          </Link>
          <h1 className="mt-1 truncate text-3xl">
            {document.doc_number ?? "Draft"} · {DOC_TYPE_LABEL[document.type as DocType]}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge className={STATUS_TONE[document.status] ?? ""} variant="secondary">
              {statusLabel(document.status)}
            </Badge>
            {ledger?.payment_status ? (
              <Badge className={STATUS_TONE[ledger.payment_status] ?? ""} variant="secondary">
                {statusLabel(ledger.payment_status)}
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">
              Version {document.version}
              {document.finalized_at ? ` · issued ${dateTime(document.finalized_at)}` : ""}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isDraft ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
              <Button
                disabled={actions.issue.isPending || actions.issueCreditNote.isPending || !items.length}
                onClick={() =>
                  run(
                    isCreditNote
                      ? actions.issueCreditNote.mutateAsync(document.id)
                      : actions.issue.mutateAsync(document.id),
                    "Document issued",
                  )
                }
              >
                <Check className="size-4" /> Issue
              </Button>
            </>
          ) : null}
          {convertible ? (
            <Button
              variant="outline"
              disabled={actions.convert.isPending}
              onClick={() =>
                actions.convert
                  .mutateAsync({ id: document.id, target: "INVOICE" })
                  .then((created) => {
                    toast.success("Converted to a draft invoice");
                    navigate({ to: "/documents/$documentId", params: { documentId: created.id } });
                  })
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Could not convert"),
                  )
              }
            >
              <ArrowLeftRight className="size-4" /> Convert to invoice
            </Button>
          ) : null}
          {!isDraft && document.status !== "VOID" ? (
            <Button variant="outline" onClick={() => setVoidOpen(true)}>
              <Ban className="size-4" /> Void
            </Button>
          ) : null}
          {!isDraft && !document.sent_at ? (
            <Button
              variant="outline"
              disabled={actions.markSent.isPending}
              onClick={() => run(actions.markSent.mutateAsync(document.id), "Marked as sent")}
            >
              <Send className="size-4" /> Mark sent
            </Button>
          ) : null}
          <Button variant="outline" onClick={printSheet}>
            <Printer className="size-4" /> Print / PDF
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              exportSheetImage(sheetRef.current, filename, "png").catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Export failed"),
              )
            }
          >
            <ImageIcon className="size-4" /> PNG
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              exportSheetImage(sheetRef.current, filename, "jpeg").catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Export failed"),
              )
            }
          >
            <ImageIcon className="size-4" /> JPG
          </Button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={sheetRef} className="print-area overflow-x-auto">
          <DocumentSheet business={business} document={document} items={items} ledger={ledger} />
        </div>

        <div className="space-y-4 print:hidden">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Share with the client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isDraft ? (
                <p className="text-sm text-muted-foreground">
                  Issue the document first — drafts are not shareable.
                </p>
              ) : shareUrl ? (
                <>
                  <p className="break-all rounded border border-border bg-muted/40 px-3 py-2 text-xs">
                    {shareUrl}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(shareUrl);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="size-4" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `${DOC_TYPE_LABEL[document.type as DocType]} ${document.doc_number}: ${shareUrl}`,
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle className="size-4" /> WhatsApp
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                      disabled={!document.client_email}
                      title={document.client_email ? undefined : "This client has no email on file"}
                    >
                      <a
                        href={`mailto:${document.client_email ?? ""}?subject=${encodeURIComponent(
                          `${DOC_TYPE_LABEL[document.type as DocType]} ${document.doc_number}`,
                        )}&body=${encodeURIComponent(shareUrl)}`}
                      >
                        <Mail className="size-4" /> Email
                      </a>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Viewed {activeLink?.view_count ?? 0} time(s).
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run(revokeShare.mutateAsync(activeLink!.id), "Link revoked")
                    }
                  >
                    Revoke link
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  disabled={createShare.isPending}
                  onClick={() =>
                    run(createShare.mutateAsync({ document_id: document.id }), "Share link created")
                  }
                >
                  Create share link
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Automated email and WhatsApp delivery are not configured, so sharing hands you a link
                to send yourself.
              </p>
            </CardContent>
          </Card>

          {document.type === "INVOICE" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Settlement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Line label="Invoice total" value={money(document.total_amount, document.currency)} />
                <Line label="Paid" value={money(ledger?.paid_amount ?? 0, document.currency)} />
                <Line label="Credited" value={money(ledger?.credited_amount ?? 0, document.currency)} />
                <Line label="Balance" value={money(ledger?.balance ?? 0, document.currency)} />
                <div className="border-t border-border pt-2">
                  {allocations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing allocated yet.</p>
                  ) : (
                    allocations.map((a) => (
                      <div
                        key={a.id}
                        className={`flex justify-between gap-3 py-1 text-xs ${a.reversed_at ? "line-through opacity-60" : ""}`}
                      >
                        <span className="text-muted-foreground">{dateTime(a.created_at)}</span>
                        <span>{money(a.amount, document.currency)}</span>
                      </div>
                    ))
                  )}
                </div>
                <Button size="sm" variant="outline" asChild className="w-full">
                  <Link to="/payments">Record a payment</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {versions.length === 0 ? (
                <p className="text-muted-foreground">No snapshots yet — drafts are not versioned.</p>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="flex justify-between gap-3">
                    <span>v{v.version}</span>
                    <span className="text-muted-foreground">
                      {v.reason ?? "snapshot"} · {dateTime(v.created_at)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this document</DialogTitle>
            <DialogDescription>
              Voiding is permanent and keeps the number in the audit trail. Give a reason.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Reason for voiding"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || actions.voidDocument.isPending}
              onClick={() =>
                actions.voidDocument
                  .mutateAsync({ id: document.id, reason: voidReason.trim() })
                  .then(() => {
                    toast.success("Document voided");
                    setVoidOpen(false);
                    setVoidReason("");
                  })
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Could not void"),
                  )
              }
            >
              Void document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
