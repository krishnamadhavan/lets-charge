export function stubOtpForPhone(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const lastSix = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, "0");
  return ["000000", lastSix];
}

/** Swagger/JSON often send 000000 as the number 0. */
export function normalizeOtp(code: unknown): string {
  if (typeof code === "string") {
    return code.trim();
  }
  if (typeof code === "number" && Number.isFinite(code)) {
    return String(Math.trunc(Math.abs(code))).padStart(6, "0");
  }
  return "";
}

export function otpAccepts(phone: string, code: unknown, stub: boolean): boolean {
  if (!stub) {
    return false;
  }
  const normalized = normalizeOtp(code);
  return normalized.length > 0 && stubOtpForPhone(phone).includes(normalized);
}

export function createOtpLimiter(windowMs = 60_000, max = 5) {
  const hits = new Map<string, number[]>();

  return function allow(phone: string, now = Date.now()): boolean {
    const recent = (hits.get(phone) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      hits.set(phone, recent);
      return false;
    }
    recent.push(now);
    hits.set(phone, recent);
    return true;
  };
}
