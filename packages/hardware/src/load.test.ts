import { describe, expect, it } from "vitest";
import { loadHardwareProfiles, profileForVendorModel } from "./load.js";

describe("hardware profiles", () => {
  it("loads the Schneider document with plug_in unset", async () => {
    const profiles = await loadHardwareProfiles();
    const schneider = profiles.find((profile) => profile.id === "schneider-evlink-pro-ac-7.4");
    expect(schneider).toBeDefined();
    expect(schneider?.plug_in.status_notification_on_plugin).toBeNull();
    expect(schneider?.plug_in.start_transaction_requires_authorize).toBeNull();
    expect(schneider?.meters.energy_measurand).toBe("Energy.Active.Import.Register");
    expect(schneider?.meters.energy_unit).toBe("Wh");
    expect(schneider?.known_firmware).toEqual([]);
    expect(schneider?.buy_rules.remote_start_stop_and_rfid_on_our_url).toBe(false);
  });

  it("does not bind Pionix/Yeti to the Schneider file", async () => {
    const profiles = await loadHardwareProfiles();
    expect(profileForVendorModel(profiles, "Pionix", "Yeti", "0.1")).toBeUndefined();
  });
});
