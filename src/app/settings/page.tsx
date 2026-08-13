import { createClient } from "@/lib/supabase/server";
import { updateSettings } from "./actions";
import { TokenManager } from "@/components/TokenManager";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
  const { data: tokens } = await supabase.from("api_tokens")
    .select("id, name, created_at, last_used_at").eq("user_id", user!.id)
    .order("created_at", { ascending: false });
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
        <label className={field}>Farsi script size (100–200%)
          <input type="number" name="fa_scale" min={100} max={200} step={5}
            defaultValue={p.fa_scale} className={input} /></label>
        <p className="-mt-2 text-sm text-gray-500">
          Current size: <span dir="rtl" lang="fa" className="font-fa">خواهش می‌کنم</span>
          {" "}— save to apply everywhere.</p>
        <button className="rounded bg-black p-3 text-white">Save</button>
      </form>
      <TokenManager tokens={tokens ?? []} />
    </main>
  );
}
