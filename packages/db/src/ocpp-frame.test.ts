import { describe, expect, it } from "vitest";
import { extractEnergyWh, parseOcppMessage, sessionEventFromFrame } from "./ocpp-frame.js";

const everestMeter =
  '[2,"m1","MeterValues",{"connectorId":1,"transactionId":2,"meterValue":[{"timestamp":"2026-08-18T02:01:00Z","sampledValue":[{"value":"38.00","measurand":"Energy.Active.Import.Register","unit":"Wh","location":"Outlet"}]}]}]';

const everestStop =
  '[2,"s1","StopTransaction",{"transactionId":2,"meterStop":66,"reason":"Remote","timestamp":"2026-08-18T02:02:00Z"}]';

describe("ocpp frame", () => {
  it("parses EVerest MeterValues into Wh", () => {
    const frame = parseOcppMessage(everestMeter);
    expect(frame?.action).toBe("MeterValues");
    expect(
      extractEnergyWh(frame?.payload, "Energy.Active.Import.Register", "Wh"),
    ).toBe(38);
  });

  it("maps StopTransaction to a stop event", () => {
    const frame = parseOcppMessage(everestStop);
    const mapped = sessionEventFromFrame({
      action: "StopTransaction",
      direction: "inbound",
      event: "message",
      frame,
      measurand: "Energy.Active.Import.Register",
      energyUnit: "Wh",
      receivedAt: new Date("2026-08-18T02:02:00Z"),
    });
    expect(mapped?.sessionEvent).toMatchObject({
      type: "stop",
      meterStopWh: 66,
      reason: "Remote",
    });
    expect(mapped?.transactionId).toBe("2");
  });
});
