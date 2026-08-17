import Fastify from "fastify";

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", service: "letscharge-api" }));
app.get("/v1/health", async () => ({ status: "ok", service: "letscharge-api" }));

await app.listen({ port, host });
