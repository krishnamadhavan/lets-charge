import { meterValueToWh } from "./energy.js";
import type { SessionEvent } from "./session-machine.js";

export type ParsedOcppFrame = {
  messageType: 2 | 3 | 4;
  uniqueId: string;
  action: string | undefined;
  payload: unknown;
};

export function parseOcppMessage(message: unknown): ParsedOcppFrame | undefined {
  if (typeof message !== "string") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length < 2) {
    return undefined;
  }
  const messageType = Number(parsed[0]);
  if (messageType !== 2 && messageType !== 3 && messageType !== 4) {
    return undefined;
  }
  const uniqueId = parsed[1] === undefined || parsed[1] === null ? "" : String(parsed[1]);
  if (messageType === 2) {
    return {
      messageType,
      uniqueId,
      action: typeof parsed[2] === "string" ? parsed[2] : undefined,
      payload: parsed[3],
    };
  }
  return { messageType, uniqueId, action: undefined, payload: parsed[2] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

export function occurredAt(payload: unknown, receivedAt: Date): Date {
  if (isRecord(payload) && typeof payload.timestamp === "string") {
    const parsed = Date.parse(payload.timestamp);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return receivedAt;
}

export function extractEnergyWh(
  payload: unknown,
  measurand: string,
  defaultUnit: string,
): number | null {
  if (!isRecord(payload) || !Array.isArray(payload.meterValue)) {
    return null;
  }
  for (const sample of payload.meterValue) {
    if (!isRecord(sample) || !Array.isArray(sample.sampledValue)) {
      continue;
    }
    for (const point of sample.sampledValue) {
      if (!isRecord(point)) {
        continue;
      }
      const name = asString(point.measurand) ?? "Energy.Active.Import.Register";
      if (name !== measurand) {
        continue;
      }
      if (point.value === undefined) {
        continue;
      }
      const wh = meterValueToWh(
        point.value as string | number,
        asString(point.unit) ?? defaultUnit,
      );
      if (wh !== null) {
        return wh;
      }
    }
  }
  return null;
}

export function sessionEventFromFrame(input: {
  action: string;
  direction: "inbound" | "outbound";
  event: string | undefined;
  frame: ParsedOcppFrame | undefined;
  measurand: string;
  energyUnit: string;
  receivedAt: Date;
}): { sessionEvent: SessionEvent; connectorId: number | null; transactionId: string | null } | undefined {
  if (input.event === "closed") {
    return { sessionEvent: { type: "disconnect" }, connectorId: null, transactionId: null };
  }

  const payload = input.frame?.payload;
  const record = isRecord(payload) ? payload : {};
  const connectorId =
    typeof record.connectorId === "number" ? record.connectorId : null;
  const action = input.action;

  if (action === "StartTransaction" && input.frame?.messageType === 2) {
    const meterStart = meterValueToWh(
      (record.meterStart as string | number | undefined) ?? 0,
      input.energyUnit,
    );
    return {
      sessionEvent: {
        type: "start_accepted",
        idTag: asString(record.idTag) ?? "",
        transactionId: asString(record.transactionId) ?? "",
        meterStartWh: meterStart ?? 0,
        at: occurredAt(payload, input.receivedAt).toISOString(),
      },
      connectorId,
      transactionId: asString(record.transactionId) ?? null,
    };
  }

  if (action === "StartTransaction" && input.frame?.messageType === 3) {
    const info = isRecord(record.idTagInfo) ? record.idTagInfo : {};
    const status = asString(info.status);
    if (status === "Invalid" || status === "Blocked" || status === "Expired") {
      return {
        sessionEvent: { type: "start_invalid" },
        connectorId: null,
        transactionId: asString(record.transactionId) ?? null,
      };
    }
    if (status === "Accepted" || status === undefined) {
      return {
        sessionEvent: {
          type: "start_accepted",
          idTag: "",
          transactionId: asString(record.transactionId) ?? "",
          meterStartWh: 0,
          at: input.receivedAt.toISOString(),
        },
        connectorId: null,
        transactionId: asString(record.transactionId) ?? null,
      };
    }
  }

  if (action === "RemoteStartTransaction" && input.frame?.messageType === 3) {
    if (asString(record.status) === "Rejected") {
      return {
        sessionEvent: { type: "remote_start_rejected" },
        connectorId: null,
        transactionId: null,
      };
    }
  }

  if (action === "Authorize" && input.frame?.messageType === 3) {
    const info = isRecord(record.idTagInfo) ? record.idTagInfo : {};
    const status = asString(info.status);
    if (status === "Invalid" || status === "Blocked" || status === "Expired") {
      return {
        sessionEvent: { type: "authorize_invalid" },
        connectorId: null,
        transactionId: null,
      };
    }
  }

  if (action === "MeterValues") {
    const meterWh = extractEnergyWh(payload, input.measurand, input.energyUnit);
    if (meterWh === null) {
      return undefined;
    }
    const sample = Array.isArray(record.meterValue) ? record.meterValue[0] : undefined;
    const at = occurredAt(sample, input.receivedAt).toISOString();
    return {
      sessionEvent: { type: "meter", meterWh, at },
      connectorId,
      transactionId: asString(record.transactionId) ?? null,
    };
  }

  if (action === "StopTransaction" && input.frame?.messageType === 2) {
    const meterStop = meterValueToWh(
      (record.meterStop as string | number | undefined) ?? 0,
      input.energyUnit,
    );
    return {
      sessionEvent: {
        type: "stop",
        meterStopWh: meterStop ?? 0,
        at: occurredAt(payload, input.receivedAt).toISOString(),
        reason: asString(record.reason) ?? null,
      },
      connectorId,
      transactionId: asString(record.transactionId) ?? null,
    };
  }

  return undefined;
}

export function normalizedFields(input: {
  action: string;
  event: string | undefined;
  frame: ParsedOcppFrame | undefined;
  measurand: string;
  energyUnit: string;
}): Record<string, unknown> {
  const payload = isRecord(input.frame?.payload) ? input.frame.payload : {};
  const fields: Record<string, unknown> = {};
  if (input.event) {
    fields.event = input.event;
  }
  if (typeof payload.status === "string") {
    fields.status = payload.status;
  }
  if (typeof payload.errorCode === "string") {
    fields.errorCode = payload.errorCode;
  }
  const info = isRecord(payload.idTagInfo) ? payload.idTagInfo : undefined;
  if (info && typeof info.status === "string") {
    fields.idTagStatus = info.status;
  }
  if (payload.idTag !== undefined) {
    fields.idTag = payload.idTag;
  }
  const energyWh = extractEnergyWh(payload, input.measurand, input.energyUnit);
  if (energyWh !== null) {
    fields.meterWh = energyWh;
  }
  if (payload.meterStart !== undefined) {
    fields.meterStart = payload.meterStart;
  }
  if (payload.meterStop !== undefined) {
    fields.meterStop = payload.meterStop;
  }
  if (payload.reason !== undefined) {
    fields.reason = payload.reason;
  }
  return fields;
}
