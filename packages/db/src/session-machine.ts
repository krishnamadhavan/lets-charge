import { closedEnergyWh, isBillable } from "./energy.js";

export const openSessionStatuses = [
  "pending_start",
  "pending_stop",
  "active",
  "orphan",
] as const;

export type SessionStatus =
  | "pending_start"
  | "pending_stop"
  | "active"
  | "orphan"
  | "completed"
  | "recovered"
  | "failed";

export type SessionSnap = {
  status: SessionStatus;
  residentId: string | null;
  idTag: string;
  ocppTransactionId: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  startMeterWh: number | null;
  stopMeterWh: number | null;
  energyWh: number | null;
  lastMeterWh: number | null;
  lastMeterAt: string | null;
  stopReason: string | null;
  billable: boolean;
};

export type SessionEvent =
  | {
      type: "start_accepted";
      idTag: string;
      transactionId: string;
      meterStartWh: number;
      at: string;
    }
  | { type: "start_invalid" }
  | { type: "remote_start_rejected" }
  | { type: "authorize_invalid" }
  | { type: "timeout" }
  | { type: "charger_offline" }
  | { type: "meter"; meterWh: number; at: string }
  | { type: "stop"; meterStopWh: number; at: string; reason: string | null }
  | { type: "pending_stop" }
  | { type: "disconnect" }
  | { type: "recover"; at: string };

function finalize(row: SessionSnap): SessionSnap {
  const energyWh = closedEnergyWh(row.startMeterWh, row.stopMeterWh);
  const meterReset =
    row.startMeterWh !== null &&
    row.stopMeterWh !== null &&
    row.stopMeterWh < row.startMeterWh;
  const stopReason = meterReset
    ? row.stopReason
      ? `${row.stopReason},meter_reset`
      : "meter_reset"
    : row.stopReason;
  const next = { ...row, energyWh, stopReason };
  return { ...next, billable: isBillable(next) };
}

export function applySessionEvent(row: SessionSnap, event: SessionEvent): SessionSnap {
  switch (event.type) {
    case "start_accepted": {
      if (row.status === "completed" || row.status === "recovered" || row.status === "failed") {
        return row;
      }
      const transactionId = event.transactionId || row.ocppTransactionId || null;
      if (row.status === "active") {
        return {
          ...row,
          ocppTransactionId: transactionId,
          idTag: event.idTag || row.idTag,
        };
      }
      return finalize({
        ...row,
        status: "active",
        idTag: event.idTag || row.idTag,
        ocppTransactionId: transactionId,
        startedAt: event.at,
        startMeterWh: event.meterStartWh,
        lastMeterWh: event.meterStartWh,
        lastMeterAt: event.at,
      });
    }
    case "start_invalid":
    case "remote_start_rejected":
    case "authorize_invalid":
    case "timeout":
    case "charger_offline": {
      if (row.status !== "pending_start") {
        return row;
      }
      const reason =
        event.type === "start_invalid" || event.type === "authorize_invalid"
          ? "authorize_invalid"
          : event.type === "remote_start_rejected"
            ? "rejected"
            : "timeout";
      return finalize({ ...row, status: "failed", stopReason: reason });
    }
    case "meter": {
      if (row.status !== "active" && row.status !== "pending_stop") {
        return row;
      }
      return {
        ...row,
        lastMeterWh: event.meterWh,
        lastMeterAt: event.at,
      };
    }
    case "pending_stop": {
      if (row.status !== "active") {
        return row;
      }
      return { ...row, status: "pending_stop" };
    }
    case "stop": {
      if (
        row.status !== "active" &&
        row.status !== "pending_stop" &&
        row.status !== "orphan"
      ) {
        return row;
      }
      return finalize({
        ...row,
        status: "completed",
        stoppedAt: event.at,
        stopMeterWh: event.meterStopWh,
        lastMeterWh: event.meterStopWh,
        lastMeterAt: event.at,
        stopReason: event.reason,
      });
    }
    case "disconnect": {
      if (row.status === "pending_start") {
        return finalize({ ...row, status: "failed", stopReason: "timeout" });
      }
      if (row.status === "active" || row.status === "pending_stop") {
        return { ...row, status: "orphan" };
      }
      return row;
    }
    case "recover": {
      if (row.status !== "orphan" || row.lastMeterWh === null) {
        return row;
      }
      return finalize({
        ...row,
        status: "recovered",
        stoppedAt: event.at,
        stopMeterWh: row.lastMeterWh,
        stopReason: "recovered",
      });
    }
    default:
      return row;
  }
}

export function newSessionSnap(input: {
  idTag: string;
  residentId: string | null;
}): SessionSnap {
  return {
    status: "pending_start",
    residentId: input.residentId,
    idTag: input.idTag,
    ocppTransactionId: null,
    startedAt: null,
    stoppedAt: null,
    startMeterWh: null,
    stopMeterWh: null,
    energyWh: null,
    lastMeterWh: null,
    lastMeterAt: null,
    stopReason: null,
    billable: false,
  };
}
