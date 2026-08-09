import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail, unsubscribeUrl, FA_SPAN, EMAIL_HEAD, esc } from "../_shared/email.ts";

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
    if (claimErr) {
      if (claimErr.code !== "23505") console.error(`claim failed for ${u.id}: ${claimErr.message}`);
      continue; // already claimed (conflict) — skip
    }

    try {
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
      const tutorPrompt = nl
        ? `We're doing Lesson ${nl.number} of my Farsi curriculum: "${nl.title}". Teach it interactively per the lesson plan, correct my Persian ruthlessly, and end with a session log of my errors and strengths.`
        : "";
      const drill = (warmup ?? [])
        .map((w) => {
          const v = w.vocab_items as unknown as { farsi: string; transliteration: string; english: string };
          return `<li>${FA_SPAN(esc(v.farsi))} — <a href="${site}/review">show answer</a></li>`;
        }).join("");
      const html = `${EMAIL_HEAD}
        <p><b>${due ?? 0} cards due</b> — <a href="${site}/review">review now</a></p>
        ${nl ? `<p>Today's lesson: <b>L${nl.number} ${esc(nl.title)}</b> — <a href="${site}/lessons/${esc(nl.slug)}">open</a></p>
        <p style="font-family:monospace;background:#f4f4f4;border-left:3px solid #ccc;padding:8px;margin:4px 0;white-space:pre-wrap">&quot;${esc(tutorPrompt)}&quot;</p>` : ""}
        <p>Streak: ${Number(streak ?? 0)} days.</p>
        ${drill ? `<p>Warm-up:</p><ul>${drill}</ul>` : ""}
        ${(lastComp ?? [])[0]?.negar_drill_done === false ? `<p>The Negar drill for your last lesson is still open.</p>` : ""}
        <p style="color:#888;font-size:12px"><a href="${await unsubscribeUrl(u.id)}">unsubscribe</a></p>`;
      await sendEmail(u.email, `Farsi today: ${due ?? 0} cards due${nl ? `, L${nl.number}` : ""}`, html);
      sent++;
    } catch (e) {
      // claim row stays — no retry storm; next day sends again
      console.error(`processing failed for ${u.id}: ${e}`);
      continue;
    }
  }
  return Response.json({ sent, considered: (users ?? []).length });
});
