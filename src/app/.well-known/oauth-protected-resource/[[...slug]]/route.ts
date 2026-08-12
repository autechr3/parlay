import { NextResponse } from "next/server";

// Protected resource metadata (RFC 9728), pointed at by /api/mcp's
// WWW-Authenticate header. Same [[...slug]] trick as the authorization-server
// doc: answers both the bare well-known path and any suffixed probe
// (e.g. .../api/mcp) with the same fixed document.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function GET() {
  return NextResponse.json({
    resource: `${SITE}/api/mcp`,
    authorization_servers: [SITE],
    bearer_methods_supported: ["header"],
  });
}
