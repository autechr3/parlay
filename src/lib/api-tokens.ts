import { createHash, randomBytes } from "node:crypto";

// Pure helpers only — no "server-only" imports here, so this module stays
// importable from vitest (which can't resolve the admin client's
// "server-only" chain). `authenticateToken`, which needs the admin client,
// lives in `./api-tokens-server.ts` instead.

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): { token: string; hash: string } {
  const token = `fpt_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}
