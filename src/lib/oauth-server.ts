import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "./supabase/admin";
import { generateToken } from "./api-tokens";
import { validateRedirectUri, verifyPkce, randomCode } from "./oauth";

// Server-only OAuth flows (admin client). Pure validation/crypto helpers live
// in ./oauth.ts so vitest can import them without pulling in "server-only" —
// same split as api-tokens.ts / api-tokens-server.ts.

const CODE_TTL_MS = 10 * 60 * 1000;

export type OAuthClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
};

// Bare scheme check reused for registration — a URI only needs a valid
// scheme at registration time; the exact-match-against-registered-list part
// of validateRedirectUri doesn't apply yet since there's no list until now.
function isValidRedirectUriScheme(uri: string): boolean {
  return validateRedirectUri(uri, [uri]);
}

export async function registerClient(
  input: unknown,
): Promise<OAuthClient | { error: string }> {
  if (typeof input !== "object" || input === null) {
    return { error: "invalid_client_metadata" };
  }
  const body = input as Record<string, unknown>;
  const clientName = body.client_name;
  if (typeof clientName !== "string" || clientName.length === 0 || clientName.length > 100) {
    return { error: "invalid_client_metadata" };
  }
  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 10 ||
    !redirectUris.every(
      (uri) => typeof uri === "string" && uri.length <= 2000 && isValidRedirectUriScheme(uri),
    )
  ) {
    return { error: "invalid_client_metadata" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("oauth_clients")
    .insert({ client_name: clientName, redirect_uris: redirectUris })
    .select("id, client_name, redirect_uris")
    .single();
  if (error || !data) {
    console.error("oauth client registration failed:", error?.message);
    return { error: "invalid_client_metadata" };
  }
  return { client_id: data.id, client_name: data.client_name, redirect_uris: data.redirect_uris };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("oauth_clients")
    .select("id, client_name, redirect_uris")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) return null;
  return { client_id: data.id, client_name: data.client_name, redirect_uris: data.redirect_uris };
}

export async function createAuthCode(
  userId: string,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
): Promise<string> {
  const { code, hash } = randomCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const admin = createAdminClient();
  const { error } = await admin.from("oauth_codes").insert({
    code_hash: hash,
    client_id: clientId,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    expires_at: expiresAt,
  });
  if (error) {
    throw new Error(`failed to create auth code: ${error.message}`);
  }
  return code;
}

export type ExchangeCodeInput = {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_verifier: string;
};

export type ExchangeCodeError = { error: string; status: number };

export async function exchangeCode(
  input: ExchangeCodeInput,
): Promise<{ access_token: string } | ExchangeCodeError> {
  const { code, client_id, redirect_uri, code_verifier } = input;
  if (!code || !client_id || !redirect_uri || !code_verifier) {
    return { error: "invalid_request", status: 400 };
  }

  const admin = createAdminClient();
  const hash = createHash("sha256").update(code).digest("hex");

  // Single-use, replay-safe: flip `used` to true only if it's currently
  // false and unexpired. A null row means the code was invalid, already
  // used, or expired — all of which are indistinguishable "invalid_grant"
  // to the caller.
  const { data: codeRow, error: updateError } = await admin
    .from("oauth_codes")
    .update({ used: true })
    .eq("code_hash", hash)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .select()
    .maybeSingle();

  if (updateError || !codeRow) {
    return { error: "invalid_grant", status: 400 };
  }

  if (codeRow.client_id !== client_id) {
    return { error: "invalid_grant", status: 400 };
  }
  if (codeRow.redirect_uri !== redirect_uri) {
    return { error: "invalid_grant", status: 400 };
  }
  if (!verifyPkce(code_verifier, codeRow.code_challenge)) {
    return { error: "invalid_grant", status: 400 };
  }

  const client = await getClient(client_id);
  if (!client) {
    return { error: "invalid_client", status: 401 };
  }

  const { token, hash: tokenHash } = generateToken();
  const { error: insertError } = await admin.from("api_tokens").insert({
    user_id: codeRow.user_id,
    name: `${client.client_name} (OAuth)`,
    token_hash: tokenHash,
  });
  if (insertError) {
    console.error("oauth token mint failed:", insertError.message);
    return { error: "invalid_grant", status: 400 };
  }

  return { access_token: token };
}
