import { createClient } from "@/lib/supabase/server";
import { updateSettings } from "./actions";
import { TokenManager } from "@/components/TokenManager";
import { ScriptScaleSlider } from "@/components/ScriptScaleSlider";
import { getLanguage } from "@/lib/languages";
import { fa } from "@/lib/languages/fa";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
  const { data: tokens } = await supabase.from("api_tokens")
    .select("id, name, created_at, last_used_at").eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  let sampleText = fa.sampleText;
  let rtl = true;
  let langCode = "fa";
  let hasDiacritics = false;
  if (p?.active_curriculum_id) {
    const { data: curriculum } = await supabase.from("curriculums")
      .select("id, language_code, languages(rtl, has_diacritics, native_name)")
      .eq("id", p.active_curriculum_id).single();
    if (curriculum) {
      langCode = curriculum.language_code;
      sampleText = getLanguage(langCode).sampleText;
      const languageRow = curriculum.languages as unknown as { rtl: boolean; has_diacritics: boolean } | null;
      rtl = languageRow?.rtl ?? true;
      hasDiacritics = languageRow?.has_diacritics ?? false;
    }
  }

  const field = "flex items-center justify-between gap-4";
  const input = "w-48 rounded border p-2";
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <form action={updateSettings} className="flex flex-col gap-4">
        <label className={field}>Timezone (IANA)
          <input name="timezone" defaultValue={p.timezone} className={input} /></label>
        <label className={field}>Daily reminder email
          <input type="checkbox" name="daily_email_enabled" defaultChecked={p.daily_email_enabled} /></label>
        <label className={field}>Delivery hour (0–23, local)
          <input type="number" name="daily_email_hour" min={0} max={23}
            defaultValue={p.daily_email_hour} className={input} /></label>
        <label className={field}>Lessons per week target
          <input type="number" name="target_lessons_per_week" min={1} max={21}
            defaultValue={p.target_lessons_per_week} className={input} /></label>
        <label className={field}>New cards per day
          <input type="number" name="daily_new_limit" min={0} max={200}
            defaultValue={p.daily_new_limit} className={input} /></label>
        <label className={field}>Reviews per day
          <input type="number" name="daily_review_limit" min={0} max={1000}
            defaultValue={p.daily_review_limit} className={input} /></label>
        <ScriptScaleSlider initial={p.script_scale} sampleText={sampleText} rtl={rtl} langCode={langCode} />
        {hasDiacritics && (
          <label className={field}>Show diacritics when available
            <input type="checkbox" name="show_diacritics" defaultChecked={p.show_diacritics} /></label>
        )}
        <button className="rounded bg-black p-3 text-white">Save</button>
      </form>
      <TokenManager tokens={tokens ?? []} />
    </main>
  );
}
