import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail, unsubscribeUrl, EMAIL_HEAD, esc } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`)
    return new Response("forbidden", { status: 403 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // same selection shape as daily-reminder, additionally gated to local Sunday (see migration)
  const { data: users, error } = await db.rpc("users_due_weekly_digest");
  if (error) return new Response(error.message, { status: 500 });

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  let sent = 0;
  for (const u of users ?? []) {
    // claim the send FIRST — the unique constraint on (user_id, kind, sent_on) is the real dedup
    const { error: claimErr } = await db.from("email_log")
      .insert({ user_id: u.id, kind: "weekly_digest", sent_on: u.local_date });
    if (claimErr) {
      if (claimErr.code !== "23505") console.error(`claim failed for ${u.id}: ${claimErr.message}`);
      continue; // already claimed (conflict) — skip
    }

    try {
      const [{ data: profile }, { data: comps }, { data: reviews }, { data: topErrors }, { data: nextLessons }] =
        await Promise.all([
          db.from("profiles").select("target_lessons_per_week").eq("id", u.id).single(),
          db.from("lesson_completions").select("completed_at")
            .eq("user_id", u.id).gte("completed_at", weekStart.toISOString()),
          db.from("review_log").select("grade")
            .eq("user_id", u.id).gte("reviewed_at", sevenDaysAgo),
          db.rpc("top_errors_for", { p_user: u.id, p_since: sevenDaysAgo, p_limit: 3 }),
          db.rpc("next_lesson_for", { p_user: u.id, p_limit: 3 }),
        ]);

      const site = Deno.env.get("SITE_URL");
      const lessonsDone = (comps ?? []).length;
      const target = profile?.target_lessons_per_week ?? 5;
      const totalReviews = (reviews ?? []).length;
      const retained = (reviews ?? []).filter((r) => r.grade >= 3).length;
      const retentionPct = totalReviews > 0 ? Math.round((retained / totalReviews) * 100) : null;
      const errorsHtml = (topErrors ?? [])
        .map((e: { error: string; occurrences: number }) => `<li>${esc(e.error)} (${e.occurrences}×)</li>`).join("");
      const nextHtml = (nextLessons ?? [])
        .map((l: { number: number; title: string; slug: string }) =>
          `<li>L${l.number} <a href="${site}/lessons/${esc(l.slug)}">${esc(l.title)}</a></li>`).join("");

      const html = `${EMAIL_HEAD}
        <p><b>${lessonsDone}/${target}</b> lessons completed this week.</p>
        <p>Retention (last 7 days): ${retentionPct === null ? "no reviews yet" : `${retentionPct}%`}</p>
        ${errorsHtml ? `<p>Top errors:</p><ul>${errorsHtml}</ul>` : ""}
        ${nextHtml ? `<p>Next up:</p><ul>${nextHtml}</ul>` : ""}
        <p style="color:#888;font-size:12px"><a href="${await unsubscribeUrl(u.id)}">unsubscribe</a></p>`;
      await sendEmail(u.email, `Your week in Farsi: ${lessonsDone}/${target} lessons`, html);
      sent++;
    } catch (e) {
      // claim row stays — no retry storm; next week sends again
      console.error(`processing failed for ${u.id}: ${e}`);
      continue;
    }
  }
  return Response.json({ sent, considered: (users ?? []).length });
});
