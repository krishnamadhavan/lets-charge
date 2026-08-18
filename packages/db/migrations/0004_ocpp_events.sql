CREATE TABLE IF NOT EXISTS ocpp_events (
  id bigserial PRIMARY KEY,
  message_id bigint NOT NULL UNIQUE REFERENCES ocpp_messages (id) ON DELETE CASCADE,
  charger_id uuid REFERENCES chargers (id) ON DELETE SET NULL,
  hardware_profile_id text REFERENCES hardware_profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  connector_ocpp_id integer,
  ocpp_transaction_id text,
  occurred_at timestamptz,
  fields jsonb NOT NULL
);
