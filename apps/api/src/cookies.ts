import type { FastifyRequest } from "fastify";

export const residentCookie = "lc_resident";
export const adminCookie = "lc_admin";

export function cookieSecure(request: FastifyRequest, nodeEnv: string): boolean {
  return request.headers["x-forwarded-proto"] === "https" || nodeEnv === "production";
}

export function sessionCookieOptions(request: FastifyRequest, nodeEnv: string) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    signed: true,
    secure: cookieSecure(request, nodeEnv),
    maxAge: 7 * 24 * 60 * 60,
  };
}
