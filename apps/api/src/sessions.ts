import { and, eq, inArray } from "drizzle-orm";
import {
  applySessionEvent,
  chargers,
  connectors,
  newSessionSnap,
  openSessionStatuses,
  persistSession,
  residents,
  sessions,
  snapFromRow,
  societies,
  walletEntries,
  wallets,
  type LetsChargeDb,
} from "@letscharge/db";
import {
  coerceTransactionId,
  isQueued,
  remoteStartTransaction,
  remoteStopTransaction,
  type MessageClientOptions,
} from "@letscharge/citrine-client";

const startable = new Set(["Available", "Preparing"]);

export type SessionCommandError = {
  status: 404 | 409 | 502;
  error:
    | "not_found"
    | "charger_offline"
    | "connector_not_startable"
    | "session_exists"
    | "insufficient_balance"
    | "session_not_stoppable"
    | "charger_idle"
    | "session_ambiguous"
    | "citrine_unreachable"
    | "citrine_rejected";
};

export type StartInput = {
  chargerId?: string;
  shortCode?: string;
  connectorOcppId?: number;
  idTag: string;
};

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code: unknown }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}

export async function startSession(
  db: LetsChargeDb,
  citrine: MessageClientOptions,
  input: StartInput,
): Promise<{ id: string } | SessionCommandError> {
  const connectorOcppId = input.connectorOcppId ?? 1;
  const [charger] = input.chargerId
    ? await db.select().from(chargers).where(eq(chargers.id, input.chargerId)).limit(1)
    : input.shortCode
      ? await db.select().from(chargers).where(eq(chargers.shortCode, input.shortCode)).limit(1)
      : [];
  if (!charger) {
    return { status: 404, error: "not_found" };
  }
  if (!charger.wsConnected) {
    return { status: 409, error: "charger_offline" };
  }
  if (charger.lastStatus && !startable.has(charger.lastStatus)) {
    return { status: 409, error: "connector_not_startable" };
  }

  const [connector] = await db
    .select()
    .from(connectors)
    .where(
      and(eq(connectors.chargerId, charger.id), eq(connectors.ocppConnectorId, connectorOcppId)),
    )
    .limit(1);
  if (!connector) {
    return { status: 404, error: "not_found" };
  }

  const [society] = await db
    .select()
    .from(societies)
    .where(eq(societies.id, charger.societyId))
    .limit(1);
  if (!society) {
    return { status: 404, error: "not_found" };
  }

  const idTag = input.idTag;
  let residentId: string | null = null;
  if (idTag !== "ADMIN") {
    const [resident] = await db
      .select()
      .from(residents)
      .where(eq(residents.ocppIdTag, idTag))
      .limit(1);
    residentId = resident?.id ?? null;
    if (resident && resident.status !== "active") {
      return { status: 409, error: "not_found" };
    }
    if (
      resident &&
      society.billingMode === "prepaid_wallet"
    ) {
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.residentId, resident.id))
        .limit(1);
      if (!wallet || wallet.balancePaise <= 0) {
        return { status: 409, error: "insufficient_balance" };
      }
    }
  }

  const snap = newSessionSnap({ idTag, residentId });
  let created;
  try {
    [created] = await db
      .insert(sessions)
      .values({
        societyId: charger.societyId,
        chargerId: charger.id,
        connectorId: connector.id,
        residentId,
        idTag,
        status: snap.status,
        billable: false,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: 409, error: "session_exists" };
    }
    throw error;
  }

  if (residentId) {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.residentId, residentId))
      .limit(1);
    if (wallet) {
      await db.insert(walletEntries).values({
        walletId: wallet.id,
        amountPaise: 0,
        reason: "session_hold",
        sessionId: created.id,
      });
    }
  }

  try {
    const confirmations = await remoteStartTransaction(citrine, {
      identifier: charger.ocppStationId,
      idTag,
      connectorId: connectorOcppId,
    });
    if (!isQueued(confirmations)) {
      await persistSession(
        db,
        created,
        applySessionEvent(snapFromRow(created), { type: "remote_start_rejected" }),
      );
      return { status: 502, error: "citrine_rejected" };
    }
  } catch {
    await db
      .update(sessions)
      .set({ status: "failed", stopReason: "citrine_unreachable" })
      .where(eq(sessions.id, created.id));
    return { status: 502, error: "citrine_unreachable" };
  }

  return { id: created.id };
}

export async function stopSession(
  db: LetsChargeDb,
  citrine: MessageClientOptions,
  sessionId: string,
): Promise<{ id: string } | SessionCommandError> {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!row) {
    return { status: 404, error: "not_found" };
  }
  if (row.status === "pending_start" || !row.ocppTransactionId) {
    return { status: 409, error: "session_not_stoppable" };
  }
  const transactionId = coerceTransactionId(row.ocppTransactionId);
  if (transactionId === undefined) {
    return { status: 409, error: "session_not_stoppable" };
  }

  const [charger] = await db.select().from(chargers).where(eq(chargers.id, row.chargerId)).limit(1);
  if (!charger) {
    return { status: 404, error: "not_found" };
  }

  try {
    const confirmations = await remoteStopTransaction(citrine, {
      identifier: charger.ocppStationId,
      transactionId,
    });
    if (!isQueued(confirmations)) {
      return { status: 502, error: "citrine_rejected" };
    }
  } catch {
    return { status: 502, error: "citrine_unreachable" };
  }

  await persistSession(db, row, applySessionEvent(snapFromRow(row), { type: "pending_stop" }));
  return { id: row.id };
}

export async function stopOpenSessionOnCharger(
  db: LetsChargeDb,
  citrine: MessageClientOptions,
  chargerId: string,
): Promise<{ id: string } | SessionCommandError> {
  const open = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.chargerId, chargerId), inArray(sessions.status, [...openSessionStatuses])),
    );
  if (open.length === 0) {
    return { status: 409, error: "charger_idle" };
  }
  if (open.length > 1) {
    return { status: 409, error: "session_ambiguous" };
  }
  return stopSession(db, citrine, open[0]!.id);
}
