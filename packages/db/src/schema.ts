import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ocppDirection = pgEnum("ocpp_direction", ["inbound", "outbound"]);
export const billingMode = pgEnum("billing_mode", [
  "prepaid_wallet",
  "monthly_maintenance",
  "per_kwh_flat",
]);
export const slotKind = pgEnum("slot_kind", ["assigned", "shared"]);
export const residentStatus = pgEnum("resident_status", ["active", "invited", "disabled"]);
export const sessionStatus = pgEnum("session_status", [
  "pending_start",
  "pending_stop",
  "active",
  "orphan",
  "completed",
  "recovered",
  "failed",
]);
export const walletEntryReason = pgEnum("wallet_entry_reason", [
  "topup_stub",
  "session_hold",
  "session_settle",
  "session_release",
  "admin_adjust",
]);

export const societies = pgTable("societies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  siteAmpCapAmps: integer("site_amp_cap_amps"),
  billingMode: billingMode("billing_mode").notNull().default("prepaid_wallet"),
  testTariffPaisePerKwh: integer("test_tariff_paise_per_kwh").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hardwareProfiles = pgTable("hardware_profiles", {
  id: text("id").primaryKey(),
  vendor: text("vendor").notNull(),
  model: text("model").notNull(),
  ratedKw: numeric("rated_kw").notNull(),
  document: jsonb("document").notNull(),
  revision: integer("revision").notNull(),
});

export const parkingSlots = pgTable(
  "parking_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id),
    label: text("label").notNull(),
    kind: slotKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("parking_slots_society_id_label_key").on(table.societyId, table.label)],
);

export const chargers = pgTable(
  "chargers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id),
    slotId: uuid("slot_id").references(() => parkingSlots.id),
    vendor: text("vendor").notNull(),
    model: text("model").notNull(),
    serial: text("serial").notNull(),
    firmware: text("firmware"),
    ocppStationId: text("ocpp_station_id").notNull(),
    hardwareProfileId: text("hardware_profile_id").references(() => hardwareProfiles.id),
    shortCode: text("short_code").notNull(),
    certified: boolean("certified").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    wsConnected: boolean("ws_connected").notNull().default(false),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("chargers_vendor_model_serial_key").on(table.vendor, table.model, table.serial),
    unique("chargers_ocpp_station_id_key").on(table.ocppStationId),
    unique("chargers_short_code_key").on(table.shortCode),
    uniqueIndex("chargers_one_per_slot").on(table.slotId).where(sql`${table.slotId} is not null`),
  ],
);

export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chargerId: uuid("charger_id")
      .notNull()
      .references(() => chargers.id),
    ocppConnectorId: integer("ocpp_connector_id").notNull(),
    ocppEvseId: integer("ocpp_evse_id"),
    label: text("label").notNull(),
  },
  (table) => [
    unique("connectors_charger_id_ocpp_connector_id_key").on(table.chargerId, table.ocppConnectorId),
  ],
);

export const residents = pgTable(
  "residents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id),
    flatLabel: text("flat_label").notNull(),
    displayName: text("display_name").notNull(),
    phone: text("phone").notNull(),
    ocppIdTag: text("ocpp_id_tag").notNull(),
    status: residentStatus("status").notNull().default("invited"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("residents_society_id_phone_key").on(table.societyId, table.phone),
    unique("residents_ocpp_id_tag_key").on(table.ocppIdTag),
    check("residents_ocpp_id_tag_ci20", sql`${table.ocppIdTag} ~ '^[[:print:]]{1,20}$'`),
  ],
);

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  login: text("login").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey().defaultRandom(),
  residentId: uuid("resident_id")
    .notNull()
    .unique()
    .references(() => residents.id),
  balancePaise: integer("balance_paise").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    societyId: uuid("society_id")
      .notNull()
      .references(() => societies.id),
    chargerId: uuid("charger_id")
      .notNull()
      .references(() => chargers.id),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => connectors.id),
    residentId: uuid("resident_id").references(() => residents.id),
    ocppTransactionId: text("ocpp_transaction_id"),
    idTag: text("id_tag").notNull(),
    status: sessionStatus("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    startMeterWh: bigint("start_meter_wh", { mode: "number" }),
    stopMeterWh: bigint("stop_meter_wh", { mode: "number" }),
    energyWh: bigint("energy_wh", { mode: "number" }),
    lastMeterWh: bigint("last_meter_wh", { mode: "number" }),
    lastMeterAt: timestamp("last_meter_at", { withTimezone: true }),
    stopReason: text("stop_reason"),
    billable: boolean("billable").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("sessions_id_tag_ci20", sql`${table.idTag} ~ '^[[:print:]]{1,20}$'`),
    uniqueIndex("sessions_one_open_per_connector")
      .on(table.connectorId)
      .where(sql`${table.status} in ('pending_start', 'pending_stop', 'active', 'orphan')`),
    uniqueIndex("sessions_one_open_per_resident")
      .on(table.residentId)
      .where(
        sql`${table.residentId} is not null and ${table.status} in ('pending_start', 'pending_stop', 'active')`,
      ),
  ],
);

export const walletEntries = pgTable("wallet_entries", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  walletId: uuid("wallet_id")
    .notNull()
    .references(() => wallets.id),
  amountPaise: integer("amount_paise").notNull(),
  reason: walletEntryReason("reason").notNull(),
  sessionId: uuid("session_id").references(() => sessions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .unique()
    .references(() => sessions.id),
  residentId: uuid("resident_id")
    .notNull()
    .references(() => residents.id),
  energyWh: bigint("energy_wh", { mode: "number" }).notNull(),
  amountPaise: integer("amount_paise").notNull(),
  tariffPaisePerKwh: integer("tariff_paise_per_kwh").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  valid: boolean("valid").notNull().default(true),
});

export const ocppMessages = pgTable(
  "ocpp_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chargerId: uuid("charger_id").references(() => chargers.id),
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

export const ocppEvents = pgTable("ocpp_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  messageId: bigint("message_id", { mode: "number" })
    .notNull()
    .unique()
    .references(() => ocppMessages.id),
  chargerId: uuid("charger_id").references(() => chargers.id),
  hardwareProfileId: text("hardware_profile_id").references(() => hardwareProfiles.id),
  action: text("action").notNull(),
  connectorOcppId: integer("connector_ocpp_id"),
  ocppTransactionId: text("ocpp_transaction_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  fields: jsonb("fields").notNull(),
});
