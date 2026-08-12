import { NextResponse } from "next/server";
import { registerClient } from "@/lib/oauth-server";

// Dynamic client registration (RFC 7591), public (see middleware
// PUBLIC_PATHS). claude.ai's connector UI calls this once per connector to
// obtain a client_id before it ever has a session — there is no client
// secret because these are public clients using PKCE (S256) only.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "request body must be valid JSON",
      },
      { status: 400 },
    );
  }

  const result = await registerClient(body);
  if ("error" in result) {
    return NextResponse.json(
      {
        error: result.error,
        error_description:
          "client_name (string, up to 100 chars) and redirect_uris (a non-empty array of https:// or http://localhost URIs) are required",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      client_id: result.client_id,
      client_name: result.client_name,
      redirect_uris: result.redirect_uris,
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
