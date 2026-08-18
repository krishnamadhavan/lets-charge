DO $$ BEGIN
  CREATE TYPE ocpp_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ocpp_messages (
  id bigserial PRIMARY KEY,
  charger_id uuid,
  ocpp_station_id text NOT NULL,
  direction ocpp_direction NOT NULL,
  action text NOT NULL,
  correlation_id text,
  raw jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  protocol text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ocpp_messages_idempotency
  ON ocpp_messages (ocpp_station_id, correlation_id, action, direction)
  WHERE correlation_id IS NOT NULL;
