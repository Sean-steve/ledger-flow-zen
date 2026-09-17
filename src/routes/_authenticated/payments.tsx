import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/app-shell";
import {
  useClients,
  useLedger,
  usePayments,
  useRecordPayment,
  useReversePayment,
} from "@/lib/db";
import {
  CHANNEL_LABEL,
  PAYMENT_CHANNELS,
  STATUS_TONE,
  dateTime,
  money,
  num,
  statusLabel,
  today,
  type PaymentChannel,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Financial Document OS" },
      {
        name: "description",
        content:
          "Record M-Pesa, bank and cash payments, allocate them to invoices and reverse them safely.",
      },
      { property: "og:title", content: "Payments — Financial Document OS" },
      {
        property: "og:description",
        content: "Invoice payment status is derived from allocations, never typed in by hand.",
      },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { business, businessId } = useWorkspace();
  const payments = usePayments(businessId);
  const [open, setOpen] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const reverse = useReversePayment();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every receipt in this system is generated from a payment recorded here.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Record payment
        </Button>
      </header>

      {payments.isPending ? (
        <p className="text-sm text-muted-foreground">Loading payments…</p>
      ) : payments.isError ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-destructive">
              {payments.error instanceof Error ? payments.error.message : "Could not load payments"}
            </p>
            <Button variant="outline" onClick={() => payments.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (payments.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            <Button variant="outline" onClick={() => setOpen(true)}>
              Record the first payment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(payments.data ?? []).map((payment) => {
            const client = (payment as { clients?: { name: string } | null }).clients;
            return (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {money(payment.amount, payment.currency)} · {client?.name ?? "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {CHANNEL_LABEL[payment.channel as PaymentChannel]} ·{" "}
                    {dateTime(payment.payment_date)}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={STATUS_TONE[payment.status] ?? ""} variant="secondary">
                    {statusLabel(payment.status)}
                  </Badge>
                  {payment.reversed_at ? null : (
                    <Button size="sm" variant="ghost" onClick={() => setReverseId(payment.id)}>
                      <Undo2 className="size-4" /> Reverse
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecordPaymentDialog
        open={open}
        onOpenChange={setOpen}
        businessId={businessId}
        baseCurrency={business.base_currency}
      />

      <Dialog open={!!reverseId} onOpenChange={(next) => !next && setReverseId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse this payment</DialogTitle>
            <DialogDescription>
              Allocations are unwound, the receipt is voided and invoice balances go back up.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for reversal"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || reverse.isPending}
              onClick={() =>
                reverse
                  .mutateAsync({ id: reverseId!, reason: reason.trim() })
                  .then(() => {
                    toast.success("Payment reversed");
                    setReverseId(null);
                    setReason("");
                  })
                  .catch((error: unknown) =>
                    toast.error(error instanceof Error ? error.message : "Could not reverse"),
                  )
              }
            >
              Reverse payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecordPaymentDialog({
  open,
  onOpenChange,
  businessId,
  baseCurrency,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  businessId: string;
  baseCurrency: string;
}) {
  const clients = useClients(businessId);
  const ledger = useLedger(businessId);
  const record = useRecordPayment(businessId);

  const [clientId, setClientId] = useState("");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<PaymentChannel>("MPESA_C2B");
  const [currency, setCurrency] = useState(baseCurrency);
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [payerName, setPayerName] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const openInvoices = useMemo(
    () =>
      (ledger.data ?? []).filter(
        (row) =>
          row.client_id === clientId &&
          Number(row.balance ?? 0) > 0 &&
          row.status !== "VOID" &&
          row.currency === currency,
      ),
    [ledger.data, clientId, currency],
  );

  const allocated = Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const amountValue = Number(amount) || 0;

  function reset() {
    setClientId("");
    setAmount("");
    setReference("");
    setPayerName("");
    setNotes("");
    setAllocations({});
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Leave allocations blank to settle the oldest open invoices first.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const entries = Object.entries(allocations)
              .map(([invoice_id, value]) => ({ invoice_id, amount: Number(value) || 0 }))
              .filter((row) => row.amount > 0);
            if (allocated > amountValue) {
              toast.error("Allocations exceed the payment amount");
              return;
            }
            record
              .mutateAsync({
                client_id: clientId,
                amount: amountValue,
                channel,
                currency,
                payment_date: date,
                reference: reference.trim() || null,
                payer_name: payerName.trim() || null,
                notes: notes.trim() || null,
                allocations: entries,
              })
              .then(() => {
                toast.success("Payment recorded and receipt issued");
                reset();
                onOpenChange(false);
              })
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Could not record payment"),
              );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payClient">Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="payClient">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payAmount">Amount</Label>
              <Input
                id="payAmount"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payChannel">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as PaymentChannel)}>
                <SelectTrigger id="payChannel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payCurrency">Currency</Label>
              <Input
                id="payCurrency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payDate">Payment date</Label>
              <Input
                id="payDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payRef">Reference</Label>
              <Input
                id="payRef"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="M-Pesa code, cheque no."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payer">Paid by</Label>
              <Input id="payer" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="payNotes">Notes</Label>
              <Textarea id="payNotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {clientId ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Open invoices in {currency}
              </p>
              {openInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing outstanding — the payment will sit unallocated as a credit.
                </p>
              ) : (
                openInvoices.map((row) => (
                  <div key={row.invoice_id} className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{row.doc_number}</p>
                      <p className="text-xs text-muted-foreground">
                        Balance {num(row.balance)} · due {row.due_date ?? "—"}
                      </p>
                    </div>
                    <Input
                      className="w-32"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={allocations[row.invoice_id as string] ?? ""}
                      onChange={(e) =>
                        setAllocations((prev) => ({
                          ...prev,
                          [row.invoice_id as string]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))
              )}
              <p className="text-xs text-muted-foreground">
                Allocated {num(allocated)} of {num(amountValue)}
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!clientId || amountValue <= 0 || record.isPending}>
              {record.isPending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
