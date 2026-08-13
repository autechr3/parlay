"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setActiveCurriculumFor, deleteCurriculumFor } from "./lib";

export async function setActiveCurriculum(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  await setActiveCurriculumFor(supabase, user.id, id);
  revalidatePath("/curriculums");
}

export async function deleteCurriculum(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  await deleteCurriculumFor(supabase, user.id, id);
  revalidatePath("/curriculums");
}
