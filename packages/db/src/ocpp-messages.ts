import type { LetsChargeDb } from "./client.js";
import { isJsonObject, mapSubscriptionCallback } from "./map-callback.js";
import { ocppMessages } from "./schema.js";

export { isJsonObject, mapSubscriptionCallback };

export type AppendResult = {
  id: number | null;
  duplicate: boolean;
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

export async function appendOcppMessage(
  db: LetsChargeDb,
  raw: Record<string, unknown>,
): Promise<AppendResult> {
  const row = mapSubscriptionCallback(raw);

  try {
    const [inserted] = await db
      .insert(ocppMessages)
      .values({
        ocppStationId: row.ocppStationId,
        direction: row.direction,
        action: row.action,
        correlationId: row.correlationId,
        raw: row.raw,
        protocol: row.protocol,
      })
      .returning({ id: ocppMessages.id });

    return { id: inserted.id, duplicate: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { id: null, duplicate: true };
    }
    throw error;
  }
}
