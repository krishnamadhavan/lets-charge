import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function requireInternalSecret(
  request: FastifyRequest<{ Querystring: { secret?: string } }>,
  reply: FastifyReply,
  expected: string,
): boolean {
  const secret = request.query.secret;
  if (typeof secret !== "string" || !secretsEqual(secret, expected)) {
    void reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}
