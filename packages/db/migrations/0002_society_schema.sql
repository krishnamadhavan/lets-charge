DO $$ BEGIN
  CREATE TYPE billing_mode AS ENUM ('prepaid_wallet', 'monthly_maintenance', 'per_kwh_flat');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE slot_kind AS ENUM ('assigned', 'shared');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE resident_status AS ENUM ('active', 'invited', 'disabled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM (
    'pending_start',
    'pending_stop',
    'active',
    'orphan',
    'completed',
    'recovered',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_entry_reason AS ENUM (
    'topup_stub',
    'session_hold',
    'session_settle',
    'session_release',
    'admin_adjust'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS societies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  site_amp_cap_amps integer,
  billing_mode billing_mode NOT NULL DEFAULT 'prepaid_wallet',
  test_tariff_paise_per_kwh integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hardware_profiles (
  id text PRIMARY KEY,
  vendor text NOT NULL,
  model text NOT NULL,
  rated_kw numeric NOT NULL,
  document jsonb NOT NULL,
  revision integer NOT NULL
);

CREATE TABLE IF NOT EXISTS parking_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies (id) ON DELETE RESTRICT,
  label text NOT NULL,
  kind slot_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (society_id, label)
);

CREATE TABLE IF NOT EXISTS chargers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies (id) ON DELETE RESTRICT,
  slot_id uuid REFERENCES parking_slots (id) ON DELETE SET NULL,
  vendor text NOT NULL,
  model text NOT NULL,
  serial text NOT NULL,
  firmware text,
  ocpp_station_id text NOT NULL,
  hardware_profile_id text REFERENCES hardware_profiles (id) ON DELETE SET NULL,
  short_code text NOT NULL,
  certified boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  ws_connected boolean NOT NULL DEFAULT false,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, model, serial),
  UNIQUE (ocpp_station_id),
  UNIQUE (short_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS chargers_one_per_slot
  ON chargers (slot_id)
  WHERE slot_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charger_id uuid NOT NULL REFERENCES chargers (id) ON DELETE CASCADE,
  ocpp_connector_id integer NOT NULL,
  ocpp_evse_id integer,
  label text NOT NULL,
  UNIQUE (charger_id, ocpp_connector_id)
);

CREATE TABLE IF NOT EXISTS residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies (id) ON DELETE RESTRICT,
  flat_label text NOT NULL,
  display_name text NOT NULL,
  phone text NOT NULL,
  ocpp_id_tag text NOT NULL,
  status resident_status NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (society_id, phone),
  UNIQUE (ocpp_id_tag),
  CONSTRAINT residents_ocpp_id_tag_ci20 CHECK (ocpp_id_tag ~ '^[[:print:]]{1,20}$')
);

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id uuid NOT NULL UNIQUE REFERENCES residents (id) ON DELETE CASCADE,
  balance_paise integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies (id) ON DELETE RESTRICT,
  charger_id uuid NOT NULL REFERENCES chargers (id) ON DELETE RESTRICT,
  connector_id uuid NOT NULL REFERENCES connectors (id) ON DELETE RESTRICT,
  resident_id uuid REFERENCES residents (id) ON DELETE RESTRICT,
  ocpp_transaction_id text,
  id_tag text NOT NULL,
  status session_status NOT NULL,
  started_at timestamptz,
  stopped_at timestamptz,
  start_meter_wh bigint,
  stop_meter_wh bigint,
  energy_wh bigint,
  last_meter_wh bigint,
  last_meter_at timestamptz,
  stop_reason text,
  billable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_id_tag_ci20 CHECK (id_tag ~ '^[[:print:]]{1,20}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open_per_connector
  ON sessions (connector_id)
  WHERE status IN ('pending_start', 'pending_stop', 'active', 'orphan');

CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open_per_resident
  ON sessions (resident_id)
  WHERE resident_id IS NOT NULL
    AND status IN ('pending_start', 'pending_stop', 'active');

CREATE TABLE IF NOT EXISTS wallet_entries (
  id bigserial PRIMARY KEY,
  wallet_id uuid NOT NULL REFERENCES wallets (id) ON DELETE CASCADE,
  amount_paise integer NOT NULL,
  reason wallet_entry_reason NOT NULL,
  session_id uuid REFERENCES sessions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES sessions (id) ON DELETE RESTRICT,
  resident_id uuid NOT NULL REFERENCES residents (id) ON DELETE RESTRICT,
  energy_wh bigint NOT NULL,
  amount_paise integer NOT NULL,
  tariff_paise_per_kwh integer NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  valid boolean NOT NULL DEFAULT true
);

ALTER TABLE ocpp_messages
  DROP CONSTRAINT IF EXISTS ocpp_messages_charger_id_fkey;

ALTER TABLE ocpp_messages
  ADD CONSTRAINT ocpp_messages_charger_id_fkey
  FOREIGN KEY (charger_id) REFERENCES chargers (id) ON DELETE SET NULL;
