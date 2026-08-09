"use server";
import { createClient } from "@/lib/supabase/server";
import { ContentPackageSchema, importContentPackage, type ImportResult } from "@/lib/content-package";

export type Preview = {
  courseName: string; courseExists: boolean; units: number;
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
  const parsed = ContentPackageSchema.safeParse(json);
  if (!parsed.success)
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const pkg = parsed.data;

  // Multi-course isn't supported by the UI yet: importing a package whose course.name
  // doesn't match an existing course would silently create a second course the user
  // has no way to switch to or see. Block it up front, in both the preview and
  // confirm paths, rather than letting it succeed and confuse the user later.
  const { data: ownedCourses, error: ownedErr } = await supabase.from("courses")
    .select("name").eq("owner_id", user.id);
  if (ownedErr) return { ok: false, errors: [ownedErr.message] };
  const hasOtherCourse = (ownedCourses ?? []).length > 0
    && !(ownedCourses ?? []).some((c) => c.name === pkg.course.name);
  if (hasOtherCourse) {
    const existingName = (ownedCourses ?? [])[0].name;
    return { ok: false, errors: [
      `You already have a course ('${existingName}'). Multi-course support isn't ready yet — ` +
      `to add content to your existing course, set course.name to exactly '${existingName}' in the package.`,
    ] };
  }

  if (!confirm) {
    const { data: course } = await supabase.from("courses")
      .select("id").eq("owner_id", user.id).eq("name", pkg.course.name).maybeSingle();
    let existingNumbers = new Set<number>();
    if (course) {
      const { data: ls } = await supabase.from("lessons")
        .select("number").eq("course_id", course.id);
      existingNumbers = new Set((ls ?? []).map((l) => l.number));
    }
    const newCount = pkg.lessons.filter((l) => !existingNumbers.has(l.number)).length;
    return { ok: true, preview: {
      courseName: pkg.course.name, courseExists: !!course,
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
