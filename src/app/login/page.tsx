"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { sanitizeNext } from "@/lib/oauth";

function LoginForm() {
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const next = sanitizeNext(useSearchParams().get("next"));

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setMsg(error ? error.message : "Check your email for the sign-in link.");
  }
  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }
  async function passwordLogin(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message); else window.location.href = next;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Parlay</h1>
      <form onSubmit={magicLink} className="flex flex-col gap-3">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" className="rounded border p-3" />
        <button className="rounded bg-black p-3 text-white">Send magic link</button>
      </form>
      <button onClick={google} className="rounded border p-3">Sign in with Google</button>
      {process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true" && (
        <form onSubmit={passwordLogin} className="flex flex-col gap-3 border-t pt-4">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="password (dev only)" className="rounded border p-3" />
          <button className="rounded border p-3">Password sign-in</button>
        </form>
      )}
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in the App Router (it opts
  // the subtree out of static rendering); the rest of the page has no data
  // dependency on `next`, so wrapping just the form is enough.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
