export function stubOtpForPhone(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const lastSix = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, "0");
  return ["000000", lastSix];
}

export function otpAccepts(phone: string, code: string, stub: boolean): boolean {
  if (!stub) {
    return false;
  }
  return stubOtpForPhone(phone).includes(code);
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
