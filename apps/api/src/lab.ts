import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { chargers, residents, type LetsChargeDb } from "@letscharge/db";
import {
  commissionBoot,
  ensureStationSubscription,
  upsertAuthorization,
  type MessageClientOptions,
} from "@letscharge/citrine-client";
import { callbackUrlWithSecret, type ApiEnv } from "./env.js";
import { requireInternalSecret } from "./internal-auth.js";
import { errorBody, idParams, secretQuery } from "./schemas.js";
import { startSession, stopOpenSessionOnCharger, stopSession } from "./sessions.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerLabRoutes(
  app: FastifyInstance,
  opts: {
    db: LetsChargeDb;
    webhookSecret: string;
    citrine: NonNullable<ApiEnv["citrine"]>;
  },
): void {
  const messages: MessageClientOptions = {
    baseUrl: opts.citrine.baseUrl,
    tenantId: opts.citrine.tenantId,
    remoteStartPath: opts.citrine.remoteStartPath,
    remoteStopPath: opts.citrine.remoteStopPath,
  };

  app.post<{ Querystring: { secret?: string } }>(
    "/internal/lab/sessions/start",
    {
      schema: {
        tags: ["internal"],
        security: [{ querySecret: [] }],
        querystring: secretQuery,
        body: {
          type: "object",
          required: ["id_tag"],
          properties: {
            id_tag: { type: "string" },
            charger_id: { type: "string" },
            short_code: { type: "string" },
            connector_ocpp_id: { type: "integer" },
          },
        },
        response: {
          201: { type: "object", properties: { id: { type: "string" } } },
          400: errorBody,
          401: errorBody,
          404: errorBody,
          409: errorBody,
          502: errorBody,
        },
      },
    },
    async (request, reply) => {
    if (!requireInternalSecret(request, reply, opts.webhookSecret)) {
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    const idTag = typeof body.id_tag === "string" ? body.id_tag : "";
    if (!idTag || idTag.length > 20) {
      return reply.code(400).send({ error: "invalid_id_tag" });
    }
    const result = await startSession(opts.db, messages, {
      chargerId: typeof body.charger_id === "string" ? body.charger_id : undefined,
      shortCode: typeof body.short_code === "string" ? body.short_code : undefined,
      connectorOcppId: typeof body.connector_ocpp_id === "number" ? body.connector_ocpp_id : 1,
      idTag,
    });
    if ("error" in result) {
      return reply.code(result.status).send({ error: result.error });
    }
    return reply.code(201).send({ id: result.id });
    },
  );

  app.post<{ Querystring: { secret?: string }; Params: { id: string } }>(
    "/internal/lab/sessions/:id/stop",
    {
      schema: {
        tags: ["internal"],
        security: [{ querySecret: [] }],
        querystring: secretQuery,
        params: idParams,
        response: {
          200: { type: "object", properties: { id: { type: "string" } } },
          401: errorBody,
          404: errorBody,
          409: errorBody,
          502: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!requireInternalSecret(request, reply, opts.webhookSecret)) {
        return;
      }
      const result = await stopSession(opts.db, messages, request.params.id);
      if ("error" in result) {
        return reply.code(result.status).send({ error: result.error });
      }
      return reply.code(200).send({ id: result.id });
    },
  );

  app.post<{ Querystring: { secret?: string }; Params: { id: string } }>(
    "/internal/lab/chargers/:id/stop",
    {
      schema: {
        tags: ["internal"],
        security: [{ querySecret: [] }],
        querystring: secretQuery,
        params: idParams,
        response: {
          200: { type: "object", properties: { id: { type: "string" } } },
          401: errorBody,
          404: errorBody,
          409: errorBody,
          502: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!requireInternalSecret(request, reply, opts.webhookSecret)) {
        return;
      }
      const result = await stopOpenSessionOnCharger(opts.db, messages, request.params.id);
      if ("error" in result) {
        return reply.code(result.status).send({ error: result.error });
      }
      return reply.code(200).send({ id: result.id });
    },
  );

  app.post<{ Querystring: { secret?: string }; Params: { id: string } }>(
    "/internal/lab/chargers/:id/commission",
    {
      schema: {
        tags: ["internal"],
        security: [{ querySecret: [] }],
        querystring: secretQuery,
        params: idParams,
        response: { 200: { type: "object", additionalProperties: true }, 401: errorBody, 404: errorBody },
      },
    },
    async (request, reply) => {
      if (!requireInternalSecret(request, reply, opts.webhookSecret)) {
        return;
      }
      const [charger] = await opts.db
        .select()
        .from(chargers)
        .where(eq(chargers.id, request.params.id))
        .limit(1);
      if (!charger) {
        return reply.code(404).send({ error: "not_found" });
      }
      const result = await commissionAndSubscribe(opts, charger.ocppStationId);
      return reply.code(200).send(result);
    },
  );

  app.post<{ Querystring: { secret?: string } }>(
    "/internal/lab/authorizations/seed",
    {
      schema: {
        tags: ["internal"],
        security: [{ querySecret: [] }],
        querystring: secretQuery,
        response: {
          200: {
            type: "object",
            properties: { seeded: { type: "array", items: { type: "string" } } },
          },
          401: errorBody,
        },
      },
    },
    async (request, reply) => {
      if (!requireInternalSecret(request, reply, opts.webhookSecret)) {
        return;
      }
      const seeded = await seedAuthorizations(opts);
      return reply.code(200).send({ seeded });
    },
  );
}

export async function commissionAndSubscribe(
  opts: {
    citrine: NonNullable<ApiEnv["citrine"]>;
    webhookSecret: string;
  },
  ocppStationId: string,
): Promise<{ boot: boolean; subscription: { created: boolean; id?: number } }> {
  await commissionBoot(
    {
      baseUrl: opts.citrine.baseUrl,
      tenantId: opts.citrine.tenantId,
      bootPath: opts.citrine.bootPath,
    },
    ocppStationId,
  );
  const subscription = await ensureStationSubscription(
    {
      baseUrl: opts.citrine.baseUrl,
      tenantId: opts.citrine.tenantId,
      subscriptionPath: opts.citrine.subscriptionPath,
    },
    {
      ocppConnectionName: ocppStationId,
      url: callbackUrlWithSecret(opts.citrine.webhookUrl, opts.webhookSecret),
    },
  );
  return { boot: true, subscription };
}

export async function seedAuthorizations(opts: {
  db: LetsChargeDb;
  citrine: NonNullable<ApiEnv["citrine"]>;
}): Promise<string[]> {
  if (!opts.citrine.hasuraUrl) {
    throw new Error("missing CITRINE_HASURA_URL");
  }
  const tags = ["ADMIN", "RFIDTEST01"];
  const people = await opts.db.select({ tag: residents.ocppIdTag }).from(residents);
  for (const person of people) {
    tags.push(person.tag);
  }
  const seeded: string[] = [];
  for (const idToken of tags) {
    await upsertAuthorization(
      { url: opts.citrine.hasuraUrl },
      { idToken, status: "Accepted", tenantId: opts.citrine.tenantId },
    );
    seeded.push(idToken);
  }
  return seeded;
}
