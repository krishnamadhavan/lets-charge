export const errorBody = {
  type: "object",
  properties: { error: { type: "string" } },
  required: ["error"],
} as const;

export const okBody = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
} as const;

export const secretQuery = {
  type: "object",
  properties: { secret: { type: "string" } },
  required: ["secret"],
} as const;

export const idParams = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

export const healthBody = {
  type: "object",
  properties: {
    status: { type: "string" },
    service: { type: "string" },
  },
  required: ["status", "service"],
} as const;
