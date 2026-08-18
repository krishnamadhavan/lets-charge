import { loadHardwareProfiles } from "@letscharge/hardware";
import { upsertHardwareProfileRows, type LetsChargeDb } from "@letscharge/db";

export async function seedHardwareProfiles(db: LetsChargeDb): Promise<void> {
  const profiles = await loadHardwareProfiles();
  await upsertHardwareProfileRows(
    db,
    profiles.map((profile) => ({
      id: profile.id,
      vendor: profile.vendor,
      model: profile.model,
      ratedKw: String(profile.rated_kw),
      document: profile,
      revision: 1,
    })),
  );
}
