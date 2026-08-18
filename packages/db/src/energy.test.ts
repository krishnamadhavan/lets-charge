import { describe, expect, it } from "vitest";
import { amountPaise, closedEnergyWh, isBillable, liveEnergyWh, meterValueToWh } from "./energy.js";

describe("energy formulas", () => {
  it("computes live and closed Wh without inventing kWh", () => {
    expect(liveEnergyWh(0, 3250)).toBe(3250);
    expect(closedEnergyWh(0, 66)).toBe(66);
    expect(liveEnergyWh(100, 50)).toBeNull();
    expect(closedEnergyWh(100, 50)).toBeNull();
    expect(liveEnergyWh(null, 10)).toBeNull();
  });

  it("floors paise from Wh so 3250 Wh at ₹10/kWh is 3250 paise", () => {
    expect(amountPaise(3250, 1000)).toBe(3250);
  });

  it("rounds EVerest decimal Wh strings", () => {
    expect(meterValueToWh("38.00", "Wh")).toBe(38);
    expect(meterValueToWh("0.066", "kWh")).toBe(66);
  });
});

describe("billable", () => {
  const closed = {
    startedAt: "2026-08-18T00:00:00Z",
    stoppedAt: "2026-08-18T00:10:00Z",
    energyWh: 66,
    startMeterWh: 0,
    stopMeterWh: 66,
    status: "completed",
    residentId: "res-1",
    idTag: "LCDEMO00001",
  };

  it("is true only for a resident completed session with energy", () => {
    expect(isBillable(closed)).toBe(true);
  });

  it("is false for ADMIN and unmatched RFID", () => {
    expect(isBillable({ ...closed, idTag: "ADMIN", residentId: null })).toBe(false);
    expect(isBillable({ ...closed, residentId: null, idTag: "RFIDTEST01" })).toBe(false);
  });

  it("is false on meter reset", () => {
    expect(
      isBillable({ ...closed, energyWh: null, stopMeterWh: 10, startMeterWh: 50 }),
    ).toBe(false);
  });
});
