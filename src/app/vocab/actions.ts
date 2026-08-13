"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deriveVocabScript } from "@/lib/content-package";

export async function addVocabItem(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const term = String(formData.get("term") || "").trim();
  const translit = String(formData.get("transliteration") || "").trim();
  const translation = String(formData.get("translation") || "").trim();
  if (!term || !translit || !translation) throw new Error("term, transliteration, translation required");
  const { data: profile } = await supabase.from("profiles")
    .select("active_curriculum_id").eq("id", user.id).single();
  if (!profile?.active_curriculum_id) throw new Error("no active curriculum — import one first");
  // A vocalized term typed by hand would otherwise land in the `term` identity column;
  // deriveVocabScript strips diacritics into term_vocalized so a later plain-form import
  // upserts onto this row instead of minting a duplicate and orphaning SRS history.
  const script = deriveVocabScript(term);
  const { error } = await supabase.from("vocab_items").insert({
    curriculum_id: profile.active_curriculum_id,   // owner-only RLS authorizes this
    ...script, transliteration: translit, translation,
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
  // Upsert has no implicit WHERE clause, so an unowned vocabId would otherwise create a
  // vocab_reviews row pointing at foreign vocab_items — verify ownership through the
  // user's own (RLS-scoped) client first; RLS on vocab_items only returns rows whose
  // curriculum is owned by this user, so a foreign id resolves to no rows here.
  const { data: item } = await supabase.from("vocab_items").select("id").eq("id", vocabId).maybeSingle();
  if (!item) throw new Error("vocab item not found");
  const { error } = await supabase.from("vocab_reviews").upsert(
    { user_id: user.id, vocab_id: vocabId, suspended: suspend },
    { onConflict: "user_id,vocab_id" });
  if (error) throw error;
  revalidatePath("/vocab");
}
