"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseAnyPackage, importContentPackage, type ImportResult } from "@/lib/content-package";

export type Preview = {
  curriculumName: string; curriculumExists: boolean; units: number;
  lessons: { total: number; new: number; updated: number };
  vocab: number; exercises: number;
};
export type ImportOutcome =
  | { ok: true; preview?: Preview; result?: ImportResult }
  | { ok: false; errors: string[] };

export async function importPackage(raw: string, confirm: boolean): Promise<ImportOutcome> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, errors: ["not authenticated"] };

  let json: unknown;
  try { json = JSON.parse(raw); }
  catch (e) { return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] }; }

  let pkg;
  try {
    // parseAnyPackage upconverts a v1 payload (course{...}) to v2 (curriculum{...}) before
    // validating, so both legacy and current generator prompts work here.
    pkg = parseAnyPackage(json);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, errors: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    }
    return { ok: false, errors: [(e as Error).message] };
  }

  // Multi-curriculum isn't supported by the UI yet: importing a package whose curriculum.name
  // doesn't match an existing curriculum would silently create a second curriculum the user
  // has no way to switch to or see from here. Block it up front, in both the preview and
  // confirm paths, rather than letting it succeed and confuse the user later.
  const { data: ownedCurriculums, error: ownedErr } = await supabase.from("curriculums")
    .select("name").eq("owner_id", user.id);
  if (ownedErr) return { ok: false, errors: [ownedErr.message] };
  const hasOtherCurriculum = (ownedCurriculums ?? []).length > 0
    && !(ownedCurriculums ?? []).some((c) => c.name === pkg.curriculum.name);
  if (hasOtherCurriculum) {
    const existingName = (ownedCurriculums ?? [])[0].name;
    return { ok: false, errors: [
      `You already have a curriculum ('${existingName}'). Multi-curriculum support isn't ready yet — ` +
      `to add content to your existing curriculum, set curriculum.name to exactly '${existingName}' in the package.`,
    ] };
  }

  if (!confirm) {
    const { data: curriculum } = await supabase.from("curriculums")
      .select("id").eq("owner_id", user.id).eq("name", pkg.curriculum.name).maybeSingle();
    let existingNumbers = new Set<number>();
    if (curriculum) {
      const { data: ls } = await supabase.from("lessons")
        .select("number").eq("curriculum_id", curriculum.id);
      existingNumbers = new Set((ls ?? []).map((l) => l.number));
    }
    const newCount = pkg.lessons.filter((l) => !existingNumbers.has(l.number)).length;
    return { ok: true, preview: {
      curriculumName: pkg.curriculum.name, curriculumExists: !!curriculum,
      units: new Set([...pkg.units.map((u) => u.number),
                      ...pkg.lessons.flatMap((l) => l.unit ? [l.unit] : [])]).size,
      lessons: { total: pkg.lessons.length, new: newCount, updated: pkg.lessons.length - newCount },
      vocab: pkg.lessons.reduce((a, l) => a + (l.vocab?.length ?? 0), 0),
      exercises: pkg.lessons.reduce((a, l) => a + (l.exercises?.length ?? 0), 0),
    }};
  }

  try {
    const result = await importContentPackage(supabase, user.id, pkg);
    return { ok: true, result };
  } catch (e) { return { ok: false, errors: [(e as Error).message] }; }
}
