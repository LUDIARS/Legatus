import { describe, it, expect } from "vitest";
import { parseCallback } from "../src/electron/sign-in.js";

describe("parseCallback", () => {
  it("parses tokens from query params", () => {
    const sub = "11111111-2222-3333-4444-555555555555";
    const jwt = makeJwt({ sub });
    const url = `legatus://auth/callback?accessToken=${jwt}&refreshToken=RT&expiresAt=1700000000`;
    const t = parseCallback(url);
    expect(t).not.toBeNull();
    expect(t?.userId).toBe(sub);
    expect(t?.accessToken).toBe(jwt);
    expect(t?.refreshToken).toBe("RT");
    expect(t?.expiresAt).toBe(1700000000);
  });

  it("rejects mismatched protocol", () => {
    expect(parseCallback("https://x/auth/callback?accessToken=a&refreshToken=b&userId=u")).toBeNull();
  });

  it("returns null when tokens are missing", () => {
    expect(parseCallback("legatus://auth/callback")).toBeNull();
  });
});

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}
