import { describe, expect, it } from "vitest";
import { loadHardwareProfiles, profileForVendorModel } from "./load.js";

async function skuPair() {
  const profiles = await loadHardwareProfiles();
  const schneider = profiles.find((profile) => profile.id === "schneider-evlink-pro-ac-7.4");
  const exicom = profiles.find((profile) => profile.id === "exicom-spin-air-7.4");
  return { profiles, schneider, exicom };
}

describe("hardware profiles", () => {
  it("loads the Schneider document with plug_in unset", async () => {
    const { schneider } = await skuPair();
    expect(schneider).toBeDefined();
    expect(schneider?.plug_in.status_notification_on_plugin).toBeNull();
    expect(schneider?.plug_in.start_transaction_requires_authorize).toBeNull();
    expect(schneider?.meters.energy_measurand).toBe("Energy.Active.Import.Register");
    expect(schneider?.meters.energy_unit).toBe("Wh");
    expect(schneider?.known_firmware).toEqual([]);
    expect(schneider?.buy_rules.remote_start_stop_and_rfid_on_our_url).toBe(false);
  });

  it("loads the Exicom document with the same unset plug_in and default meters", async () => {
    const { exicom } = await skuPair();
    expect(exicom).toBeDefined();
    expect(exicom?.vendor).toBe("Exicom");
    expect(exicom?.model).toBe("Spin Air");
    expect(exicom?.plug_in).toEqual({
      status_notification_on_plugin: null,
      start_transaction_requires_authorize: null,
    });
    expect(exicom?.meters).toEqual({
      energy_measurand: "Energy.Active.Import.Register",
      energy_unit: "Wh",
      clock_aligned_interval_sec: null,
      sample_interval_sec: null,
    });
    expect(exicom?.buy_rules.custom_csms_url).toBe("unknown");
    expect(exicom?.buy_rules.remote_start_stop_and_rfid_on_our_url).toBe(false);
    expect(exicom?.dialect_notes.length).toBeGreaterThan(0);
  });

  it("keeps the dialect diff in the two documents, not in engine branches", async () => {
    const { schneider, exicom } = await skuPair();
    expect(schneider && exicom).toBeTruthy();
    expect(schneider?.id).not.toBe(exicom?.id);
    expect(schneider?.vendor).not.toBe(exicom?.vendor);
    expect(schneider?.model).not.toBe(exicom?.model);
    expect(schneider?.plug_in).toEqual(exicom?.plug_in);
    expect(schneider?.meters).toEqual(exicom?.meters);
    expect(schneider?.ocpp).toBe(exicom?.ocpp);
  });

  it("resolves each SKU by vendor and model and ignores EVerest", async () => {
    const { profiles } = await skuPair();
    expect(profileForVendorModel(profiles, "Schneider Electric", "EVlink Pro AC", null)?.id).toBe(
      "schneider-evlink-pro-ac-7.4",
    );
    expect(profileForVendorModel(profiles, "Exicom", "Spin Air", null)?.id).toBe(
      "exicom-spin-air-7.4",
    );
    expect(profileForVendorModel(profiles, "Pionix", "Yeti", "0.1")).toBeUndefined();
  });
});
