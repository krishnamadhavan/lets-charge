import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { isHardwareProfile, type HardwareProfile } from "./profile.js";

const profilesDir = join(dirname(fileURLToPath(import.meta.url)), "../profiles");

export async function loadHardwareProfiles(
  dir: string = profilesDir,
): Promise<HardwareProfile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".yaml")).sort();
  const profiles: HardwareProfile[] = [];
  for (const name of names) {
    const parsed: unknown = parse(await readFile(join(dir, name), "utf8"));
    if (!isHardwareProfile(parsed)) {
      throw new Error(`invalid hardware profile: ${name}`);
    }
    profiles.push(parsed);
  }
  return profiles;
}

export function profileForVendorModel(
  profiles: HardwareProfile[],
  vendor: string,
  model: string,
  firmware: string | null,
): HardwareProfile | undefined {
  const matches = profiles.filter(
    (profile) =>
      profile.vendor.toLowerCase() === vendor.toLowerCase() &&
      profile.model.toLowerCase() === model.toLowerCase(),
  );
  if (matches.length === 0) {
    return undefined;
  }
  if (firmware && matches.some((profile) => profile.known_firmware.length > 0)) {
    const pinned = matches.find((profile) => profile.known_firmware.includes(firmware));
    if (pinned) {
      return pinned;
    }
  }
  return matches[0];
}
