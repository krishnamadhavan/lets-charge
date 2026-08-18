import type { FastifyBaseLogger } from "fastify";
import { ensureStationSubscription } from "@letscharge/citrine-client";
import { callbackUrlWithSecret, type ApiEnv } from "./env.js";

const retryMs = 5_000;
const maxAttempts = 12;

export async function subscribeEverestStation(
  env: NonNullable<ApiEnv["citrine"]>,
  webhookSecret: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const url = callbackUrlWithSecret(env.webhookUrl, webhookSecret);
  const result = await ensureStationSubscription(
    {
      baseUrl: env.baseUrl,
      tenantId: env.tenantId,
      subscriptionPath: env.subscriptionPath,
    },
    { ocppConnectionName: env.stationId, url },
  );
  log.info(
    { stationId: env.stationId, created: result.created, id: result.id },
    "citrine subscription ready",
  );
}

export function subscribeEverestStationInBackground(
  env: NonNullable<ApiEnv["citrine"]>,
  webhookSecret: string,
  log: FastifyBaseLogger,
): void {
  void (async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await subscribeEverestStation(env, webhookSecret, log);
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
