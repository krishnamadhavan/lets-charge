import { citrineRequest, joinUrl, readError } from "./http.js";

export type MessageClientOptions = {
  baseUrl: string;
  tenantId: number;
  remoteStartPath: string;
  remoteStopPath: string;
};

export type MessageConfirmation = {
  success: boolean;
};

export function parseConfirmations(payload: unknown): MessageConfirmation[] {
  if (!Array.isArray(payload)) {
    throw new Error("citrine message: expected IMessageConfirmation[]");
  }
  return payload.map((item) => {
    if (typeof item !== "object" || item === null || typeof (item as { success?: unknown }).success !== "boolean") {
      throw new Error("citrine message: confirmation missing success");
    }
    return { success: (item as { success: boolean }).success };
  });
}

export function isQueued(confirmations: MessageConfirmation[]): boolean {
  return confirmations.some((item) => item.success);
}

export function coerceTransactionId(value: string): number | undefined {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 1) {
    return undefined;
  }
  return numeric;
}

async function postMessage(
  options: MessageClientOptions,
  path: string,
  identifier: string,
  body: unknown,
): Promise<MessageConfirmation[]> {
  const url = new URL(joinUrl(options.baseUrl, path));
  url.searchParams.set("identifier", identifier);
  url.searchParams.set("tenantId", String(options.tenantId));
  const response = await citrineRequest(url, "POST", body);
  if (!response.ok) {
    throw new Error(`citrine message ${response.status} ${await readError(response)}`.trim());
  }
  return parseConfirmations(await response.json());
}

export async function remoteStartTransaction(
  options: MessageClientOptions,
  input: { identifier: string; idTag: string; connectorId: number },
): Promise<MessageConfirmation[]> {
  return postMessage(options, options.remoteStartPath, input.identifier, {
    idTag: input.idTag,
    connectorId: input.connectorId,
  });
}

export async function remoteStopTransaction(
  options: MessageClientOptions,
  input: { identifier: string; transactionId: number },
): Promise<MessageConfirmation[]> {
  return postMessage(options, options.remoteStopPath, input.identifier, {
    transactionId: input.transactionId,
  });
}
