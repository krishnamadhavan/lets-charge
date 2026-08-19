import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  chargers,
  liveEnergyWh,
  parkingSlots,
  residents,
  sessions,
  type LetsChargeDb,
} from "@letscharge/db";
import type { MessageClientOptions } from "@letscharge/citrine-client";
import { adminCookie, readSignedCookie } from "./cookies.js";
import { errorBody, idParams } from "./schemas.js";
import { recoverStop, startSession, stopOpenSessionOnCharger } from "./sessions.js";

function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): string | undefined {
  const login = readSignedCookie(request, adminCookie);
  if (!login) {
    void reply.code(401).send({ error: "unauthorized" });
    return undefined;
  }
  return login;
}

function energyKwh(row: {
  status: string;
  energyWh: number | null;
  startMeterWh: number | null;
  lastMeterWh: number | null;
}): number | null {
  const wh =
    row.status === "completed" || row.status === "recovered"
      ? row.energyWh
      : liveEnergyWh(row.startMeterWh, row.lastMeterWh);
  return wh === null ? null : Math.round(wh) / 1000;
}

export function registerAdminRoutes(
  app: FastifyInstance,
  opts: { db: LetsChargeDb; citrine: MessageClientOptions | undefined },
): void {
  app.get(
    "/v1/admin/chargers",
    {
      schema: {
        tags: ["admin"],
        security: [{ adminCookie: [] }],
        response: { 401: errorBody },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }
      const rows = await opts.db
        .select({
          id: chargers.id,
          shortCode: chargers.shortCode,
          slotLabel: parkingSlots.label,
          vendor: chargers.vendor,
          model: chargers.model,
          serial: chargers.serial,
          firmware: chargers.firmware,
          wsConnected: chargers.wsConnected,
          lastSeenAt: chargers.lastSeenAt,
          lastStatus: chargers.lastStatus,
          lastError: chargers.lastError,
        })
        .from(chargers)
        .leftJoin(parkingSlots, eq(chargers.slotId, parkingSlots.id));

      return rows.map((row) => ({
        id: row.id,
        short_code: row.shortCode,
        slot_label: row.slotLabel,
        vendor: row.vendor,
        model: row.model,
        serial: row.serial,
        firmware: row.firmware,
        online: row.wsConnected,
        last_seen_at: row.lastSeenAt?.toISOString() ?? null,
        status: row.lastStatus,
        last_error: row.lastError,
      }));
    },
  );

  app.post<{ Params: { id: string } }>(
    "/v1/admin/chargers/:id/start",
    {
      schema: {
        tags: ["admin"],
        security: [{ adminCookie: [] }],
        params: idParams,
        response: { 401: errorBody, 404: errorBody, 409: errorBody, 502: errorBody, 503: errorBody },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }
      if (!opts.citrine) {
        return reply.code(503).send({ error: "citrine_unreachable" });
      }
      const result = await startSession(opts.db, opts.citrine, {
        chargerId: request.params.id,
        idTag: "ADMIN",
      });
      if ("error" in result) {
        return reply.code(result.status).send({ error: result.error });
      }
      return reply.code(201).send({ id: result.id });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/v1/admin/chargers/:id/stop",
    {
      schema: {
        tags: ["admin"],
        security: [{ adminCookie: [] }],
        params: idParams,
        response: { 401: errorBody, 404: errorBody, 409: errorBody, 502: errorBody, 503: errorBody },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }
      if (!opts.citrine) {
        return reply.code(503).send({ error: "citrine_unreachable" });
      }
      const result = await stopOpenSessionOnCharger(opts.db, opts.citrine, request.params.id);
      if ("error" in result) {
        return reply.code(result.status).send({ error: result.error });
      }
      return { id: result.id };
    },
  );

  app.get(
    "/v1/admin/sessions",
    {
      schema: {
        tags: ["admin"],
        security: [{ adminCookie: [] }],
        response: { 401: errorBody },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }
      const rows = await opts.db
        .select({
          id: sessions.id,
          status: sessions.status,
          idTag: sessions.idTag,
          billable: sessions.billable,
          startedAt: sessions.startedAt,
          stoppedAt: sessions.stoppedAt,
          energyWh: sessions.energyWh,
          startMeterWh: sessions.startMeterWh,
          lastMeterWh: sessions.lastMeterWh,
          shortCode: chargers.shortCode,
          flatLabel: residents.flatLabel,
          displayName: residents.displayName,
        })
        .from(sessions)
        .innerJoin(chargers, eq(sessions.chargerId, chargers.id))
        .leftJoin(residents, eq(sessions.residentId, residents.id))
        .orderBy(desc(sessions.createdAt));

      return rows.map((row) => ({
        id: row.id,
        status: row.status,
        id_tag: row.idTag,
        billable: row.billable,
        started_at: row.startedAt?.toISOString() ?? null,
        stopped_at: row.stoppedAt?.toISOString() ?? null,
        energy_kwh: energyKwh(row),
        charger_short_code: row.shortCode,
        resident_flat: row.flatLabel,
        resident_name: row.displayName,
      }));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/admin/sessions/:id",
    {
      schema: {
        tags: ["admin"],
        security: [{ adminCookie: [] }],
        params: idParams,
        response: { 401: errorBody, 404: errorBody },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }
      const [row] = await opts.db
        .select({
          id: sessions.id,
          status: sessions.status,
          idTag: sessions.idTag,
          billable: sessions.billable,
          startedAt: sessions.startedAt,
          stoppedAt: sessions.stoppedAt,
          energyWh: sessions.energyWh,
          startMeterWh: sessions.startMeterWh,
          lastMeterWh: sessions.lastMeterWh,
          stopReason: sessions.stopReason,
          shortCode: chargers.shortCode,
          flatLabel: residents.flatLabel,
          displayName: residents.displayName,
        })
        .from(sessions)
        .innerJoin(chargers, eq(sessions.chargerId, chargers.id))
        .leftJoin(residents, eq(sessions.residentId, residents.id))
        .where(eq(sessions.id, request.params.id))
        .limit(1);
      if (!row) {
        return reply.code(404).send({ error: "not_found" });
      }
      return {
        id: row.id,
        status: row.status,
        id_tag: row.idTag,
        billable: row.billable,
        started_at: row.startedAt?.toISOString() ?? null,
        stopped_at: row.stoppedAt?.toISOString() ?? null,
        energy_kwh: energyKwh(row),
        stop_reason: row.stopReason,
        charger_short_code: row.shortCode,
        resident_flat: row.flatLabel,
        resident_name: row.displayName,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/v1/admin/sessions/:id/recover-stop",
    {
      schema: {
        tags: ["admin"],
        security: [{ adminCookie: [] }],
        params: idParams,
        response: { 401: errorBody, 404: errorBody, 409: errorBody },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) {
        return;
      }
      const result = await recoverStop(opts.db, request.params.id);
      if ("error" in result) {
        return reply.code(result.status).send({ error: result.error });
      }
      return { id: result.id };
    },
  );
}
