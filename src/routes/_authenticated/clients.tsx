import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, money, statusLabel, STATUS_TONE } from "@/lib/format";
import { useClientBalances, useClients, useSaveClient, type Client } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Financial Document OS" },
      { name: "description", content: "Manage client records, credit terms and balances." },
      { property: "og:title", content: "Clients — Financial Document OS" },
      { property: "og:description", content: "Client records, credit terms and live balances." },
    ],
  }),
  component: ClientsPage,
});

type Draft = Partial<Client> & { name: string };

function emptyDraft(currency: string, terms: number): Draft {
  return {
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    kra_pin: "",
    address: "",
    city: "",
    country: "Kenya",
    currency,
    payment_terms_days: terms,
    status: "ACTIVE",
    notes: "",
  };
}

function ClientsPage() {
  const { business, businessId } = useWorkspace();
  const clients = useClients(businessId);
  const balances = useClientBalances(businessId);
  const save = useSaveClient(businessId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");

  const balanceById = new Map(
    (balances.data ?? []).map((b) => [b.client_id, Number(b.balance ?? 0)]),
  );
  const list = (clients.data ?? []).filter((c) =>
    `${c.name} ${c.email ?? ""} ${c.kra_pin ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Credit terms and balances drive invoice due dates and reconciliation.
          </p>
        </div>
        <Button
          onClick={() =>
            setDraft(emptyDraft(business.base_currency, business.default_terms_days ?? 30))
          }
        >
          Add client
        </Button>
      </header>

      <Input
        placeholder="Search by name, email or KRA PIN"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {clients.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : clients.isError ? (
        <ErrorState
          message={clients.error instanceof Error ? clients.error.message : "Could not load clients"}
          onRetry={() => clients.refetch()}
        />
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {search ? "No client matches that search." : "No clients yet. Add your first client."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((client) => (
            <Card key={client.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{client.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {client.email || client.phone || "No contact details"}
                    </p>
                  </div>
                  <Badge variant="secondary" className={STATUS_TONE[client.status] ?? ""}>
                    {statusLabel(client.status)}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt>Balance</dt>
                    <dd className="tabular text-sm text-foreground">
                      {money(balanceById.get(client.id) ?? 0, client.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Terms</dt>
                    <dd className="text-sm text-foreground">{client.payment_terms_days} days</dd>
                  </div>
                </dl>
                <Button variant="outline" size="sm" onClick={() => setDraft({ ...client })}>
                  Edit
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(open) => (open ? null : setDraft(null))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit client" : "Add client"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form
              id="client-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(draft, {
                  onSuccess: () => {
                    toast.success("Client saved");
                    setDraft(null);
                  },
                  onError: (error) =>
                    toast.error(error instanceof Error ? error.message : "Could not save client"),
                });
              }}
            >
              <Field label="Name">
                <Input value={draft.name} onChange={(e) => set("name", e.target.value)} required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact person">
                  <Input
                    value={draft.contact_person ?? ""}
                    onChange={(e) => set("contact_person", e.target.value)}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={draft.email ?? ""}
                    onChange={(e) => set("email", e.target.value)}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={draft.phone ?? ""}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </Field>
                <Field label="KRA PIN">
                  <Input
                    value={draft.kra_pin ?? ""}
                    onChange={(e) => set("kra_pin", e.target.value)}
                  />
                </Field>
                <Field label="City">
                  <Input value={draft.city ?? ""} onChange={(e) => set("city", e.target.value)} />
                </Field>
                <Field label="Country">
                  <Input
                    value={draft.country ?? ""}
                    onChange={(e) => set("country", e.target.value)}
                  />
                </Field>
                <Field label="Currency">
                  <Select
                    value={draft.currency ?? business.base_currency}
                    onValueChange={(value) => set("currency", value)}
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
                </Field>
                <Field label="Payment terms (days)">
                  <Input
                    type="number"
                    min={0}
                    value={draft.payment_terms_days ?? 30}
                    onChange={(e) => set("payment_terms_days", Number(e.target.value))}
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={draft.status ?? "ACTIVE"}
                    onValueChange={(value) => set("status", value as Client["status"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["ACTIVE", "ON_HOLD", "INACTIVE"] as const).map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Address">
                <Textarea
                  value={draft.address ?? ""}
                  onChange={(e) => set("address", e.target.value)}
                  rows={2}
                />
              </Field>
              <Field label="Internal notes">
                <Textarea
                  value={draft.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={2}
                />
              </Field>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" form="client-form" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-destructive">{message}</p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
