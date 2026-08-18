import type { FastifyBaseLogger } from "fastify";
import { chargers, type LetsChargeDb } from "@letscharge/db";
import { type ApiEnv } from "./env.js";
import { commissionAndSubscribe, seedAuthorizations } from "./lab.js";

const retryMs = 5_000;
const maxAttempts = 12;

export async function subscribeEverestStation(
  env: NonNullable<ApiEnv["citrine"]>,
  webhookSecret: string,
  log: FastifyBaseLogger,
  db?: LetsChargeDb,
): Promise<void> {
  const stationIds = new Set<string>([env.stationId]);
  if (db) {
    const rows = await db.select({ id: chargers.ocppStationId }).from(chargers);
    for (const row of rows) {
      stationIds.add(row.id);
    }
  }
  for (const stationId of stationIds) {
    const result = await commissionAndSubscribe({ citrine: env, webhookSecret }, stationId);
    log.info({ stationId, ...result }, "citrine commission and subscription ready");
  }
  if (env.hasuraUrl && db) {
    const seeded = await seedAuthorizations({ db, citrine: env });
    log.info({ tags: seeded }, "citrine authorizations seeded");
  }
}

export function subscribeEverestStationInBackground(
  env: NonNullable<ApiEnv["citrine"]>,
  webhookSecret: string,
  log: FastifyBaseLogger,
  db?: LetsChargeDb,
): void {
  void (async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await subscribeEverestStation(env, webhookSecret, log, db);
        return;
      } catch (error) {
        log.warn(
          { err: error, attempt, stationId: env.stationId },
          "citrine subscribe failed",
        );
        if (attempt === maxAttempts) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, retryMs));
      }
    }
  })();
}
