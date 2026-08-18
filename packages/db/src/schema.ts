import { sql } from "drizzle-orm";
import {
  bigserial,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ocppDirection = pgEnum("ocpp_direction", ["inbound", "outbound"]);

export const ocppMessages = pgTable(
  "ocpp_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chargerId: uuid("charger_id"),
    ocppStationId: text("ocpp_station_id").notNull(),
    direction: ocppDirection("direction").notNull(),
    action: text("action").notNull(),
    correlationId: text("correlation_id"),
    raw: jsonb("raw").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    protocol: text("protocol").notNull(),
  },
  (table) => [
    uniqueIndex("ocpp_messages_idempotency")
      .on(table.ocppStationId, table.correlationId, table.action, table.direction)
      .where(sql`${table.correlationId} is not null`),
  ],
);
