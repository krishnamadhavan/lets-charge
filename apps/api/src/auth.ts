import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { residents, societies, wallets, type LetsChargeDb } from "@letscharge/db";
import { adminCookie, residentCookie, sessionCookieOptions } from "./cookies.js";
import { createOtpLimiter, otpAccepts } from "./otp.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSigned(request: FastifyRequest, name: string): string | undefined {
  const raw = request.cookies[name];
  if (!raw) {
    return undefined;
  }
  const parsed = request.unsignCookie(raw);
  return parsed.valid ? parsed.value : undefined;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  opts: {
    db: LetsChargeDb;
    otpStub: boolean;
    nodeEnv: string;
    adminLogin: string;
    adminPassword: string;
  },
): void {
  const allowOtp = createOtpLimiter();

  app.post("/v1/auth/otp/request", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!phone) {
      return reply.code(400).send({ error: "invalid_phone" });
    }
    if (!allowOtp(phone)) {
      return reply.code(429).send({ error: "rate_limited" });
    }
    return { ok: true };
  });

  app.post("/v1/auth/otp/verify", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!phone || !code) {
      return reply.code(400).send({ error: "invalid_body" });
    }
    if (!otpAccepts(phone, code, opts.otpStub)) {
      return reply.code(401).send({ error: "invalid_otp" });
    }

    const [resident] = await opts.db
      .select()
      .from(residents)
      .where(eq(residents.phone, phone))
      .limit(1);
    if (!resident) {
      return reply.code(401).send({ error: "invalid_otp" });
    }
    if (resident.status === "disabled") {
      return reply.code(403).send({ error: "disabled" });
    }

    reply.setCookie(residentCookie, resident.id, sessionCookieOptions(request, opts.nodeEnv));
    return { ok: true };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    reply.clearCookie(residentCookie, { path: "/" });
    return { ok: true };
  });

  app.get("/v1/me", async (request, reply) => {
    const residentId = readSigned(request, residentCookie);
    if (!residentId) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const [resident] = await opts.db
      .select()
      .from(residents)
      .where(eq(residents.id, residentId))
      .limit(1);
    if (!resident) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (resident.status === "disabled") {
      return reply.code(403).send({ error: "disabled" });
    }
    const [society] = await opts.db
      .select()
      .from(societies)
      .where(eq(societies.id, resident.societyId))
      .limit(1);
    const [wallet] = await opts.db
      .select()
      .from(wallets)
      .where(eq(wallets.residentId, resident.id))
      .limit(1);
    return {
      resident: {
        id: resident.id,
        display_name: resident.displayName,
        flat_label: resident.flatLabel,
        phone: resident.phone,
      },
      wallet: { balance_paise: wallet?.balancePaise ?? 0 },
      society: { name: society?.name ?? "" },
    };
  });

  app.post("/v1/admin/login", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const login = typeof body.login === "string" ? body.login : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!timingSafeEqualString(login, opts.adminLogin) || !timingSafeEqualString(password, opts.adminPassword)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    reply.setCookie(adminCookie, login, sessionCookieOptions(request, opts.nodeEnv));
    return { ok: true };
  });

  app.post("/v1/admin/logout", async (request, reply) => {
    reply.clearCookie(adminCookie, { path: "/" });
    return { ok: true };
  });
}

function timingSafeEqualString(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
