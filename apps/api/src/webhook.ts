import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { appendOcppMessage, isJsonObject, type LetsChargeDb } from "@letscharge/db";

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function registerOcppWebhook(
  app: FastifyInstance,
  opts: { db: LetsChargeDb; webhookSecret: string },
): void {
  app.post<{ Querystring: { secret?: string } }>(
    "/internal/citrine/ocpp",
    async (request, reply) => {
      const secret = request.query.secret;
      if (typeof secret !== "string" || !secretsEqual(secret, opts.webhookSecret)) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (!isJsonObject(request.body)) {
        return reply.code(400).send({ error: "invalid_body" });
      }

      try {
        const result = await appendOcppMessage(opts.db, request.body);
        return reply.code(200).send({ ok: true, duplicate: result.duplicate });
      } catch (error) {
        request.log.error({ err: error }, "ocpp ingest persist failed");
        return reply.code(503).send({ error: "unavailable" });
      }
    },
  );
}
