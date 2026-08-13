"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function completeOnboarding(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  // .is("onboarded_at", null) makes this idempotent — a second call finds no matching row and
  // no-ops rather than re-stamping an already-completed (or skipped) onboarding.
  const { error } = await supabase.from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);
  if (error) throw error;

  revalidatePath("/");
}
