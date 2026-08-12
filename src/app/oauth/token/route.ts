import { exchangeCode } from "@/lib/oauth-server";

// Token endpoint (public — see middleware PUBLIC_PATHS). Clients may send
// either application/x-www-form-urlencoded (the spec default) or JSON
// (what several MCP clients actually send); every field is shape-checked as
// a string before it ever reaches exchangeCode, so a malformed body always
// resolves to a clean 400 JSON error instead of a thrown 500.
function oauthError(error: string, status: number, error_description?: string) {
  return new Response(
    JSON.stringify(error_description ? { error, error_description } : { error }),
    { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let body: Record<string, unknown>;
  try {
    if (contentType.includes("application/json")) {
      const parsed = await request.json();
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return oauthError("invalid_request", 400, "request body must be a JSON object");
      }
      body = parsed as Record<string, unknown>;
    } else {
      const text = await request.text();
      body = Object.fromEntries(new URLSearchParams(text));
    }
  } catch {
    return oauthError("invalid_request", 400, "request body could not be parsed");
  }

  const { grant_type, code, client_id, redirect_uri, code_verifier } = body;

  if (grant_type !== "authorization_code") {
    return oauthError("unsupported_grant_type", 400);
  }

  if (
    typeof code !== "string" ||
    typeof client_id !== "string" ||
    typeof redirect_uri !== "string" ||
    typeof code_verifier !== "string"
  ) {
    return oauthError(
      "invalid_request",
      400,
      "code, client_id, redirect_uri, and code_verifier are required strings",
    );
  }

  const result = await exchangeCode({ code, client_id, redirect_uri, code_verifier });
  if ("error" in result) {
    return oauthError(result.error, result.status);
  }

  return new Response(
    JSON.stringify({ access_token: result.access_token, token_type: "bearer" }),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
