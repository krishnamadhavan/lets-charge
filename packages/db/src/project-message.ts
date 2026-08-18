import { and, eq, inArray, lt } from "drizzle-orm";
import { amountPaise } from "./energy.js";
import {
  normalizedFields,
  occurredAt,
  parseOcppMessage,
  sessionEventFromFrame,
} from "./ocpp-frame.js";
import {
  applySessionEvent,
  newSessionSnap,
  openSessionStatuses,
  type SessionSnap,
  type SessionStatus,
} from "./session-machine.js";
import type { LetsChargeDb } from "./client.js";
import {
  chargers,
  connectors,
  hardwareProfiles,
  ocppEvents,
  ocppMessages,
  receipts,
  residents,
  sessions,
  societies,
  walletEntries,
  wallets,
} from "./schema.js";

const defaultMeasurand = "Energy.Active.Import.Register";
const defaultUnit = "Wh";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapFromRow(row: typeof sessions.$inferSelect): SessionSnap {
  return {
    status: row.status,
    residentId: row.residentId,
    idTag: row.idTag,
    ocppTransactionId: row.ocppTransactionId,
    startedAt: row.startedAt?.toISOString() ?? null,
    stoppedAt: row.stoppedAt?.toISOString() ?? null,
    startMeterWh: row.startMeterWh,
    stopMeterWh: row.stopMeterWh,
    energyWh: row.energyWh,
    lastMeterWh: row.lastMeterWh,
    lastMeterAt: row.lastMeterAt?.toISOString() ?? null,
    stopReason: row.stopReason,
    billable: row.billable,
  };
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

export async function projectOcppMessage(db: LetsChargeDb, messageId: number): Promise<void> {
  const [message] = await db
    .select()
    .from(ocppMessages)
    .where(eq(ocppMessages.id, messageId))
    .limit(1);
  if (!message) {
    return;
  }

  const raw = isRecord(message.raw) ? message.raw : {};
  const [charger] = await db
    .select()
    .from(chargers)
    .where(eq(chargers.ocppStationId, message.ocppStationId))
    .limit(1);

  if (charger && message.chargerId !== charger.id) {
    await db
      .update(ocppMessages)
      .set({ chargerId: charger.id })
      .where(eq(ocppMessages.id, message.id));
  }

  let measurand = defaultMeasurand;
  let energyUnit = defaultUnit;
  let profileId = charger?.hardwareProfileId ?? null;
  if (profileId) {
    const [profile] = await db
      .select()
      .from(hardwareProfiles)
      .where(eq(hardwareProfiles.id, profileId))
      .limit(1);
    const document = isRecord(profile?.document) ? profile.document : {};
    const meters = isRecord(document.meters) ? document.meters : {};
    if (typeof meters.energy_measurand === "string") {
      measurand = meters.energy_measurand;
    }
    if (typeof meters.energy_unit === "string") {
      energyUnit = meters.energy_unit;
    }
  }

  const eventName = typeof raw.event === "string" ? raw.event : undefined;
  const frame = parseOcppMessage(raw.message);
  const action = message.action;
  const receivedAt = message.receivedAt;
  const fields = normalizedFields({
    action,
    event: eventName,
    frame,
    measurand,
    energyUnit,
  });
  const payload = isRecord(frame?.payload) ? frame.payload : {};
  const connectorOcppId =
    typeof payload.connectorId === "number" ? payload.connectorId : null;
  const mapped = sessionEventFromFrame({
    action,
    direction: message.direction,
    event: eventName,
    frame,
    measurand,
    energyUnit,
    receivedAt,
  });

  await db
    .insert(ocppEvents)
    .values({
      messageId: message.id,
      chargerId: charger?.id ?? null,
      hardwareProfileId: profileId,
      action,
      connectorOcppId: mapped?.connectorId ?? connectorOcppId,
      ocppTransactionId: mapped?.transactionId ?? null,
      occurredAt: occurredAt(payload, receivedAt),
      fields,
    })
    .onConflictDoNothing({ target: ocppEvents.messageId });

  if (!charger) {
    return;
  }

  await touchCharger(db, charger.id, {
    raw,
    action,
    payload,
    receivedAt,
    eventName,
  });

  if (!mapped) {
    return;
  }

  const sessionRow = await findOrCreateSession(db, {
    charger,
    connectorOcppId: mapped.connectorId ?? 1,
    transactionId: mapped.transactionId,
    sessionEvent: mapped.sessionEvent,
  });
  if (!sessionRow) {
    return;
  }

  let next = applySessionEvent(snapFromRow(sessionRow), mapped.sessionEvent);
  if (mapped.transactionId && !next.ocppTransactionId) {
    next = { ...next, ocppTransactionId: mapped.transactionId };
  }
  await persistSession(db, sessionRow, next);
}

async function touchCharger(
  db: LetsChargeDb,
  chargerId: string,
  input: {
    raw: Record<string, unknown>;
    action: string;
    payload: Record<string, unknown>;
    receivedAt: Date;
    eventName: string | undefined;
  },
): Promise<void> {
  const patch: Partial<typeof chargers.$inferInsert> = {
    lastSeenAt: input.receivedAt,
  };

  if (input.eventName === "connected") {
    patch.wsConnected = true;
  }
  if (input.eventName === "closed") {
    patch.wsConnected = false;
  }
  if (input.action === "StatusNotification") {
    if (typeof input.payload.status === "string") {
      patch.lastStatus = input.payload.status;
    }
    const errorCode = input.payload.errorCode;
    patch.lastError =
      typeof errorCode === "string" && errorCode !== "NoError" ? errorCode : null;
  }
  if (input.action === "BootNotification" && typeof input.payload.firmwareVersion === "string") {
    patch.firmware = input.payload.firmwareVersion;
  }

  await db.update(chargers).set(patch).where(eq(chargers.id, chargerId));
}

async function findOrCreateSession(
  db: LetsChargeDb,
  input: {
    charger: typeof chargers.$inferSelect;
    connectorOcppId: number;
    transactionId: string | null;
    sessionEvent: { type: string; idTag?: string };
  },
): Promise<typeof sessions.$inferSelect | undefined> {
  if (input.transactionId) {
    const [byTx] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.chargerId, input.charger.id),
          eq(sessions.ocppTransactionId, input.transactionId),
        ),
      )
      .limit(1);
    if (byTx) {
      return byTx;
    }
  }

  const [connector] = await db
    .select()
    .from(connectors)
    .where(
      and(
        eq(connectors.chargerId, input.charger.id),
        eq(connectors.ocppConnectorId, input.connectorOcppId),
      ),
    )
    .limit(1);
  if (!connector) {
    return undefined;
  }

  const [open] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.connectorId, connector.id),
        inArray(sessions.status, [...openSessionStatuses]),
      ),
    )
    .limit(1);
  if (open) {
    return open;
  }

  if (input.sessionEvent.type !== "start_accepted") {
    return undefined;
  }

  const idTag = input.sessionEvent.idTag ?? "";
  let residentId: string | null = null;
  if (idTag && idTag !== "ADMIN") {
    const [resident] = await db
      .select()
      .from(residents)
      .where(eq(residents.ocppIdTag, idTag))
      .limit(1);
    residentId = resident?.id ?? null;
  }

  const snap = newSessionSnap({ idTag: idTag || "unknown", residentId });
  try {
    const [created] = await db
      .insert(sessions)
      .values({
        societyId: input.charger.societyId,
        chargerId: input.charger.id,
        connectorId: connector.id,
        residentId: snap.residentId,
        idTag: snap.idTag,
        status: snap.status,
        billable: false,
      })
      .returning();
    return created;
  } catch {
    const [retry] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.connectorId, connector.id),
          inArray(sessions.status, [...openSessionStatuses]),
        ),
      )
      .limit(1);
    return retry;
  }
}

async function persistSession(
  db: LetsChargeDb,
  previous: typeof sessions.$inferSelect,
  next: SessionSnap,
): Promise<void> {
  await db
    .update(sessions)
    .set({
      status: next.status as SessionStatus,
      residentId: next.residentId,
      idTag: next.idTag,
      ocppTransactionId: next.ocppTransactionId,
      startedAt: toDate(next.startedAt),
      stoppedAt: toDate(next.stoppedAt),
      startMeterWh: next.startMeterWh,
      stopMeterWh: next.stopMeterWh,
      energyWh: next.energyWh,
      lastMeterWh: next.lastMeterWh,
      lastMeterAt: toDate(next.lastMeterAt),
      stopReason: next.stopReason,
      billable: next.billable,
    })
    .where(eq(sessions.id, previous.id));

  if (!previous.billable && next.billable && next.residentId && next.energyWh !== null) {
    await settleBillable(db, previous, next);
  }
}

async function settleBillable(
  db: LetsChargeDb,
  previous: typeof sessions.$inferSelect,
  next: SessionSnap,
): Promise<void> {
  const [society] = await db
    .select()
    .from(societies)
    .where(eq(societies.id, previous.societyId))
    .limit(1);
  if (!society || !next.residentId || next.energyWh === null) {
    return;
  }

  const paise = amountPaise(next.energyWh, society.testTariffPaisePerKwh);
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.residentId, next.residentId))
    .limit(1);
  if (!wallet) {
    return;
  }

  const [receipt] = await db
    .insert(receipts)
    .values({
      sessionId: previous.id,
      residentId: next.residentId,
      energyWh: next.energyWh,
      amountPaise: paise,
      tariffPaisePerKwh: society.testTariffPaisePerKwh,
      valid: true,
    })
    .onConflictDoNothing({ target: receipts.sessionId })
    .returning({ id: receipts.id });
  if (!receipt) {
    return;
  }
  await db.insert(walletEntries).values({
    walletId: wallet.id,
    amountPaise: -paise,
    reason: "session_settle",
    sessionId: previous.id,
  });
  await db
    .update(wallets)
    .set({ balancePaise: wallet.balancePaise - paise })
    .where(eq(wallets.id, wallet.id));
}

export async function failTimedOutPendingStarts(
  db: LetsChargeDb,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - 60_000);
  const stale = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.status, "pending_start"), lt(sessions.createdAt, cutoff)));

  for (const row of stale) {
    const next = applySessionEvent(snapFromRow(row), { type: "timeout" });
    await persistSession(db, row, next);
  }
  return stale.length;
}

export async function upsertHardwareProfileRows(
  db: LetsChargeDb,
  rows: {
    id: string;
    vendor: string;
    model: string;
    ratedKw: string;
    document: unknown;
    revision: number;
  }[],
): Promise<void> {
  for (const row of rows) {
    await db
      .insert(hardwareProfiles)
      .values(row)
      .onConflictDoUpdate({
        target: hardwareProfiles.id,
        set: {
          vendor: row.vendor,
          model: row.model,
          ratedKw: row.ratedKw,
          document: row.document,
        },
      });
  }
}


