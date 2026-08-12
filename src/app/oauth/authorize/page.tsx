import { createClient } from "@/lib/supabase/server";
import { getClient } from "@/lib/oauth-server";
import { validateRedirectUri } from "@/lib/oauth";

type SearchParams = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
};

function ErrorCard({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Authorization error</h1>
      <p className="text-sm text-red-800">{message}</p>
    </main>
  );
}

// Session is already guaranteed by middleware (this path isn't in
// PUBLIC_PATHS), but re-verify with getUser() rather than trust that alone —
// the middleware's job is redirecting, not authorizing.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <ErrorCard message="You must be signed in to authorize this application." />;
  }

  if (sp.response_type !== "code") {
    return <ErrorCard message='Unsupported response_type — only "code" is supported.' />;
  }
  if (!sp.client_id) {
    return <ErrorCard message="Missing client_id." />;
  }
  const client = await getClient(sp.client_id);
  if (!client) {
    return <ErrorCard message="Unknown client_id." />;
  }
  // Invalid redirect_uri must NEVER redirect the browser there — it isn't
  // trustworthy yet — so this stays an in-page error, same as every other
  // validation failure below.
  if (!sp.redirect_uri || !validateRedirectUri(sp.redirect_uri, client.redirect_uris)) {
    return <ErrorCard message="redirect_uri is missing or not registered for this client." />;
  }
  if (!sp.code_challenge) {
    return <ErrorCard message="Missing code_challenge." />;
  }
  if (sp.code_challenge_method !== "S256") {
    return <ErrorCard message='Unsupported code_challenge_method — only "S256" is supported.' />;
  }

  // Everything past this point has been validated, so redirect_uri is now
  // safe to send the browser to (the Cancel link below).
  const cancelUrl = new URL(sp.redirect_uri);
  cancelUrl.searchParams.set("error", "access_denied");
  if (sp.state) cancelUrl.searchParams.set("state", sp.state);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Farsi Tracker</h1>
      <div className="rounded border p-4">
        <p className="mb-4 text-sm text-gray-700">
          <strong>{client.client_name}</strong> wants to access your Farsi tracker.
        </p>
        <form method="POST" action="/oauth/authorize/approve" className="flex flex-col gap-3">
          <input type="hidden" name="client_id" value={sp.client_id} />
          <input type="hidden" name="redirect_uri" value={sp.redirect_uri} />
          <input type="hidden" name="code_challenge" value={sp.code_challenge} />
          {sp.state && <input type="hidden" name="state" value={sp.state} />}
          <button className="w-full rounded bg-black p-3 text-white">Approve</button>
        </form>
        <a href={cancelUrl.toString()} className="mt-2 block text-center text-sm text-gray-500">
          Cancel
        </a>
      </div>
    </main>
  );
}
