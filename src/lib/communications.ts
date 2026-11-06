import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type CommunicationChannel = "EMAIL" | "WHATSAPP";
export type CommunicationState = "PREVIEW" | "QUEUED" | "ACCEPTED" | "FAILED" | "UNKNOWN";
export type CommunicationRecord = {
  id: string;
  business_id: string;
  client_id?: string;
  document_id?: string | null;
  receipt_id?: string | null;
  channel: CommunicationChannel;
  recipient: string;
  subject: string;
  preview_text: string;
  status: CommunicationState;
  delivery_mode: "preview" | "live";
  provider_id: string | null;
  provider_error_code: string | null;
  created_at: string;
  accepted_at: string | null;
  duplicate?: boolean;
};
export type CommunicationConfig = {
  mode: "preview" | "live";
  emailConfigured: boolean;
  whatsappConfigured: boolean;
  notice: string;
};
export type CommunicationPreferences = {
  businessId: string;
  clientId: string;
  whatsappOptedIn: boolean;
  whatsappSource: string | null;
  whatsappOptedInAt: string | null;
  emailOptedOut: boolean;
};
export async function communicationRequest<T>(
  action: string, body: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/api/local/communications/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const result = await response.json() as { data: T; error?: { message: string } | null };
  if (!response.ok || result.error) {
    throw new Error(result.error?.message ?? "Communication request failed");
  }
  return result.data;
}
export function useCommunicationConfig() {
  return useQuery({
    queryKey: ["communication-config"],
    queryFn: () => communicationRequest<CommunicationConfig>("config"),
    staleTime: 30_000,
  });
}
export function useCommunicationOutbox(businessId: string | null) {
  return useQuery({
    enabled: !!businessId,
    queryKey: ["communication-outbox", businessId],
    queryFn: () => communicationRequest<CommunicationRecord[]>("outbox", {
      businessId,
    }),
  });
}
export function useSendCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      businessId: string;
      documentId?: string;
      receiptId?: string;
      channel: CommunicationChannel;
      requestKey: string;
    }) => communicationRequest<CommunicationRecord>("send", request),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["communication-outbox"] });
      void qc.invalidateQueries({ queryKey: ["document"] });
    },
  });
}
export function useCommunicationPreferences(
  businessId: string | null, clientId: string | null,
) {
  return useQuery({
    enabled: !!businessId && !!clientId,
    queryKey: ["communication-preferences", businessId, clientId],
    queryFn: () => communicationRequest<CommunicationPreferences>("preferences", {
      businessId, clientId,
    }),
  });
}
export function useUpdateCommunicationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: {
      businessId: string;
      clientId: string;
      channel: CommunicationChannel;
      optedIn: boolean;
      source?: "DIRECT_REQUEST" | "WEB_FORM" | "WRITTEN" | "OTHER";
    }) => communicationRequest<CommunicationPreferences>("preferences/update", request),
    onSuccess: (_, input) => void qc.invalidateQueries({
      queryKey: ["communication-preferences", input.businessId, input.clientId],
    }),
  });
}
