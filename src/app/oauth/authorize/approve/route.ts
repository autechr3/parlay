import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClient, createAuthCode } from "@/lib/oauth-server";
import { validateRedirectUri } from "@/lib/oauth";

// Plain-POST target of the consent form on /oauth/authorize. Everything the
// GET page already validated is re-validated here from scratch — the hidden
// form fields are client-supplied and the session could in principle have
// expired between page render and submit.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "access_denied" }, { status: 403 });
  }

  const form = await request.formData();
  const clientId = form.get("client_id");
  const redirectUri = form.get("redirect_uri");
  const codeChallenge = form.get("code_challenge");
  const state = form.get("state");

  if (
    typeof clientId !== "string" ||
    typeof redirectUri !== "string" ||
    typeof codeChallenge !== "string"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const client = await getClient(clientId);
  if (!client || !validateRedirectUri(redirectUri, client.redirect_uris)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const code = await createAuthCode(user.id, clientId, redirectUri, codeChallenge);

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (typeof state === "string" && state) target.searchParams.set("state", state);

  return NextResponse.redirect(target, 303);
}
