import { createClient } from "@/lib/supabase/server";
import { ReviewSession, type QueueCard } from "@/components/ReviewSession";

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_review_queue");
  if (error) throw new Error(error.message);
  return <ReviewSession initialQueue={(data ?? []) as QueueCard[]} />;
}
