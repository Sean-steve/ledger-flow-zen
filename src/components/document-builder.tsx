import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/app-shell";
import { DocumentSheet } from "@/components/document-sheet";
import { DOCUMENT_TEMPLATES, getTemplateById, type TemplateId } from "@/lib/document-templates";
import {
  useClients,
  useCreateDraft,
  useReplaceDraftItems,
  type Client,
  type DocumentItem,
  type DocumentRow,
} from "@/lib/db";
import {
  CURRENCIES,
  DOC_TYPES,
  DOC_TYPE_LABEL,
  TAX_CATEGORIES,
  TAX_LABEL,
  TAX_RATE,
  documentTotals,
  lineTotals,
  money,
  num,
  today,
  type DocType,
  type TaxCategory,
} from "@/lib/format";

type Line = {
  key: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
  tax_category: TaxCategory;
};

function blankLine(): Line {
  return {
    key: crypto.randomUUID(),
    description: "",
    unit: "",
    quantity: "1",
    unit_price: "0",
    discount_pct: "0",
    tax_category: "VAT_16",
  };
}

function toLines(items: DocumentItem[]): Line[] {
  if (!items.length) return [blankLine()];
  return items.map((item) => ({
    key: item.id,
    description: item.description,
    unit: item.unit ?? "",
    quantity: String(item.quantity),
    unit_price: String(item.unit_price),
    discount_pct: String(item.discount_pct),
    tax_category: item.tax_category as TaxCategory,
  }));
}

export function DocumentBuilder({
  existing,
}: {
  existing?: { document: DocumentRow; items: DocumentItem[] };
}) {
  const { business, businessId } = useWorkspace();
  const clients = useClients(businessId);
  const create = useCreateDraft(businessId);
  const replace = useReplaceDraftItems();
  const navigate = useNavigate();

  const [clientId, setClientId] = useState(existing?.document.client_id ?? "");
  const [type, setType] = useState<DocType>((existing?.document.type as DocType) ?? "INVOICE");
  const [issueDate, setIssueDate] = useState(existing?.document.issue_date ?? today());
  const [terms, setTerms] = useState(
    String(existing?.document.payment_terms_days ?? business.default_terms_days),
  );
  const [currency, setCurrency] = useState(existing?.document.currency ?? business.base_currency);
  const [rate, setRate] = useState(String(existing?.document.exchange_rate ?? 1));
  const [whtOn, setWhtOn] = useState(existing?.document.wht_applicable ?? false);
  const [whtRate, setWhtRate] = useState(
    String(Number(existing?.document.wht_rate ?? business.default_wht_rate) * 100),
  );
  const [notes, setNotes] = useState(existing?.document.notes ?? business.default_notes ?? "");
  const [legal, setLegal] = useState(
    existing?.document.legal_terms ?? business.default_legal_terms ?? "",
  );
  const [lines, setLines] = useState<Line[]>(toLines(existing?.items ?? []));
  const [templateId, setTemplateId] = useState<TemplateId>(
    getTemplateById(existing?.document.template_id ?? business.default_template).id,
  );
  const [showPreview, setShowPreview] = useState(false);

  const parsed = useMemo(
    () =>
      lines.filter((line) => line.description.trim() !== "").map((line) => ({
        quantity: Number(line.quantity) || 0,
        unit_price: Number(line.unit_price) || 0,
        discount_pct: Number(line.discount_pct) || 0,
        tax_rate: TAX_RATE[line.tax_category],
      })),
    [lines],
  );

  const totals = documentTotals(parsed, {
    whtApplicable: whtOn,
    whtRate: (Number(whtRate) || 0) / 100,
  });

  const client = (clients.data ?? []).find((c) => c.id === clientId) ?? null;
  const validLines = lines.filter((line) => line.description.trim() !== "");

  // UI-only live preview. Saved/issued totals remain authoritative in PostgreSQL.
  const previewItems = useMemo<DocumentItem[]>(() => validLines.map((line, index) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const discountPct = Number(line.discount_pct) || 0;
    const taxRate = TAX_RATE[line.tax_category];
    const calculated = lineTotals({
      quantity, unit_price: unitPrice, discount_pct: discountPct, tax_rate: taxRate,
    });
    return {
      id: line.key,
      document_id: existing?.document.id ?? "preview",
      position: index + 1,
      description: line.description,
      unit: line.unit || null,
      quantity,
      unit_price: unitPrice,
      discount_pct: discountPct,
      tax_category: line.tax_category,
      tax_rate: taxRate,
      gross_amount: calculated.gross,
      discount_amount: calculated.discount,
      taxable_amount: calculated.taxable,
      tax_amount: calculated.tax,
      net_amount: calculated.net,
      created_at: existing?.document.created_at ?? new Date().toISOString(),
    } as DocumentItem;
  }), [validLines, existing?.document.id, existing?.document.created_at]);

  const previewDocument = useMemo<DocumentRow>(() => {
    const taxGroups = new Map<string, { category: string; rate: number; taxable: number; tax: number }>();
    for (const item of previewItems) {
      const category = String(item.tax_category);
      const current = taxGroups.get(category) ?? {
        category, rate: Number(item.tax_rate), taxable: 0, tax: 0,
      };
      current.taxable += Number(item.taxable_amount);
      current.tax += Number(item.tax_amount);
      taxGroups.set(category, current);
    }
    return {
      ...(existing?.document ?? {}),
      business_id: businessId,
      client_id: client?.id ?? "",
      client_name: client?.name ?? "Select a client",
      client_address: client?.address ?? null,
      client_email: client?.email ?? null,
      client_kra_pin: client?.kra_pin ?? null,
      type,
      status: "DRAFT",
      doc_number: null,
      issue_date: issueDate,
      due_date: null,
      valid_until: null,
      currency,
      exchange_rate: Number(rate) || 1,
      template_id: templateId,
      wht_applicable: whtOn,
      wht_rate: (Number(whtRate) || 0) / 100,
      wht_amount: totals.wht_amount,
      notes: notes.trim() || null,
      legal_terms: legal.trim() || null,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      taxable_total: totals.taxable_total,
      tax_total: totals.tax_total,
      total_amount: totals.total_amount,
      tax_breakdown: [...taxGroups.values()],
      kra_status: "NOT_CONFIGURED",
    } as DocumentRow;
  }, [existing?.document, businessId, client, type, issueDate, currency, rate, templateId,
      whtOn, whtRate, notes, legal, totals.subtotal, totals.discount_total,
      totals.taxable_total, totals.tax_total, totals.total_amount, totals.wht_amount, previewItems]);
  const validMoneyInputs = validLines.every((line) => {
    const quantity = Number(line.quantity);
    const price = Number(line.unit_price);
    const discount = Number(line.discount_pct);
    return Number.isFinite(quantity) && quantity > 0 &&
      Number.isFinite(price) && price >= 0 &&
      Number.isFinite(discount) && discount >= 0 && discount <= 100;
  });
  const termsValid = Number.isInteger(Number(terms)) && Number(terms) >= 0;
  const rateValid = currency === business.base_currency ||
    (Number.isFinite(Number(rate)) && Number(rate) > 0);
  const withholdingValid = !whtOn ||
    (Number.isFinite(Number(whtRate)) && Number(whtRate) >= 0 && Number(whtRate) <= 100);
  const canSave = !!client && validLines.length > 0 && validMoneyInputs &&
    termsValid && rateValid && withholdingValid && !create.isPending && !replace.isPending;

  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function itemPayload() {
    return validLines.map((line, index) => ({
      position: index + 1,
      description: line.description.trim(),
      unit: line.unit.trim() || null,
      quantity: Number(line.quantity) || 0,
      unit_price: Number(line.unit_price) || 0,
      discount_pct: Number(line.discount_pct) || 0,
      tax_category: line.tax_category,
      tax_rate: TAX_RATE[line.tax_category],
    }));
  }

  function onClientChange(id: string) {
    setClientId(id);
    const next = (clients.data ?? []).find((c) => c.id === id) as Client | undefined;
    if (next) {
      setCurrency(next.currency);
      setTerms(String(next.payment_terms_days));
    }
  }

  async function submit() {
    if (!client) return;
    try {
      if (existing) {
        await replace.mutateAsync({
          documentId: existing.document.id,
          patch: {
            client_id: client.id,
            client_name: client.name,
            client_email: client.email,
            client_kra_pin: client.kra_pin,
            client_address: client.address,
            type,
            issue_date: issueDate,
            payment_terms_days: Number(terms) || 0,
            currency,
            exchange_rate: Number(rate) || 1,
            wht_applicable: whtOn,
            wht_rate: (Number(whtRate) || 0) / 100,
            notes: notes.trim() || null,
            legal_terms: legal.trim() || null,
            template_id: templateId,
          },
          items: itemPayload(),
        });
        toast.success("Draft updated");
        navigate({ to: "/documents/$documentId", params: { documentId: existing.document.id } });
        return;
      }

      const document = await create.mutateAsync({
        client,
        type,
        issue_date: issueDate,
        payment_terms_days: Number(terms) || 0,
        currency,
        exchange_rate: Number(rate) || 1,
        wht_applicable: whtOn,
        wht_rate: (Number(whtRate) || 0) / 100,
        notes: notes.trim() || null,
        legal_terms: legal.trim() || null,
        template_id: templateId,
        items: itemPayload(),
      });
      toast.success("Draft created");
      navigate({ to: "/documents/$documentId", params: { documentId: document.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save draft");
    }
  }

  if (clients.isPending) {
    return <p className="text-sm text-muted-foreground">Loading clients…</p>;
  }

  if (!clients.data?.length) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Add a client before raising a document — the client supplies currency, credit terms and
            tax details.
          </p>
          <Button onClick={() => navigate({ to: "/clients" })}>Go to clients</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Document</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={onClientChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {(clients.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as DocType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOC_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Document design</Label>
              <Select value={templateId} onValueChange={(value) => setTemplateId(value as TemplateId)}>
                <SelectTrigger aria-label="Document template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TEMPLATES.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name} · {option.category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Link to="/studio" className="inline-block text-xs text-primary hover:underline">
                Explore all eight styles in Document Studio →
              </Link>
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue">Issue date</Label>
              <Input
                id="issue"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="terms">Payment terms (days)</Label>
              <Input
                id="terms"
                inputMode="numeric"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate">Rate to {business.base_currency}</Label>
              <Input
                id="rate"
                inputMode="decimal"
                value={rate}
                disabled={currency === business.base_currency}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2 sm:col-span-2">
              <div>
                <Label htmlFor="wht">Withholding tax</Label>
                <p className="text-xs text-muted-foreground">
                  Deducted by the client from the amount payable.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  className="w-20"
                  inputMode="decimal"
                  value={whtRate}
                  disabled={!whtOn}
                  onChange={(e) => setWhtRate(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">%</span>
                <Switch id="wht" checked={whtOn} onCheckedChange={setWhtOn} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm tabular">
            <Row label="Subtotal" value={num(totals.subtotal)} />
            <Row label="Discount" value={`(${num(totals.discount_total)})`} />
            <Row label="Taxable" value={num(totals.taxable_total)} />
            <Row label="Tax" value={num(totals.tax_total)} />
            <div className="border-t border-border pt-2">
              <Row label={`Total (${currency})`} value={money(totals.total_amount, currency)} strong />
            </div>
            {whtOn ? (
              <>
                <Row label="Withholding" value={`(${num(totals.wht_amount)})`} />
                <Row label="Net payable" value={money(totals.net_payable, currency)} strong />
              </>
            ) : null}
            {currency !== business.base_currency ? (
              <p className="pt-2 text-xs text-muted-foreground">
                ≈ {money(totals.total_amount * (Number(rate) || 1), business.base_currency)} at the
                rate above.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line items</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            <Plus className="size-4" /> Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!validMoneyInputs && (
            <p role="alert" className="text-xs text-destructive">
              Each described line requires a positive quantity, non-negative unit price and discount from 0 to 100%.
            </p>
          )}
          {!termsValid || !rateValid || !withholdingValid ? (
            <p role="alert" className="text-xs text-destructive">
              Check payment terms, exchange rate and withholding percentage before saving.
            </p>
          ) : null}
          {lines.map((line, index) => {
            const t = lineTotals({
              quantity: Number(line.quantity) || 0,
              unit_price: Number(line.unit_price) || 0,
              discount_pct: Number(line.discount_pct) || 0,
              tax_rate: TAX_RATE[line.tax_category],
            });
            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-12"
              >
                <div className="space-y-1 sm:col-span-12 lg:col-span-4">
                  <Label className="text-xs">Description {index + 1}</Label>
                  <Input
                    value={line.description}
                    onChange={(e) => update(line.key, { description: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-3 lg:col-span-1">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={line.unit}
                    onChange={(e) => update(line.key, { unit: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-3 lg:col-span-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-3 lg:col-span-2">
                  <Label className="text-xs">Unit price</Label>
                  <Input
                    inputMode="decimal"
                    value={line.unit_price}
                    onChange={(e) => update(line.key, { unit_price: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-3 lg:col-span-1">
                  <Label className="text-xs">Disc %</Label>
                  <Input
                    inputMode="decimal"
                    value={line.discount_pct}
                    onChange={(e) => update(line.key, { discount_pct: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-6 lg:col-span-2">
                  <Label className="text-xs">Tax</Label>
                  <Select
                    value={line.tax_category}
                    onValueChange={(value) => update(line.key, { tax_category: value as TaxCategory })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {TAX_LABEL[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end justify-between gap-2 sm:col-span-6 lg:col-span-1">
                  <div className="text-right text-sm tabular">
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p>{num(t.taxable)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((item) => item.key !== line.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="legal">Terms and conditions</Label>
          <Textarea id="legal" rows={4} value={legal} onChange={(e) => setLegal(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => setShowPreview((value) => !value)}>
          <Eye className="size-4" /> {showPreview ? "Hide live preview" : "Preview draft design"}
        </Button>
        <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={() => navigate({ to: "/documents" })}>
          Cancel
        </Button>
        <Button disabled={!canSave} onClick={submit}>
          {create.isPending || replace.isPending ? "Saving…" : "Save draft"}
        </Button>
        </div>
      </div>
      {showPreview && (
        <section className="space-y-3" aria-label="Live draft preview">
          <div>
            <h2 className="text-2xl">Live preview · {getTemplateById(templateId).name}</h2>
            <p className="text-xs text-muted-foreground">
              Working preview only. The server recalculates totals and assigns a number after save and issue.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-2 sm:p-4">
            <DocumentSheet business={business} document={previewDocument} items={previewItems} />
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
