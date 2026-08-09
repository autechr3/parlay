import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { TEST_EMAIL, TEST_PASSWORD } from "./constants";

// Playwright's webServer doesn't load .env.local for this Node process, so parse it
// the same way scripts/seed-lessons.ts does.
function loadDotEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// Makes the e2e suite deterministic against a local Supabase instance:
//  - ensures the dev-login test user exists with a known password
//  - marks lessons 1-4 as completed for that user, so /flashcards?deck=conjugations
//    (which only pulls vocab from "learned" lessons = completed + the next one) has
//    L01-L05 available, including L04's verbs
//  - wipes today's review activity so /review has a fresh, unreviewed queue
export default async function globalSetup() {
  loadDotEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set (check .env.local)");
  }
  // Must run before any Supabase client is created or any mutation happens below —
  // this setup deletes review history for the test user, so refuse to touch anything
  // that isn't obviously a local instance.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
    throw new Error(`e2e global setup refuses to run against non-local Supabase: ${url} — it deletes review history for the test user.`);
  }
  const supabase = createClient(url, serviceKey);

  const { error: createErr } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr && !/already.*registered|already.*exists/i.test(createErr.message)) {
    throw new Error(`failed to create test user: ${createErr.message}`);
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles").select("id").eq("email", TEST_EMAIL).single();
  if (profileErr || !profile) {
    throw new Error(`no profile for ${TEST_EMAIL} after ensuring auth user: ${profileErr?.message}`);
  }
  const userId = profile.id as string;

  const { data: lessons, error: lessonsErr } = await supabase
    .from("lessons").select("id, number").in("number", [1, 2, 3, 4]).order("number");
  if (lessonsErr) throw new Error(`failed to load lessons: ${lessonsErr.message}`);
  if (!lessons || lessons.length < 4) {
    throw new Error(`expected lessons 1-4 to exist (seed the DB first: npm run seed); found ${lessons?.length ?? 0}`);
  }

  const { error: completionsErr } = await supabase.from("lesson_completions")
    .upsert(
      lessons.map((l) => ({ user_id: userId, lesson_id: l.id })),
      { onConflict: "user_id,lesson_id", ignoreDuplicates: true },
    );
  if (completionsErr) throw new Error(`failed to upsert lesson_completions: ${completionsErr.message}`);

  const { error: reviewLogErr } = await supabase.from("review_log").delete().eq("user_id", userId);
  if (reviewLogErr) throw new Error(`failed to clear review_log: ${reviewLogErr.message}`);
  const { error: vocabReviewsErr } = await supabase.from("vocab_reviews").delete().eq("user_id", userId);
  if (vocabReviewsErr) throw new Error(`failed to clear vocab_reviews: ${vocabReviewsErr.message}`);
}
