import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Printer, Receipt as ReceiptIcon, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/app-shell";
import { ReceiptSheet } from "@/components/document-sheet";
import { exportSheetImage, printSheet } from "@/lib/doc-export";
import { useCreateShareLink, useReceipts } from "@/lib/db";
import { CHANNEL_LABEL, money, shortDate, type PaymentChannel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/receipts")({
  head: () => ({
    meta: [
      { title: "Receipts — Financial Document OS" },
      {
        name: "description",
        content: "Official receipts derived from recorded payments, ready to print, export or share.",
      },
      { property: "og:title", content: "Receipts — Financial Document OS" },
      {
        property: "og:description",
        content: "Every receipt is issued by the system from a payment — never entered by hand.",
      },
    ],
  }),
  component: ReceiptsPage,
});

type ReceiptRow = {
  id: string;
  receipt_number: string;
  created_at: string;
  received_by: string | null;
  notes: string | null;
  voided_at: string | null;
  payments: {
    amount: number | string;
    currency: string;
    channel: string;
    reference: string | null;
    channel_txn_id: string | null;
    payment_date: string;
    payer_name: string | null;
  } | null;
  clients: { name: string } | null;
};

function ReceiptsPage() {
  const { business, businessId } = useWorkspace();
  const receipts = useReceipts(businessId);
  const share = useCreateShareLink(businessId);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const list = (receipts.data ?? []) as unknown as ReceiptRow[];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((row) =>
      `${row.receipt_number} ${row.clients?.name ?? ""} ${row.payments?.reference ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [receipts.data, search]);

  const active = rows.find((row) => row.id === openId) ?? null;

  async function copyShareLink(receiptId: string) {
    try {
      const link = await share.mutateAsync({ receipt_id: receiptId });
      const url = `${window.location.origin}/share/${link.token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied", { description: url });
    } catch (error) {
      toast.error("Could not create a share link", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl">Receipts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Receipts are created automatically when a payment is recorded, and voided when a payment is
          reversed.
        </p>
      </header>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by receipt number, client or reference"
        className="max-w-sm"
      />

      {receipts.isPending ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading receipts…
          </CardContent>
        </Card>
      ) : receipts.isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-destructive">
            {(receipts.error as Error).message}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <ReceiptIcon className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No receipts yet. Record a payment and its receipt appears here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-[180px]">
                    <p className="font-medium">{row.receipt_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.clients?.name ?? "—"} · {shortDate(row.created_at)}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {row.payments
                      ? CHANNEL_LABEL[row.payments.channel as PaymentChannel] ?? row.payments.channel
                      : "—"}
                  </div>
                  <div className="tabular text-sm font-medium">
                    {money(row.payments?.amount ?? 0, row.payments?.currency ?? business.base_currency)}
                  </div>
                  <div className="flex items-center gap-2">
                    {row.voided_at ? <Badge variant="destructive">Voided</Badge> : null}
                    <Button size="sm" variant="outline" onClick={() => setOpenId(row.id)}>
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!row.voided_at || share.isPending}
                      onClick={() => copyShareLink(row.id)}
                    >
                      <Share2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!active} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] overflow-auto sm:max-w-3xl">
          <DialogHeader className="print-hide">
            <DialogTitle>{active?.receipt_number}</DialogTitle>
          </DialogHeader>
          {active?.payments ? (
            <>
              <div className="print-hide flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={printSheet}>
                  <Printer className="size-4" /> Print / PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    exportSheetImage(sheetRef.current, active.receipt_number, "png").catch((error) =>
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
                    exportSheetImage(sheetRef.current, active.receipt_number, "jpeg").catch((error) =>
                      toast.error(error instanceof Error ? error.message : "Export failed"),
                    )
                  }
                >
                  <ImageIcon className="size-4" /> JPG
                </Button>
              </div>
              <div className="print-area overflow-auto" ref={sheetRef}>
                <div className="origin-top-left scale-[0.62] sm:scale-75">
                  <ReceiptSheet business={business} receipt={active} payment={active.payments} />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
