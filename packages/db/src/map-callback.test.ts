import { describe, expect, it } from "vitest";
import { mapSubscriptionCallback } from "./map-callback.js";

describe("mapSubscriptionCallback", () => {
  it("maps a charger CALL as inbound", () => {
    const raw = {
      ocppConnectionName: "cp001",
      event: "message",
      origin: "cs",
      message: '[2,"abc","StopTransaction",{}]',
      info: {
        correlationId: "abc",
        origin: "cs",
        protocol: "ocpp1.6",
        action: "StopTransaction",
        type: "2",
      },
    };

    expect(mapSubscriptionCallback(raw)).toEqual({
      ocppStationId: "cp001",
      direction: "inbound",
      action: "StopTransaction",
      correlationId: "abc",
      raw,
      protocol: "ocpp1.6",
    });
  });

  it("maps a CSMS frame as outbound", () => {
    const raw = {
      ocppConnectionName: "cp001",
      event: "message",
      origin: "csms",
      info: {
        correlationId: "xyz",
        action: "RemoteStartTransaction",
        protocol: "ocpp1.6",
      },
    };

    expect(mapSubscriptionCallback(raw).direction).toBe("outbound");
    expect(mapSubscriptionCallback(raw).action).toBe("RemoteStartTransaction");
  });

  it("maps connected/closed without a correlation id", () => {
    const raw = { ocppConnectionName: "cp001", event: "connected" };
    expect(mapSubscriptionCallback(raw)).toEqual({
      ocppStationId: "cp001",
      direction: "inbound",
      action: "connected",
      correlationId: null,
      raw,
      protocol: "ocpp1.6",
    });
  });

  it("still maps a well-formed body with missing fields", () => {
    const raw = { event: "message" };
    expect(mapSubscriptionCallback(raw)).toEqual({
      ocppStationId: "",
      direction: "inbound",
      action: "message",
      correlationId: null,
      raw,
      protocol: "ocpp1.6",
    });
  });
});
