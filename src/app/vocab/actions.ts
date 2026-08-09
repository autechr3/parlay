"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addVocabItem(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const farsi = String(formData.get("farsi") || "").trim();
  const translit = String(formData.get("transliteration") || "").trim();
  const english = String(formData.get("english") || "").trim();
  if (!farsi || !translit || !english) throw new Error("farsi, transliteration, english required");
  const { data: profile } = await supabase.from("profiles")
    .select("active_course_id").eq("id", user.id).single();
  if (!profile?.active_course_id) throw new Error("no active course — import one first");
  const { error } = await supabase.from("vocab_items").insert({
    course_id: profile.active_course_id,   // owner-only RLS authorizes this
    farsi, transliteration: translit, english,
    part_of_speech: String(formData.get("part_of_speech") || "") || null,
    lesson_id: Number(formData.get("lesson_id")) || null,
    tags: ["manual"],
  });
  if (error) throw error;
  revalidatePath("/vocab");
}

export async function toggleSuspend(vocabId: string, suspend: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { error } = await supabase.from("vocab_reviews").upsert(
    { user_id: user.id, vocab_id: vocabId, suspended: suspend },
    { onConflict: "user_id,vocab_id" });
  if (error) throw error;
  revalidatePath("/vocab");
}
