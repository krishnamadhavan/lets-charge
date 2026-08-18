import { randomBytes } from "node:crypto";

/** Crockford base32 without I, L, O, U. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** OCPP 1.6 idTag: `LC` + 10 Crockford chars (12 total, fits CiString20). */
export function generateOcppIdTag(
  bytes: Uint8Array = randomBytes(10),
): string {
  if (bytes.length < 10) {
    throw new Error("ocpp id tag needs 10 random bytes");
  }
  let tag = "LC";
  for (let i = 0; i < 10; i += 1) {
    tag += CROCKFORD[bytes[i]! & 31];
  }
  return tag;
}
