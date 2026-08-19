// Pure helpers only — no "server-only" import here, so this module stays
// importable from vitest (which can't resolve the admin client's
// "server-only" chain). The DB-touching functions live in ./data.ts, which
// re-exports these for callers that only need the data layer's surface.

import type { Exercise } from "../exercises/schema";

// Lives here (not data.ts) because helpers.ts must stay importable from
// vitest, and drillDirection below needs the GradeDirection type; data.ts
// re-exports both so its public surface is unchanged for existing importers.
export const DIRECTIONS = ["fa_to_en", "en_to_fa", "stem", "audio"] as const;
export type GradeDirection = (typeof DIRECTIONS)[number];

export function pickWeakSkills(
  ratings: { skill: string; rating: number; rated_at: string }[],
): { skill: string; rating: number }[] {
  const latest = new Map<string, { rating: number; rated_at: string }>();
  for (const r of ratings) {
    const prev = latest.get(r.skill);
    if (!prev || r.rated_at > prev.rated_at) latest.set(r.skill, { rating: r.rating, rated_at: r.rated_at });
  }
  return [...latest.entries()]
    .filter(([, v]) => v.rating <= 3)
    .map(([skill, v]) => ({ skill, rating: v.rating }))
    .sort((a, b) => a.rating - b.rating);
}

export function rankErrors(
  sessions: { errors: string[] | null }[], top = 3,
): { error: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of sessions) for (const e of s.errors ?? []) counts.set(e, (counts.get(e) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([error, count]) => ({ error, count }));
}

// Multi-curriculum isn't supported yet: importing a package whose curriculum.name doesn't
// match an existing owned curriculum would silently create a second curriculum the MCP
// caller has no way to switch to. Same guard and wording as
// src/app/curriculums/import/actions.ts's inline check — pulled out here as a pure function
// (no DB access) so the decision is unit-testable without a mocked SupabaseClient.
// Returns the error message to throw, or null when the import may proceed.
export function curriculumConflictMessage(ownedNames: string[], packageName: string): string | null {
  const hasOtherCurriculum = ownedNames.length > 0 && !ownedNames.includes(packageName);
  if (!hasOtherCurriculum) return null;
  const existingName = ownedNames[0];
  return `You already have a curriculum ('${existingName}'). Multi-curriculum support isn't ready yet — ` +
    `to add content to your existing curriculum, set curriculum.name to exactly '${existingName}' in the package.`;
}

export function drillGrade(correct: boolean): number {
  return correct ? 4 : 1;
}

export function drillDirection(ex: Exercise): GradeDirection {
  return ex.type === "typed" && ex.input === "script" ? "en_to_fa" : "fa_to_en";
}
