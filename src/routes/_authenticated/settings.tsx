import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { useUpdateBusiness } from "@/lib/db";
import { CURRENCIES, TAX_CATEGORIES, TAX_LABEL, type TaxCategory } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Financial Document OS" },
      {
        name: "description",
        content: "Business profile, tax defaults, payment instructions and document footers.",
      },
      { property: "og:title", content: "Settings — Financial Document OS" },
      {
        property: "og:description",
        content: "These details appear on every invoice, receipt and statement you issue.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { business, businessId } = useWorkspace();
  const update = useUpdateBusiness(businessId);
  const [form, setForm] = useState(business);

  useEffect(() => setForm(business), [business]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    try {
      await update.mutateAsync({
        name: form.name,
        trading_name: form.trading_name,
        kra_pin: form.kra_pin,
        vat_number: form.vat_number,
        email: form.email,
        phone: form.phone,
        physical_address: form.physical_address,
        postal_address: form.postal_address,
        city: form.city,
        country: form.country,
        base_currency: form.base_currency,
        default_tax_category: form.default_tax_category,
        default_wht_rate: Number(form.default_wht_rate) || 0,
        default_terms_days: Number(form.default_terms_days) || 0,
        mpesa_paybill: form.mpesa_paybill,
        mpesa_account_format: form.mpesa_account_format,
        bank_name: form.bank_name,
        bank_branch: form.bank_branch,
        bank_account_name: form.bank_account_name,
        bank_account_number: form.bank_account_number,
        bank_swift: form.bank_swift,
        signatory_name: form.signatory_name,
        signatory_title: form.signatory_title,
        default_notes: form.default_notes,
        default_legal_terms: form.default_legal_terms,
      });
      toast.success("Settings saved");
    } catch (error) {
      toast.error("Could not save settings", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const text = (
    key: keyof typeof form,
    label: string,
    options: { placeholder?: string; type?: string } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={String(key)}>{label}</Label>
      <Input
        id={String(key)}
        type={options.type ?? "text"}
        placeholder={options.placeholder ?? ""}
        value={(form[key] as string | number | null) ?? ""}
        onChange={(event) => set(key, event.target.value as never)}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            These details print on every document you issue.
          </p>
        </div>
        <Button onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Business identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {text("name", "Registered name")}
          {text("trading_name", "Trading name")}
          {text("kra_pin", "KRA PIN")}
          {text("vat_number", "VAT number")}
          {text("email", "Email", { type: "email" })}
          {text("phone", "Phone")}
          {text("physical_address", "Physical address")}
          {text("postal_address", "Postal address")}
          {text("city", "City")}
          {text("country", "Country")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Base currency</Label>
            <Select
              value={form.base_currency}
              onValueChange={(value) => set("base_currency", value)}
            >
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
          <div className="space-y-1.5">
            <Label>Default tax treatment</Label>
            <Select
              value={form.default_tax_category}
              onValueChange={(value) =>
                set("default_tax_category", value as typeof form.default_tax_category)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {TAX_LABEL[category as TaxCategory]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {text("default_terms_days", "Payment terms (days)", { type: "number" })}
          {text("default_wht_rate", "Withholding tax rate (e.g. 0.05)", { type: "number" })}
          {text("signatory_name", "Authorised signatory")}
          {text("signatory_title", "Signatory title")}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="default_notes">Default notes</Label>
            <Textarea
              id="default_notes"
              rows={3}
              value={form.default_notes ?? ""}
              onChange={(event) => set("default_notes", event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="default_legal_terms">Default legal terms</Label>
            <Textarea
              id="default_legal_terms"
              rows={4}
              value={form.default_legal_terms ?? ""}
              onChange={(event) => set("default_legal_terms", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment instructions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {text("mpesa_paybill", "M-Pesa paybill / till")}
          {text("mpesa_account_format", "M-Pesa account format", {
            placeholder: "e.g. INV-{number}",
          })}
          {text("bank_name", "Bank name")}
          {text("bank_branch", "Branch")}
          {text("bank_account_name", "Account name")}
          {text("bank_account_number", "Account number")}
          {text("bank_swift", "SWIFT / BIC")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>KRA eTIMS</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-muted-foreground">
            No eTIMS connection is configured, so documents are marked as not transmitted and no
            control code is printed. Nothing here claims compliance until a real connection exists.
          </p>
          <div className="flex items-center gap-2">
            <Switch checked={false} disabled aria-label="eTIMS transmission" />
            <span className="text-sm text-muted-foreground">Not connected</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
