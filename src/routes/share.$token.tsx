import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { Image as ImageIcon, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentSheet, ReceiptSheet } from "@/components/document-sheet";
import { exportSheetImage, printSheet } from "@/lib/doc-export";
import { useSharedDocument } from "@/lib/db";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Shared document — Financial Document OS" },
      {
        name: "description",
        content: "A secure read-only copy of an invoice, statement or receipt shared with you.",
      },
      { property: "og:title", content: "Shared document" },
      {
        property: "og:description",
        content: "Read-only copy of a document shared with you. Print or save it as a PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedPage,
});

type SharedPayload =
  | {
      kind: "document";
      business: Parameters<typeof DocumentSheet>[0]["business"];
      document: Parameters<typeof DocumentSheet>[0]["document"];
      items: Parameters<typeof DocumentSheet>[0]["items"];
      ledger: Parameters<typeof DocumentSheet>[0]["ledger"];
    }
  | {
      kind: "receipt";
      business: Parameters<typeof ReceiptSheet>[0]["business"];
      receipt: Parameters<typeof ReceiptSheet>[0]["receipt"];
      payment: Parameters<typeof ReceiptSheet>[0]["payment"];
    };

function SharedPage() {
  const { token } = Route.useParams();
  const shared = useSharedDocument(token);
  const sheetRef = useRef<HTMLDivElement>(null);
  const payload = (shared.data ?? null) as SharedPayload | null;

  const filename =
    payload?.kind === "document"
      ? (payload.document.doc_number ?? "document")
      : payload?.kind === "receipt"
        ? payload.receipt.receipt_number
        : "document";

  if (shared.isPending) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Opening document…</p>
      </Shell>
    );
  }

  if (shared.isError || !payload) {
    return (
      <Shell>
        <div className="space-y-2 text-center">
          <h1 className="text-xl">This link is no longer available</h1>
          <p className="text-sm text-muted-foreground">
            It may have expired or been withdrawn. Ask the sender for a new link.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="print-hide flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="outline" onClick={printSheet}>
          <Printer className="size-4" /> Print / PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            exportSheetImage(sheetRef.current, filename, "png").catch((error) =>
              toast.error(error instanceof Error ? error.message : "Export failed"),
            )
          }
        >
          <ImageIcon className="size-4" /> PNG
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            exportSheetImage(sheetRef.current, filename, "jpeg").catch((error) =>
              toast.error(error instanceof Error ? error.message : "Export failed"),
            )
          }
        >
          <ImageIcon className="size-4" /> JPG
        </Button>
      </div>
      <div className="print-area overflow-auto" ref={sheetRef}>
        <div className="origin-top-left scale-[0.62] sm:scale-100">
          {payload.kind === "document" ? (
            <DocumentSheet
              business={payload.business}
              document={payload.document}
              items={payload.items}
              ledger={payload.ledger ?? null}
            />
          ) : (
            <ReceiptSheet
              business={payload.business}
              receipt={payload.receipt}
              payment={payload.payment}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6">
        <Card className="print-hide w-full">
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            Shared securely. This page is read-only and is not indexed.
          </CardContent>
        </Card>
        {children}
      </div>
    </div>
  );
}
