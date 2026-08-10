import "server-only";
import { createAdminClient } from "./supabase/admin";
import { hashToken } from "./api-tokens";

export async function authenticateToken(
  authHeader: string | null,
): Promise<{ userId: string } | null> {
  const m = authHeader?.match(/^Bearer (fpt_[A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("api_tokens")
    .select("id, user_id").eq("token_hash", hashToken(m[1])).maybeSingle();
  if (!data) return null;
  admin.from("api_tokens").update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id).then(() => {});
  return { userId: data.user_id };
}
