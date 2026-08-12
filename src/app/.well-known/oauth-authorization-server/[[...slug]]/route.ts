import { NextResponse } from "next/server";

// Authorization server metadata (RFC 8414). Served both at the bare
// well-known path and under any suffix (e.g. .../api/mcp) — some MCP
// clients probe a path-suffixed variant alongside the bare one, so this
// [[...slug]] catch-all answers both with the same fixed document instead
// of duplicating the route.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function GET() {
  return NextResponse.json({
    issuer: SITE,
    authorization_endpoint: `${SITE}/oauth/authorize`,
    token_endpoint: `${SITE}/oauth/token`,
    registration_endpoint: `${SITE}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
