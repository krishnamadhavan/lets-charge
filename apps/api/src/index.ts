import Fastify from "fastify";
import postgres from "postgres";
import { createDb, failTimedOutPendingStarts, migrate } from "@letscharge/db";
import { loadEnv } from "./env.js";
import { registerLabRoutes } from "./lab.js";
import { seedHardwareProfiles } from "./profiles.js";
import { subscribeEverestStationInBackground } from "./subscribe.js";
import { registerOcppWebhook } from "./webhook.js";

const env = loadEnv();
const sql = postgres(env.databaseUrl, { onnotice() {} });
const db = createDb(sql);

await migrate(sql);
await seedHardwareProfiles(db);

const app = Fastify({
  logger: {
    redact: {
      paths: ["req.query.secret", "req.url"],
      censor: "[redacted]",
    },
  },
});

app.addHook("onClose", async () => {
  await sql.end({ timeout: 5 });
});

app.get("/health", async () => ({ status: "ok", service: "letscharge-api" }));
app.get("/v1/health", async () => ({ status: "ok", service: "letscharge-api" }));

registerOcppWebhook(app, { db, webhookSecret: env.webhookSecret });
if (env.citrine) {
  registerLabRoutes(app, { db, webhookSecret: env.webhookSecret, citrine: env.citrine });
}

await app.listen({ port: env.port, host: env.host });

if (env.citrine) {
  subscribeEverestStationInBackground(env.citrine, env.webhookSecret, app.log, db);
}

const timeoutTimer = setInterval(() => {
  void failTimedOutPendingStarts(db).catch((error: unknown) => {
    app.log.error({ err: error }, "pending_start timeout sweep failed");
  });
}, 15_000);
timeoutTimer.unref();
