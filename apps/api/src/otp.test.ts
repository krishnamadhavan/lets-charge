import { describe, expect, it } from "vitest";
import { cookieSecure } from "./cookies.js";
import { createOtpLimiter, otpAccepts, stubOtpForPhone } from "./otp.js";

describe("otp stub", () => {
  it("accepts 000000 and the last six digits only when stubbed", () => {
    expect(stubOtpForPhone("+919800000001")).toEqual(["000000", "000001"]);
    expect(otpAccepts("+919800000001", "000000", true)).toBe(true);
    expect(otpAccepts("+919800000001", "000001", true)).toBe(true);
    expect(otpAccepts("+919800000001", "123456", true)).toBe(false);
    expect(otpAccepts("+919800000001", "000000", false)).toBe(false);
    expect(otpAccepts("+919800000001", 0, true)).toBe(true);
  });

  it("rate-limits a phone", () => {
    const allow = createOtpLimiter(60_000, 2);
    expect(allow("+91", 1_000)).toBe(true);
    expect(allow("+91", 2_000)).toBe(true);
    expect(allow("+91", 3_000)).toBe(false);
    expect(allow("+91", 62_000)).toBe(true);
  });
});

describe("cookie Secure", () => {
  it("is on only for https or production", () => {
    const http = { headers: {} } as never;
    const https = { headers: { "x-forwarded-proto": "https" } } as never;
    expect(cookieSecure(http, "development")).toBe(false);
    expect(cookieSecure(https, "development")).toBe(true);
    expect(cookieSecure(http, "production")).toBe(true);
  });
});
