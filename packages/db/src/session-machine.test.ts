import { describe, expect, it } from "vitest";
import { applySessionEvent, newSessionSnap } from "./session-machine.js";

describe("session machine (EVerest-shaped)", () => {
  it("runs Boot-to-Stop for a resident as billable", () => {
    let row = newSessionSnap({ idTag: "LCDEMO00001", residentId: "res-1" });
    row = applySessionEvent(row, {
      type: "start_accepted",
      idTag: "LCDEMO00001",
      transactionId: "2",
      meterStartWh: 0,
      at: "2026-08-18T02:00:00Z",
    });
    expect(row.status).toBe("active");
    row = applySessionEvent(row, { type: "meter", meterWh: 38, at: "2026-08-18T02:01:00Z" });
    expect(row.lastMeterWh).toBe(38);
    row = applySessionEvent(row, {
      type: "stop",
      meterStopWh: 66,
      at: "2026-08-18T02:02:00Z",
      reason: "Remote",
    });
    expect(row.status).toBe("completed");
    expect(row.energyWh).toBe(66);
    expect(row.billable).toBe(true);
  });

  it("never bills ADMIN or unmatched RFID", () => {
    let admin = newSessionSnap({ idTag: "ADMIN", residentId: null });
    admin = applySessionEvent(admin, {
      type: "start_accepted",
      idTag: "ADMIN",
      transactionId: "2",
      meterStartWh: 0,
      at: "2026-08-18T02:00:00Z",
    });
    admin = applySessionEvent(admin, {
      type: "stop",
      meterStopWh: 66,
      at: "2026-08-18T02:02:00Z",
      reason: "Remote",
    });
    expect(admin.energyWh).toBe(66);
    expect(admin.billable).toBe(false);

    let rfid = newSessionSnap({ idTag: "RFIDTEST01", residentId: null });
    rfid = applySessionEvent(rfid, {
      type: "start_accepted",
      idTag: "RFIDTEST01",
      transactionId: "3",
      meterStartWh: 0,
      at: "2026-08-18T02:00:00Z",
    });
    rfid = applySessionEvent(rfid, {
      type: "stop",
      meterStopWh: 10,
      at: "2026-08-18T02:02:00Z",
      reason: "Local",
    });
    expect(rfid.billable).toBe(false);
  });

  it("fails pending_start on Rejected, Invalid, timeout, and offline", () => {
    const pending = newSessionSnap({ idTag: "LCDEMO00001", residentId: "res-1" });
    expect(applySessionEvent(pending, { type: "remote_start_rejected" }).status).toBe("failed");
    expect(applySessionEvent(pending, { type: "authorize_invalid" }).stopReason).toBe(
      "authorize_invalid",
    );
    expect(applySessionEvent(pending, { type: "timeout" }).stopReason).toBe("timeout");
    expect(applySessionEvent(pending, { type: "charger_offline" }).stopReason).toBe("timeout");
  });

  it("orphans on disconnect and completes on a late Stop", () => {
    let row = newSessionSnap({ idTag: "LCDEMO00001", residentId: "res-1" });
    row = applySessionEvent(row, {
      type: "start_accepted",
      idTag: "LCDEMO00001",
      transactionId: "2",
      meterStartWh: 0,
      at: "2026-08-18T02:00:00Z",
    });
    row = applySessionEvent(row, { type: "meter", meterWh: 20, at: "2026-08-18T02:01:00Z" });
    row = applySessionEvent(row, { type: "disconnect" });
    expect(row.status).toBe("orphan");
    row = applySessionEvent(row, {
      type: "stop",
      meterStopWh: 40,
      at: "2026-08-18T02:10:00Z",
      reason: "PowerLoss",
    });
    expect(row.status).toBe("completed");
    expect(row.billable).toBe(true);
  });

  it("marks meter_reset and does not bill when stop < start", () => {
    let row = newSessionSnap({ idTag: "LCDEMO00001", residentId: "res-1" });
    row = applySessionEvent(row, {
      type: "start_accepted",
      idTag: "LCDEMO00001",
      transactionId: "2",
      meterStartWh: 100,
      at: "2026-08-18T02:00:00Z",
    });
    row = applySessionEvent(row, {
      type: "stop",
      meterStopWh: 10,
      at: "2026-08-18T02:02:00Z",
      reason: "Remote",
    });
    expect(row.energyWh).toBeNull();
    expect(row.billable).toBe(false);
    expect(row.stopReason).toContain("meter_reset");
  });

  it("recovers an orphan from last meter without inventing energy", () => {
    let row = newSessionSnap({ idTag: "LCDEMO00001", residentId: "res-1" });
    row = applySessionEvent(row, {
      type: "start_accepted",
      idTag: "LCDEMO00001",
      transactionId: "2",
      meterStartWh: 0,
      at: "2026-08-18T02:00:00Z",
    });
    row = applySessionEvent(row, { type: "meter", meterWh: 20, at: "2026-08-18T02:01:00Z" });
    row = applySessionEvent(row, { type: "disconnect" });
    row = applySessionEvent(row, { type: "recover", at: "2026-08-18T02:15:00Z" });
    expect(row.status).toBe("recovered");
    expect(row.stopMeterWh).toBe(20);
    expect(row.energyWh).toBe(20);
    expect(row.billable).toBe(true);
  });
});
