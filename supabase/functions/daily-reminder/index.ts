import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail, unsubscribeUrl, FA_SPAN, EMAIL_HEAD } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`)
    return new Response("forbidden", { status: 403 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // spec's selection query, via rpc-free SQL over PostgREST:
  const { data: users, error } = await db.rpc("users_due_daily_email");
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const u of users ?? []) {
    // claim the send FIRST — the unique constraint on (user_id, kind, sent_on) is the real dedup
    const { error: claimErr } = await db.from("email_log")
      .insert({ user_id: u.id, kind: "daily_reminder", sent_on: u.local_date });
    if (claimErr) continue; // already claimed (conflict) — skip

    const [{ count: due }, { data: streak }, { data: warmup }, { data: nextLesson }, { data: lastComp }] =
      await Promise.all([
        db.from("vocab_reviews").select("id", { count: "exact", head: true })
          .eq("user_id", u.id).eq("suspended", false).lte("due_on", u.local_date),
        db.rpc("current_streak", { p_user: u.id }),
        db.from("vocab_reviews").select("vocab_items(farsi, transliteration, english)")
          .eq("user_id", u.id).eq("suspended", false).lte("due_on", u.local_date).limit(3),
        db.rpc("next_lesson_for", { p_user: u.id }),
        db.from("lesson_completions").select("negar_drill_done")
          .eq("user_id", u.id).order("completed_at", { ascending: false }).limit(1),
      ]);

    const site = Deno.env.get("SITE_URL");
    const nl = (nextLesson ?? [])[0];
    const drill = (warmup ?? [])
      .map((w) => {
        const v = w.vocab_items as unknown as { farsi: string; transliteration: string; english: string };
        return `<li>${FA_SPAN(v.farsi)} — <a href="${site}/review">show answer</a></li>`;
      }).join("");
    const html = `${EMAIL_HEAD}
      <p><b>${due ?? 0} cards due</b> — <a href="${site}/review">review now</a></p>
      ${nl ? `<p>Today's lesson: <b>L${nl.number} ${nl.title}</b> — <a href="${site}/lessons/${nl.slug}">open</a></p>` : ""}
      <p>Streak: ${Number(streak ?? 0)} days.</p>
      ${drill ? `<p>Warm-up:</p><ul>${drill}</ul>` : ""}
      ${(lastComp ?? [])[0]?.negar_drill_done === false ? `<p>The Negar drill for your last lesson is still open.</p>` : ""}
      <p style="color:#888;font-size:12px"><a href="${await unsubscribeUrl(u.id)}">unsubscribe</a></p>`;
    try {
      await sendEmail(u.email, `Farsi today: ${due ?? 0} cards due${nl ? `, L${nl.number}` : ""}`, html);
      sent++;
    } catch (e) {
      console.error(`send failed for ${u.id}: ${e}`); // claim row stays — no retry storm; next day sends again
    }
  }
  return Response.json({ sent, considered: (users ?? []).length });
});
