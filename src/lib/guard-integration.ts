// Local session-authenticated Guard connector API. No Guard signing secret in browser.
export type GuardRuntime = {
  mode: "PREVIEW" | "SANDBOX";
  deliveryEnabled: boolean;
  verifiedEventsEnabled: false;
  description: string;
};
export type GuardLinkResult = {
  id: string; invoiceId: string; guardProjectId: string; externalInvoiceId: string; warning: string;
};
export type GuardQueueResult = {
  queued: boolean; id?: string; eventId?: string; sequence?: number; type?: string;
  invoiceId?: string; source?: "sandbox"; reason?: string;
};
export type GuardDeliveryResult = {
  delivered: number; retry: number; held: number; mode: "SANDBOX"; verified: false;
};
export type GuardOutboxRow = {
  linkId: string; invoiceId: string; guardProjectId: string; enabled: boolean;
  latestSequence: number; eventId: string | null; eventRowId: string | null;
  sequence: number | null; status: "PENDING" | "RETRY" | "DELIVERED" | "HELD" | null;
  attempts: number | null; lastHttpStatus: number | null; createdAt: string | null;
};
export async function guardRequest<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/local/guard/" + action, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json() as {data?: T;error?: {message: string}|null};
  if (!response.ok || payload.error || payload.data === undefined)
    throw new Error(payload.error?.message || "Local Guard connector unavailable");
  return payload.data;
}
