import { createHash, randomBytes } from "node:crypto";

// Pure helpers only — no "server-only" imports here, so this module stays
// importable from vitest directly (see src/lib/api-tokens.ts for the same
// convention). Anything that needs the admin client belongs in a
// "-server.ts" sibling instead.

// Post-login redirect target. Only same-origin relative paths are allowed —
// anything else (absolute URLs, protocol-relative "//host" URLs, or a
// missing value) falls back to "/". The result must NOT be decodeURIComponent'd
// before redirecting — the // guard operates on the literal string.
export function sanitizeNext(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.includes("\\")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(next)) return "/";
  return next;
}

function isAllowedScheme(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  return false;
}

// OAuth redirect_uri validation: exact string match against the client's
// registered URIs. https is always allowed; http is allowed only for
// localhost/127.0.0.1 (dev-loopback), per OAuth 2.0 for native/loopback apps.
export function validateRedirectUri(uri: string, registered: string[]): boolean {
  if (!registered.includes(uri)) return false;
  return isAllowedScheme(uri);
}

// RFC 7636 code_verifier charset: unreserved characters, 43-128 of them.
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

// PKCE verification, S256 only: challenge must equal
// base64url(sha256(verifier)), and the verifier itself must conform to the
// RFC 7636 charset/length rules.
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!PKCE_VERIFIER_PATTERN.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}

// Authorization code generation: 32 random bytes, base64url-encoded for the
// code handed to the client, sha256 hex digest for the row stored at rest —
// same shape as generateToken() in api-tokens.ts.
export function randomCode(): { code: string; hash: string } {
  const code = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(code).digest("hex");
  return { code, hash };
}
