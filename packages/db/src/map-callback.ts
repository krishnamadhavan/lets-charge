export type OcppDirection = "inbound" | "outbound";

export type MappedOcppMessage = {
  ocppStationId: string;
  direction: OcppDirection;
  action: string;
  correlationId: string | null;
  raw: Record<string, unknown>;
  protocol: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Project CitrineOS subscription JSON onto ocpp_messages columns. raw is stored untouched. */
export function mapSubscriptionCallback(raw: Record<string, unknown>): MappedOcppMessage {
  const info = isRecord(raw.info) ? raw.info : {};
  const origin = asString(raw.origin) ?? asString(info.origin);
  const event = asString(raw.event);

  return {
    ocppStationId: asString(raw.ocppConnectionName) ?? "",
    direction: origin === "csms" ? "outbound" : "inbound",
    action: asString(info.action) ?? event ?? "unknown",
    correlationId: asString(info.correlationId) ?? null,
    raw,
    protocol: asString(info.protocol) ?? "ocpp1.6",
  };
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
