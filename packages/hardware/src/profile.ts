export type EnergyUnit = "Wh" | "kWh";

export type HardwareProfile = {
  id: string;
  vendor: string;
  model: string;
  rated_kw: number;
  phases: number;
  connector_type: string;
  ocpp: string;
  known_firmware: string[];
  connectors: { ocpp_connector_id: number; label: string }[];
  plug_in: {
    status_notification_on_plugin: boolean | null;
    start_transaction_requires_authorize: boolean | null;
  };
  meters: {
    energy_measurand: string;
    energy_unit: EnergyUnit;
    clock_aligned_interval_sec: number | null;
    sample_interval_sec: number | null;
  };
  dialect_notes: string[];
  buy_rules: {
    custom_csms_url: string;
    ocpp_16_json: string;
    firmware_pinned: boolean;
    remote_start_stop_and_rfid_on_our_url: boolean;
  };
};

export const defaultMeters: HardwareProfile["meters"] = {
  energy_measurand: "Energy.Active.Import.Register",
  energy_unit: "Wh",
  clock_aligned_interval_sec: null,
  sample_interval_sec: null,
};

export function isHardwareProfile(value: unknown): value is HardwareProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Partial<HardwareProfile>;
  return typeof row.id === "string" && typeof row.vendor === "string" && typeof row.model === "string";
}
