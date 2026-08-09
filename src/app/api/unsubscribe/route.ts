import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = url.searchParams.get("uid") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const expected = createHmac("sha256", process.env.UNSUBSCRIBE_SECRET!).update(uid).digest("hex");
  const a = Buffer.from(token), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return new Response("invalid link", { status: 403 });
  const { error } = await createAdminClient().from("profiles")
    .update({ daily_email_enabled: false }).eq("id", uid);
  if (error) return new Response("failed", { status: 500 });
  return new Response("<h1>Unsubscribed</h1><p>Daily reminders are off. Re-enable them in Settings.</p>",
    { headers: { "Content-Type": "text/html" } });
}
