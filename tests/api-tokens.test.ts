import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "../src/lib/api-tokens";

describe("api tokens", () => {
  it("generates fpt_ prefixed url-safe tokens with sha256 hash", () => {
    const { token, hash } = generateToken();
    expect(token).toMatch(/^fpt_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("tokens are unique", () => {
    expect(generateToken().token).not.toBe(generateToken().token);
  });
  it("hash is deterministic and one-way-ish", () => {
    expect(hashToken("fpt_abc")).toBe(hashToken("fpt_abc"));
    expect(hashToken("fpt_abc")).not.toContain("abc");
  });
});
