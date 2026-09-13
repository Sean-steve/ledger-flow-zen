import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type Business = Tables["businesses"]["Row"];
export type Client = Tables["clients"]["Row"];
export type DocumentRow = Tables["documents"]["Row"];
export type DocumentItem = Tables["document_items"]["Row"];
export type Payment = Tables["payments"]["Row"];
export type Receipt = Tables["receipts"]["Row"];
export type Allocation = Tables["allocations"]["Row"];
export type AuditLog = Tables["audit_logs"]["Row"];
export type ShareLink = Tables["share_links"]["Row"];
export type InvoiceLedger = Database["public"]["Views"]["invoice_ledger"]["Row"];
export type ClientBalance = Database["public"]["Views"]["client_balances"]["Row"];

const ACTIVE_KEY = "fdos.activeBusiness";

function unwrap<T>({
  data,
  error,
}: {
  data: T | null;
  error: { message: string } | null;
}): NonNullable<T> {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

/* ------------------------------------------------------------------ session */

export function useSession() {
  const [state, setState] = useState<{ loading: boolean; userId: string | null; email: string | null }>({
    loading: true,
    userId: null,
    email: null,
  });

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setState({ loading: false, userId: data.user?.id ?? null, email: data.user?.email ?? null });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, userId: session?.user?.id ?? null, email: session?.user?.email ?? null });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/* ----------------------------------------------------------------- business */

export function useBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async () =>
      unwrap(await supabase.from("businesses").select("*").order("created_at", { ascending: true })),
  });
}

export function useActiveBusiness() {
  const businesses = useBusinesses();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && id === null) {
      setId(window.localStorage.getItem(ACTIVE_KEY));
    }
  }, [id]);

  const select = useCallback((next: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_KEY, next);
    setId(next);
  }, []);

  const list = businesses.data ?? [];
  const active = list.find((b) => b.id === id) ?? list[0] ?? null;

  return { ...businesses, businesses: list, business: active, businessId: active?.id ?? null, select };
}

export function useCreateBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; base_currency: string }) =>
      unwrap(
        await supabase.rpc("create_business", {
          _name: input.name,
          _base_currency: input.base_currency,
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useUpdateBusiness(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Tables["businesses"]["Update"]) => {
      if (!businessId) throw new Error("No business selected");
      return unwrap(
        await supabase.from("businesses").update(patch).eq("id", businessId).select().single(),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["businesses"] }),
  });
}

/* ------------------------------------------------------------------ clients */

export function useClients(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["clients", businessId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("clients")
          .select("*")
          .eq("business_id", businessId!)
          .order("name", { ascending: true }),
      ),
  });
}

export function useClientBalances(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["client_balances", businessId],
    queryFn: async () =>
      unwrap(await supabase.from("client_balances").select("*").eq("business_id", businessId!)),
  });
}

export function useSaveClient(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Client> & { name: string }) => {
      if (!businessId) throw new Error("No business selected");
      if (input.id) {
        const { id, ...patch } = input;
        return unwrap(await supabase.from("clients").update(patch).eq("id", id).select().single());
      }
      return unwrap(
        await supabase
          .from("clients")
          .insert({ ...input, business_id: businessId })
          .select()
          .single(),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client_balances"] });
    },
  });
}

/* ---------------------------------------------------------------- documents */

export function useDocuments(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["documents", businessId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("documents")
          .select("*")
          .eq("business_id", businessId!)
          .order("created_at", { ascending: false }),
      ),
  });
}

export function useLedger(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["invoice_ledger", businessId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("invoice_ledger")
          .select("*")
          .eq("business_id", businessId!)
          .order("issue_date", { ascending: false }),
      ),
  });
}

export function useDocument(documentId: string | undefined) {
  return useQuery({
    enabled: !!documentId,
    queryKey: ["document", documentId],
    queryFn: async () => {
      const document = unwrap(
        await supabase.from("documents").select("*").eq("id", documentId!).single(),
      );
      const items = unwrap(
        await supabase
          .from("document_items")
          .select("*")
          .eq("document_id", documentId!)
          .order("position", { ascending: true }),
      );
      const business = unwrap(
        await supabase.from("businesses").select("*").eq("id", document.business_id).single(),
      );
      const ledger =
        document.type === "INVOICE"
          ? (
              await supabase
                .from("invoice_ledger")
                .select("*")
                .eq("invoice_id", documentId!)
                .maybeSingle()
            ).data
          : null;
      const allocations =
        document.type === "INVOICE"
          ? unwrap(
              await supabase
                .from("allocations")
                .select("*, payments(*)")
                .eq("invoice_id", documentId!)
                .order("created_at", { ascending: true }),
            )
          : [];
      const versions = unwrap(
        await supabase
          .from("document_versions")
          .select("id, version, reason, created_at")
          .eq("document_id", documentId!)
          .order("version", { ascending: false }),
      );
      return { document, items, business, ledger, allocations, versions };
    },
  });
}

export function useCreateDraft(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      client: Client;
      type: DocumentRow["type"];
      issue_date: string;
      payment_terms_days: number;
      currency: string;
      exchange_rate: number;
      wht_applicable: boolean;
      wht_rate: number;
      notes: string | null;
      legal_terms: string | null;
      template_id: string;
      parent_document_id?: string | null;
      items: Array<Omit<Tables["document_items"]["Insert"], "document_id">>;
    }) => {
      if (!businessId) throw new Error("No business selected");
      const document = unwrap(
        await supabase
          .from("documents")
          .insert({
            business_id: businessId,
            client_id: input.client.id,
            type: input.type,
            client_name: input.client.name,
            client_email: input.client.email,
            client_kra_pin: input.client.kra_pin,
            client_address: input.client.address,
            currency: input.currency,
            exchange_rate: input.exchange_rate,
            wht_applicable: input.wht_applicable,
            wht_rate: input.wht_rate,
            issue_date: input.issue_date,
            payment_terms_days: input.payment_terms_days,
            notes: input.notes,
            legal_terms: input.legal_terms,
            template_id: input.template_id,
            parent_document_id: input.parent_document_id ?? null,
          })
          .select()
          .single(),
      );
      if (input.items.length) {
        unwrap(
          await supabase
            .from("document_items")
            .insert(input.items.map((item) => ({ ...item, document_id: document.id })))
            .select("id"),
        );
      }
      const { error } = await supabase.rpc("recalculate_document", { _document_id: document.id });
      if (error) throw new Error(error.message);
      return document;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useReplaceDraftItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      patch: Tables["documents"]["Update"];
      items: Array<Omit<Tables["document_items"]["Insert"], "document_id">>;
    }) => {
      unwrap(
        await supabase.from("documents").update(input.patch).eq("id", input.documentId).select().single(),
      );
      const { error: delError } = await supabase
        .from("document_items")
        .delete()
        .eq("document_id", input.documentId);
      if (delError) throw new Error(delError.message);
      if (input.items.length) {
        unwrap(
          await supabase
            .from("document_items")
            .insert(input.items.map((item) => ({ ...item, document_id: input.documentId })))
            .select("id"),
        );
      }
      const { error } = await supabase.rpc("recalculate_document", {
        _document_id: input.documentId,
      });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDocumentActions() {
  const qc = useQueryClient();
  const done = { onSuccess: () => qc.invalidateQueries() };

  return {
    issue: useMutation({
      mutationFn: async (documentId: string) =>
        unwrap(await supabase.rpc("finalize_document", { _document_id: documentId })),
      ...done,
    }),
    issueCreditNote: useMutation({
      mutationFn: async (documentId: string) =>
        unwrap(await supabase.rpc("issue_credit_note", { _credit_note_id: documentId })),
      ...done,
    }),
    convert: useMutation({
      mutationFn: async (input: { id: string; target: DocumentRow["type"] }) =>
        unwrap(
          await supabase.rpc("convert_document", {
            _source_id: input.id,
            _target_type: input.target,
          }),
        ),
      ...done,
    }),
    voidDocument: useMutation({
      mutationFn: async (input: { id: string; reason: string }) =>
        unwrap(await supabase.rpc("void_document", { _document_id: input.id, _reason: input.reason })),
      ...done,
    }),
    setStatus: useMutation({
      mutationFn: async (input: { id: string; status: DocumentRow["status"] }) =>
        unwrap(
          await supabase
            .from("documents")
            .update({ status: input.status })
            .eq("id", input.id)
            .select()
            .single(),
        ),
      ...done,
    }),
    markSent: useMutation({
      mutationFn: async (id: string) =>
        unwrap(
          await supabase
            .from("documents")
            .update({ sent_at: new Date().toISOString() })
            .eq("id", id)
            .select()
            .single(),
        ),
      ...done,
    }),
  };
}

/* ----------------------------------------------------------------- payments */

export function usePayments(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["payments", businessId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("payments")
          .select("*, clients(name)")
          .eq("business_id", businessId!)
          .order("payment_date", { ascending: false }),
      ),
  });
}

export function useReceipts(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["receipts", businessId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("receipts")
          .select("*, payments(*), clients(name)")
          .eq("business_id", businessId!)
          .order("created_at", { ascending: false }),
      ),
  });
}

export function useRecordPayment(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      client_id: string;
      amount: number;
      channel: Payment["channel"];
      currency: string;
      payment_date: string;
      reference?: string | null;
      channel_txn_id?: string | null;
      payer_name?: string | null;
      payer_phone?: string | null;
      notes?: string | null;
      allocations?: Array<{ invoice_id: string; amount: number }>;
    }) => {
      if (!businessId) throw new Error("No business selected");
      return unwrap(
        await supabase.rpc("record_payment", {
          _business_id: businessId,
          _client_id: input.client_id,
          _amount: input.amount,
          _channel: input.channel,
          _currency: input.currency,
          _payment_date: new Date(input.payment_date).toISOString(),
          ...(input.reference ? { _reference: input.reference } : {}),
          ...(input.channel_txn_id ? { _channel_txn_id: input.channel_txn_id } : {}),
          ...(input.payer_name ? { _payer_name: input.payer_name } : {}),
          ...(input.payer_phone ? { _payer_phone: input.payer_phone } : {}),
          ...(input.notes ? { _notes: input.notes } : {}),
          _allocations: input.allocations ?? [],
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useReversePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) =>
      unwrap(await supabase.rpc("reverse_payment", { _payment_id: input.id, _reason: input.reason })),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/* -------------------------------------------------------- sharing and audit */

export function useShareLinks(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["share_links", businessId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("share_links")
          .select("*")
          .eq("business_id", businessId!)
          .order("created_at", { ascending: false }),
      ),
  });
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function useCreateShareLink(businessId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { document_id?: string; receipt_id?: string }) => {
      if (!businessId) throw new Error("No business selected");
      return unwrap(
        await supabase
          .from("share_links")
          .insert({
            business_id: businessId,
            document_id: input.document_id ?? null,
            receipt_id: input.receipt_id ?? null,
            token: randomToken(),
          })
          .select()
          .single(),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["share_links"] }),
  });
}

export function useRevokeShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await supabase
          .from("share_links")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["share_links"] }),
  });
}

export function useAuditLogs(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["audit_logs", businessId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("audit_logs")
          .select("*")
          .eq("business_id", businessId!)
          .order("created_at", { ascending: false })
          .limit(300),
      ),
  });
}

export function useSharedDocument(token: string | undefined) {
  return useQuery({
    enabled: !!token,
    queryKey: ["shared", token],
    queryFn: async () => unwrap(await supabase.rpc("get_shared_document", { _token: token! })),
  });
}
