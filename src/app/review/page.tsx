import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReviewSession, type QueueCard } from "@/components/ReviewSession";

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles")
    .select("active_curriculum_id, show_diacritics").eq("id", user!.id).single();

  if (!profile?.active_curriculum_id) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-2xl font-bold">Review</h1>
        <p className="text-gray-500">
          <Link className="underline" href="/welcome">Set up your AI tutor to generate your first curriculum</Link>.
        </p>
      </main>
    );
  }

  const { data: curriculum } = await supabase.from("curriculums")
    .select("id, name, language_code, languages(rtl, has_diacritics, native_name)")
    .eq("id", profile.active_curriculum_id).single();
  const langCode = curriculum?.language_code ?? "fa";
  const languageRow = curriculum?.languages as unknown as { rtl: boolean; has_diacritics: boolean } | null;
  const rtl = languageRow?.rtl ?? true;
  const hasDiacritics = languageRow?.has_diacritics ?? false;

  // get_review_queue() already scopes by profiles.active_curriculum_id and returns
  // term_vocalized/morphology directly — no separate overlay query needed.
  const { data, error } = await supabase.rpc("get_review_queue");
  if (error) throw new Error(error.message);
  const queue = (data ?? []) as QueueCard[];

  return <ReviewSession initialQueue={queue} langCode={langCode} rtl={rtl}
    showDiacritics={hasDiacritics && !!profile.show_diacritics} />;
}
