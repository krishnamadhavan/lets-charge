import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "lets-charge API",
        description: "Our layer: resident/admin HTTP, lab commands, CitrineOS webhook.",
        version: "0.1.0",
      },
      tags: [
        { name: "health", description: "Liveness" },
        { name: "auth", description: "Resident OTP stub and admin login" },
        { name: "admin", description: "Society operator CMS" },
        { name: "driver", description: "Resident charge flow" },
        { name: "internal", description: "CitrineOS webhook and lab commands" },
      ],
      components: {
        securitySchemes: {
          residentCookie: { type: "apiKey", in: "cookie", name: "lc_resident" },
          adminCookie: { type: "apiKey", in: "cookie", name: "lc_admin" },
          querySecret: { type: "apiKey", in: "query", name: "secret" },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });
}
