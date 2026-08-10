"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateToken } from "@/lib/api-tokens";

export async function createToken(formData: FormData): Promise<{ token: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const name = String(formData.get("name") || "").trim();
  if (!name || name.length > 60) {
    throw new Error("name is required and must be 60 characters or fewer");
  }

  const { token, hash } = generateToken();
  const { error } = await supabase.from("api_tokens").insert({
    user_id: user.id,
    name,
    token_hash: hash,
  });
  if (error) throw error;

  revalidatePath("/settings");
  return { token };
}

export async function revokeToken(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  // RLS already scopes deletes to the owner; the explicit filter is defense-in-depth
  const { error } = await supabase.from("api_tokens").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;

  revalidatePath("/settings");
}
