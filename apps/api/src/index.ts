import Fastify from "fastify";
import postgres from "postgres";
import { createDb, migrate } from "@letscharge/db";
import { loadEnv } from "./env.js";
import { subscribeEverestStationInBackground } from "./subscribe.js";
import { registerOcppWebhook } from "./webhook.js";

const env = loadEnv();
const sql = postgres(env.databaseUrl, { onnotice() {} });
const db = createDb(sql);

await migrate(sql);

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

await app.listen({ port: env.port, host: env.host });

if (env.citrine) {
  subscribeEverestStationInBackground(env.citrine, env.webhookSecret, app.log);
}
