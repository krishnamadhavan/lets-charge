export type SessionBillableInput = {
  startedAt: Date | string | null;
  stoppedAt: Date | string | null;
  energyWh: number | null;
  startMeterWh: number | null;
  stopMeterWh: number | null;
  status: string;
  residentId: string | null;
  idTag: string;
};

export function liveEnergyWh(
  startMeterWh: number | null,
  lastMeterWh: number | null,
): number | null {
  if (startMeterWh === null || lastMeterWh === null || lastMeterWh < startMeterWh) {
    return null;
  }
  return lastMeterWh - startMeterWh;
}

export function closedEnergyWh(
  startMeterWh: number | null,
  stopMeterWh: number | null,
): number | null {
  if (startMeterWh === null || stopMeterWh === null || stopMeterWh < startMeterWh) {
    return null;
  }
  return stopMeterWh - startMeterWh;
}

export function amountPaise(energyWh: number, tariffPaisePerKwh: number): number {
  return Math.floor((energyWh * tariffPaisePerKwh) / 1000);
}

export function isBillable(row: SessionBillableInput): boolean {
  return (
    row.startedAt !== null &&
    row.stoppedAt !== null &&
    row.energyWh !== null &&
    row.startMeterWh !== null &&
    row.stopMeterWh !== null &&
    row.stopMeterWh >= row.startMeterWh &&
    (row.status === "completed" || row.status === "recovered") &&
    row.residentId !== null &&
    row.idTag !== "ADMIN"
  );
}

export function meterValueToWh(value: string | number, unit: string | undefined): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const normalized = (unit ?? "Wh").toLowerCase();
  const wh = normalized === "kwh" ? numeric * 1000 : numeric;
  return Math.round(wh);
}
