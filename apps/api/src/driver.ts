import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  amountPaise,
  chargers,
  connectors,
  liveEnergyWh,
  openSessionStatuses,
  parkingSlots,
  receipts,
  residents,
  sessions,
  societies,
  type LetsChargeDb,
} from "@letscharge/db";
import type { MessageClientOptions } from "@letscharge/citrine-client";
import { readSignedCookie, residentCookie } from "./cookies.js";
import { errorBody, idParams } from "./schemas.js";
import { startSession, stopSession } from "./sessions.js";

async function requireResident(
  db: LetsChargeDb,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const id = readSignedCookie(request, residentCookie);
  if (!id) {
    void reply.code(401).send({ error: "unauthenticated" });
    return undefined;
  }
  const [resident] = await db.select().from(residents).where(eq(residents.id, id)).limit(1);
  if (!resident) {
    void reply.code(401).send({ error: "unauthenticated" });
    return undefined;
  }
  if (resident.status === "disabled") {
    void reply.code(403).send({ error: "forbidden" });
    return undefined;
  }
  return resident;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function energyKwh(wh: number | null): number | null {
  return wh === null ? null : Math.round(wh) / 1000;
}

export function registerDriverRoutes(
  app: FastifyInstance,
  opts: { db: LetsChargeDb; citrine: MessageClientOptions | undefined },
): void {
  app.get<{ Querystring: { code?: string; slot?: string } }>(
    "/v1/chargers/lookup",
    {
      schema: {
        tags: ["driver"],
        security: [{ residentCookie: [] }],
        querystring: {
          type: "object",
          properties: { code: { type: "string" }, slot: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const resident = await requireResident(opts.db, request, reply);
      if (!resident) {
        return;
      }
      const code = request.query.code?.trim();
      const slot = request.query.slot?.trim();
      if (!code && !slot) {
        return reply.code(400).send({ error: "charger_not_found" });
      }

      const [row] = await opts.db
        .select({
          charger: chargers,
          slotLabel: parkingSlots.label,
          connectorId: connectors.ocppConnectorId,
          connectorLabel: connectors.label,
        })
        .from(chargers)
        .leftJoin(parkingSlots, eq(chargers.slotId, parkingSlots.id))
        .leftJoin(connectors, eq(connectors.chargerId, chargers.id))
        .where(code ? eq(chargers.shortCode, code) : eq(parkingSlots.label, slot ?? ""))
        .limit(1);
      if (!row) {
        return reply.code(404).send({ error: "charger_not_found" });
      }

      const open = await opts.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.chargerId, row.charger.id),
            eq(sessions.residentId, resident.id),
            inArray(sessions.status, [...openSessionStatuses]),
          ),
        )
        .limit(1);

      return {
        charger_id: row.charger.id,
        short_code: row.charger.shortCode,
        slot_label: row.slotLabel,
        vendor: row.charger.vendor,
        model: row.charger.model,
        connector: {
          ocpp_connector_id: row.connectorId ?? 1,
          label: row.connectorLabel ?? "1",
        },
        online: row.charger.wsConnected,
        status: row.charger.lastStatus,
        occupied_by_me: open.length > 0,
      };
    },
  );

  app.post(
    "/v1/sessions",
    {
      schema: {
        tags: ["driver"],
        security: [{ residentCookie: [] }],
        body: {
          type: "object",
          required: ["charger_id"],
          properties: {
            charger_id: { type: "string" },
            connector_ocpp_id: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const resident = await requireResident(opts.db, request, reply);
      if (!resident) {
        return;
      }
      if (!opts.citrine) {
        return reply.code(502).send({ error: "citrine_unreachable" });
      }
      const body = isRecord(request.body) ? request.body : {};
      const chargerId = typeof body.charger_id === "string" ? body.charger_id : "";
      const result = await startSession(opts.db, opts.citrine, {
        chargerId,
        connectorOcppId: typeof body.connector_ocpp_id === "number" ? body.connector_ocpp_id : 1,
        idTag: resident.ocppIdTag,
      });
      if ("error" in result) {
        return reply.code(result.status).send({ error: result.error });
      }
      return reply.code(201).send({ id: result.id });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/v1/sessions/:id/stop",
    {
      schema: {
        tags: ["driver"],
        security: [{ residentCookie: [] }],
        params: idParams,
      },
    },
    async (request, reply) => {
      const resident = await requireResident(opts.db, request, reply);
      if (!resident) {
        return;
      }
      if (!opts.citrine) {
        return reply.code(502).send({ error: "citrine_unreachable" });
      }
      const [row] = await opts.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, request.params.id))
        .limit(1);
      if (!row || row.residentId !== resident.id) {
        return reply.code(404).send({ error: "session_not_found" });
      }
      const result = await stopSession(opts.db, opts.citrine, row.id);
      if ("error" in result) {
        return reply.code(result.status).send({ error: result.error });
      }
      return { id: result.id };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/sessions/:id",
    {
      schema: {
        tags: ["driver"],
        security: [{ residentCookie: [] }],
        params: idParams,
      },
    },
    async (request, reply) => {
      const resident = await requireResident(opts.db, request, reply);
      if (!resident) {
        return;
      }
      const [row] = await opts.db
        .select({
          session: sessions,
          shortCode: chargers.shortCode,
          tariff: societies.testTariffPaisePerKwh,
        })
        .from(sessions)
        .innerJoin(chargers, eq(sessions.chargerId, chargers.id))
        .innerJoin(societies, eq(sessions.societyId, societies.id))
        .where(eq(sessions.id, request.params.id))
        .limit(1);
      if (!row || row.session.residentId !== resident.id) {
        return reply.code(404).send({ error: "session_not_found" });
      }
      const live = !["completed", "recovered", "failed"].includes(row.session.status);
      const wh = live
        ? liveEnergyWh(row.session.startMeterWh, row.session.lastMeterWh)
        : row.session.energyWh;
      const kwh = energyKwh(wh);
      const previewPaise = wh === null ? null : amountPaise(wh, row.tariff);
      return {
        id: row.session.id,
        status: row.session.status,
        charger_short_code: row.shortCode,
        started_at: row.session.startedAt?.toISOString() ?? null,
        stopped_at: row.session.stoppedAt?.toISOString() ?? null,
        energy_kwh: kwh,
        live,
        last_meter_at: row.session.lastMeterAt?.toISOString() ?? null,
        billable: row.session.billable,
        receipt_preview: {
          energy_kwh: kwh,
          amount_paise: previewPaise,
          valid: false,
        },
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/sessions/:id/receipt",
    {
      schema: {
        tags: ["driver"],
        security: [{ residentCookie: [] }],
        params: idParams,
      },
    },
    async (request, reply) => {
      const resident = await requireResident(opts.db, request, reply);
      if (!resident) {
        return;
      }
      const [row] = await opts.db
        .select({
          session: sessions,
          charger: chargers,
          society: societies,
          owner: residents,
          receipt: receipts,
          slotLabel: parkingSlots.label,
        })
        .from(sessions)
        .innerJoin(chargers, eq(sessions.chargerId, chargers.id))
        .innerJoin(societies, eq(sessions.societyId, societies.id))
        .innerJoin(residents, eq(sessions.residentId, residents.id))
        .leftJoin(receipts, eq(receipts.sessionId, sessions.id))
        .leftJoin(parkingSlots, eq(chargers.slotId, parkingSlots.id))
        .where(eq(sessions.id, request.params.id))
        .limit(1);
      if (!row || row.session.residentId !== resident.id) {
        return reply.code(404).send({ error: "session_not_found" });
      }
      if (!row.session.billable || !row.receipt) {
        const reason = !row.session.stoppedAt
          ? "session_open"
          : row.session.stopReason?.includes("meter_reset")
            ? "meter_reset"
            : row.session.idTag === "ADMIN"
              ? "admin_session"
              : row.session.residentId === null
                ? "unmatched_rfid"
                : "missing_stop";
        return reply.code(409).send({ valid: false, reason });
      }
      return {
        valid: true,
        receipt_id: row.receipt.id,
        session_id: row.session.id,
        society_name: row.society.name,
        flat_label: row.owner.flatLabel,
        charger: {
          vendor: row.charger.vendor,
          model: row.charger.model,
          serial: row.charger.serial,
          short_code: row.charger.shortCode,
          slot: row.slotLabel,
        },
        started_at: row.session.startedAt?.toISOString() ?? null,
        stopped_at: row.session.stoppedAt?.toISOString() ?? null,
        energy_kwh: energyKwh(row.receipt.energyWh),
        amount_paise: row.receipt.amountPaise,
        tariff_paise_per_kwh: row.receipt.tariffPaisePerKwh,
        billing_mode: row.society.billingMode,
        notice: "Test receipt — not a tax invoice. No GST. No UPI.",
      };
    },
  );
}
