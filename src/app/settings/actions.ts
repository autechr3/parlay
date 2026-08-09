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
  const { error } = await supabase.from("profiles").update({
    timezone: String(formData.get("timezone") || "America/New_York"),
    daily_email_enabled: formData.get("daily_email_enabled") === "on",
    daily_email_hour: int("daily_email_hour", 0, 23, 7),
    target_lessons_per_week: int("target_lessons_per_week", 1, 21, 5),
    daily_new_limit: int("daily_new_limit", 0, 200, 20),
    daily_review_limit: int("daily_review_limit", 0, 1000, 120),
  }).eq("id", user.id);
  if (error) throw error;
  revalidatePath("/settings");
}
