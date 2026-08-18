import { describe, expect, it } from "vitest";
import { generateOcppIdTag } from "./ocpp-id-tag.js";

describe("generateOcppIdTag", () => {
  it("is LC plus 10 Crockford characters", () => {
    const tag = generateOcppIdTag();
    expect(tag).toMatch(/^LC[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(tag).toHaveLength(12);
  });

  it("is deterministic for a given byte string", () => {
    const bytes = Uint8Array.from({ length: 10 }, (_, i) => i);
    expect(generateOcppIdTag(bytes)).toBe("LC0123456789");
  });
});
