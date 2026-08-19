import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerOpenApi } from "./openapi.js";
import { healthBody } from "./schemas.js";

describe("openapi", () => {
  it("serves OpenAPI 3.0 and lists health", async () => {
    const app = Fastify();
    await registerOpenApi(app);
    app.get("/health", { schema: { tags: ["health"], response: { 200: healthBody } } }, async () => ({
      status: "ok",
      service: "letscharge-api",
    }));
    await app.ready();
    const spec = app.swagger();
    expect("openapi" in spec && spec.openapi).toMatch(/^3\.0/);
    expect(spec.paths?.["/health"]).toBeDefined();
    const json = await app.inject({ method: "GET", url: "/docs/json" });
    expect(json.statusCode).toBe(200);
    expect((json.json() as { openapi: string }).openapi).toMatch(/^3\.0/);
    await app.close();
  });
});
