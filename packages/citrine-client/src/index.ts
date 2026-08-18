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

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function citrineFetch(
  options: CitrineClientOptions,
  method: "GET" | "POST",
  search: Record<string, string>,
  body?: unknown,
): Promise<Response> {
  const url = new URL(joinUrl(options.baseUrl, options.subscriptionPath));
  url.searchParams.set("tenantId", String(options.tenantId));
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }

  return fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function readError(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function listSubscriptions(
  options: CitrineClientOptions,
  ocppConnectionName: string,
): Promise<SubscriptionRecord[]> {
  const response = await citrineFetch(options, "GET", { ocppConnectionName });
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
  const response = await citrineFetch(options, "POST", {}, {
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

/** POST only if this callback URL is not already registered for the station. */
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
