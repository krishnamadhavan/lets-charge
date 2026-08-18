import { describe, expect, it } from "vitest";
import { coerceTransactionId, isQueued, parseConfirmations } from "./messages.js";

describe("message confirmations", () => {
  it("treats HTTP 200 [{success:true}] as queued", () => {
    expect(isQueued(parseConfirmations([{ success: true }]))).toBe(true);
    expect(isQueued(parseConfirmations([{ success: false }]))).toBe(false);
    expect(isQueued(parseConfirmations([]))).toBe(false);
  });

  it("rejects a non-array body", () => {
    expect(() => parseConfirmations({ success: true })).toThrow(/IMessageConfirmation/);
  });
});

describe("transactionId", () => {
  it("coerces OCPP 1.6 integer ids and rejects junk", () => {
    expect(coerceTransactionId("2")).toBe(2);
    expect(coerceTransactionId("0")).toBeUndefined();
    expect(coerceTransactionId("2.5")).toBeUndefined();
    expect(coerceTransactionId("abc")).toBeUndefined();
  });
});
