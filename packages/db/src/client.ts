import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import { ocppMessages } from "./schema.js";

export function createDb(sql: postgres.Sql) {
  return drizzle(sql, { schema: { ocppMessages } });
}

export type LetsChargeDb = ReturnType<typeof createDb>;
