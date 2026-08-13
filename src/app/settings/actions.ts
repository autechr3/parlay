"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const int = (k: string, lo: number, hi: number, dflt: number) => {
    const v = Number(formData.get(k));
    return Number.isInteger(v) && v >= lo && v <= hi ? v : dflt;
  };

  // Free-text timezone input reaches `now() at time zone tz` in SQL (grade_card,
  // get_review_queue, local_today, the daily/weekly email selection functions),
  // which throws for anything Postgres doesn't recognize as a zone name. A bad
  // value here doesn't just break this user's grade_card — it breaks the shared
  // email-selection functions for everyone. Validate against the IANA database
  // and silently keep the existing value on garbage input rather than throwing
  // or writing something invalid.
  const requestedTz = String(formData.get("timezone") || "");
  const validTz = Intl.supportedValuesOf("timeZone").includes(requestedTz);
  let timezone = requestedTz;
  if (!validTz) {
    const { data: existing } = await supabase.from("profiles")
      .select("timezone").eq("id", user.id).single();
    timezone = existing?.timezone || "America/New_York";
  }

  const { error } = await supabase.from("profiles").update({
    timezone,
    daily_email_enabled: formData.get("daily_email_enabled") === "on",
    daily_email_hour: int("daily_email_hour", 0, 23, 7),
    target_lessons_per_week: int("target_lessons_per_week", 1, 21, 5),
    daily_new_limit: int("daily_new_limit", 0, 200, 20),
    daily_review_limit: int("daily_review_limit", 0, 1000, 120),
    fa_scale: int("fa_scale", 100, 200, 125),
    show_diacritics: formData.get("show_diacritics") === "on",
  }).eq("id", user.id);
  if (error) throw error;
  revalidatePath("/settings");
}
