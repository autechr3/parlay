import { createClient } from "@/lib/supabase/server";
import { Wizard } from "@/components/wizard/Wizard";
import { buildStatus } from "./status/build";

// No redirect logic here — this route renders for anyone signed in regardless of onboarding
// state; Task 5 decides who gets sent here and what happens on completion.
export default async function WelcomePage() {
  const supabase = await createClient();

  // Same two queries as GET /welcome/status (see src/app/welcome/status/route.ts) run directly
  // here so the wizard can render with a status snapshot on first paint instead of waiting on a
  // client-side fetch; RLS scopes both to the signed-in caller.
  const [{ data: languages }, { data: tokenRows }, { data: curriculumRows, count }] = await Promise.all([
    supabase.from("languages").select("code, name, native_name, rtl").order("name", { ascending: true }),
    supabase.from("api_tokens").select("name").order("created_at", { ascending: false }).limit(1),
    supabase.from("curriculums").select("name", { count: "exact" }).order("created_at", { ascending: true }).limit(1),
  ]);

  const initialStatus = buildStatus(tokenRows, curriculumRows, count);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return <Wizard languages={languages ?? []} initialStatus={initialStatus} siteUrl={siteUrl} />;
}
