import { describe, it, expect } from "vitest";
import { sanitizeNext, validateRedirectUri, verifyPkce, randomCode } from "../src/lib/oauth";

describe("sanitizeNext", () => {
  it("allows a plain relative path", () => {
    expect(sanitizeNext("/settings")).toBe("/settings");
  });
  it("rejects absolute URLs, falling back to /", () => {
    expect(sanitizeNext("https://evil.com")).toBe("/");
  });
  it("rejects protocol-relative URLs, falling back to /", () => {
    expect(sanitizeNext("//evil")).toBe("/");
  });
  it("falls back to / for null", () => {
    expect(sanitizeNext(null)).toBe("/");
  });
});

describe("validateRedirectUri", () => {
  const registered = ["https://client.example.com/cb", "http://localhost:3000/cb"];

  it("accepts an exact match", () => {
    expect(validateRedirectUri("https://client.example.com/cb", registered)).toBe(true);
  });
  it("rejects a prefix match that isn't exact", () => {
    expect(validateRedirectUri("https://client.example.com/cb/extra", registered)).toBe(false);
  });
  it("rejects http for a non-localhost origin", () => {
    expect(validateRedirectUri("http://client.example.com/cb", ["http://client.example.com/cb"])).toBe(false);
  });
  it("accepts http://localhost when registered", () => {
    expect(validateRedirectUri("http://localhost:3000/cb", registered)).toBe(true);
  });
});

describe("verifyPkce", () => {
  // RFC 7636 Appendix B example vector.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("accepts the known RFC 7636 vector", () => {
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });
  it("rejects a mismatched challenge", () => {
    expect(verifyPkce(verifier, "not-the-right-challenge")).toBe(false);
  });
  it("rejects a verifier outside the RFC 7636 charset/length", () => {
    expect(verifyPkce("too-short", challenge)).toBe(false);
    expect(verifyPkce("a".repeat(129), challenge)).toBe(false);
    expect(verifyPkce("has a space in it".padEnd(43, "x"), challenge)).toBe(false);
  });
});

describe("randomCode", () => {
  it("produces a base64url code with a matching sha256 hex hash", () => {
    const { code, hash } = randomCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is unique across calls", () => {
    expect(randomCode().code).not.toBe(randomCode().code);
  });
});
