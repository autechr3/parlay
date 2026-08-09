import { createClient } from "@/lib/supabase/server";
import { updateSettings } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
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
        <button className="rounded bg-black p-3 text-white">Save</button>
      </form>
    </main>
  );
}
