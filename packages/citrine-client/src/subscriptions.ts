import { citrineRequest, joinUrl, readError } from "./http.js";

export type CitrineClientOptions = {
  baseUrl: string;
  tenantId: number;
  subscriptionPath: string;
};

export type SubscriptionRecord = {
  id?: number;
  ocppConnectionName: string;
  url: string;
  onConnect?: boolean;
  onClose?: boolean;
  onMessage?: boolean;
  sentMessage?: boolean;
};

export type EnsureSubscriptionInput = {
  ocppConnectionName: string;
  url: string;
};

export type EnsureSubscriptionResult =
  | { created: false; id?: number }
  | { created: true; id: number };

export async function listSubscriptions(
  options: CitrineClientOptions,
  ocppConnectionName: string,
): Promise<SubscriptionRecord[]> {
  const url = new URL(joinUrl(options.baseUrl, options.subscriptionPath));
  url.searchParams.set("tenantId", String(options.tenantId));
  url.searchParams.set("ocppConnectionName", ocppConnectionName);
  const response = await citrineRequest(url, "GET");
  if (!response.ok) {
    throw new Error(
      `citrine list subscriptions ${response.status} ${await readError(response)}`.trim(),
    );
  }
  const payload: unknown = await response.json();
  return Array.isArray(payload) ? (payload as SubscriptionRecord[]) : [];
}

export async function createSubscription(
  options: CitrineClientOptions,
  input: EnsureSubscriptionInput,
): Promise<number> {
  const url = new URL(joinUrl(options.baseUrl, options.subscriptionPath));
  url.searchParams.set("tenantId", String(options.tenantId));
  const response = await citrineRequest(url, "POST", {
    ocppConnectionName: input.ocppConnectionName,
    url: input.url,
    onConnect: true,
    onClose: true,
    onMessage: true,
    sentMessage: true,
  });
  if (!response.ok) {
    throw new Error(
      `citrine create subscription ${response.status} ${await readError(response)}`.trim(),
    );
  }
  const payload: unknown = await response.json();
  if (typeof payload !== "number") {
    throw new Error("citrine create subscription: expected numeric id");
  }
  return payload;
}

export async function ensureStationSubscription(
  options: CitrineClientOptions,
  input: EnsureSubscriptionInput,
): Promise<EnsureSubscriptionResult> {
  const existing = await listSubscriptions(options, input.ocppConnectionName);
  const match = existing.find((row) => row.url === input.url);
  if (match) {
    return { created: false, id: match.id };
  }

  const id = await createSubscription(options, input);
  return { created: true, id };
}
