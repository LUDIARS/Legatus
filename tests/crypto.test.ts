import { describe, it, expect } from "vitest";
import { generateMasterKey, seal, open } from "../src/backend/db/crypto.js";

describe("crypto AES-256-GCM", () => {
  it("seals and opens roundtrip", () => {
    const key = generateMasterKey();
    const sealed = seal("hello-世界", key);
    expect(sealed.iv.length).toBe(12);
    expect(sealed.tag.length).toBe(16);
    expect(open(sealed, key)).toBe("hello-世界");
  });

  it("rejects wrong key", () => {
    const key1 = generateMasterKey();
    const key2 = generateMasterKey();
    const sealed = seal("secret", key1);
    expect(() => open(sealed, key2)).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const key = generateMasterKey();
    const sealed = seal("payload", key);
    sealed.ciphertext[0] ^= 0xff;
    expect(() => open(sealed, key)).toThrow();
  });
});
