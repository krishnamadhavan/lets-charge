import cookie from "@fastify/cookie";
import Fastify from "fastify";
import postgres from "postgres";
import { createDb, failTimedOutPendingStarts, migrate } from "@letscharge/db";
import { registerAdminRoutes } from "./admin.js";
import { registerAuthRoutes } from "./auth.js";
import { registerDriverRoutes } from "./driver.js";
import { loadEnv } from "./env.js";
import { registerLabRoutes } from "./lab.js";
import { registerOpenApi } from "./openapi.js";
import { seedHardwareProfiles } from "./profiles.js";
import { healthBody } from "./schemas.js";
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
      paths: ["req.query.secret", "req.url", "req.headers.cookie"],
      censor: "[redacted]",
    },
  },
});

app.addHook("onClose", async () => {
  await sql.end({ timeout: 5 });
});

await app.register(cookie, { secret: env.sessionSecret });
await registerOpenApi(app);

app.get(
  "/health",
  { schema: { tags: ["health"], response: { 200: healthBody } } },
  async () => ({ status: "ok", service: "letscharge-api" }),
);
app.get(
  "/v1/health",
  { schema: { tags: ["health"], response: { 200: healthBody } } },
  async () => ({ status: "ok", service: "letscharge-api" }),
);

registerAuthRoutes(app, {
  db,
  otpStub: env.otpStub,
  nodeEnv: env.nodeEnv,
  adminLogin: env.adminLogin,
  adminPassword: env.adminPassword,
});
const citrineMessages = env.citrine
  ? {
      baseUrl: env.citrine.baseUrl,
      tenantId: env.citrine.tenantId,
      remoteStartPath: env.citrine.remoteStartPath,
      remoteStopPath: env.citrine.remoteStopPath,
    }
  : undefined;
registerAdminRoutes(app, { db, citrine: citrineMessages });
registerDriverRoutes(app, { db, citrine: citrineMessages });
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
