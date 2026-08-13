import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildStatus } from "./build";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // RLS ("own rows"/"own curriculums") scopes both queries to the caller — no admin client.
  const [{ data: tokenRows }, { data: curriculumRows, count }] = await Promise.all([
    supabase.from("api_tokens").select("name").order("created_at", { ascending: false }).limit(1),
    supabase.from("curriculums").select("name", { count: "exact" }).order("created_at", { ascending: true }).limit(1),
  ]);

  return NextResponse.json(buildStatus(tokenRows, curriculumRows, count));
}
