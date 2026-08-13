import { createClient } from "@/lib/supabase/server";
import { ReviewSession, type QueueCard } from "@/components/ReviewSession";

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_review_queue");
  if (error) throw new Error(error.message);
  let queue = (data ?? []) as QueueCard[];

  // The queue RPC predates farsi_vocalized; overlay it with an RLS-scoped lookup
  // instead of changing the function's return shape.
  if (queue.length) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("profiles")
      .select("show_diacritics").eq("id", user!.id).single();
    if (prof?.show_diacritics) {
      const { data: voc } = await supabase.from("vocab_items")
        .select("id, farsi_vocalized").in("id", queue.map((c) => c.vocab_id))
        .not("farsi_vocalized", "is", null);
      const byId = new Map((voc ?? []).map((v) => [v.id, v.farsi_vocalized as string]));
      queue = queue.map((c) => ({ ...c, farsi: byId.get(c.vocab_id) ?? c.farsi }));
    }
  }
  return <ReviewSession initialQueue={queue} />;
}
