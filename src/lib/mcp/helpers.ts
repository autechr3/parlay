// Pure helpers only — no "server-only" import here, so this module stays
// importable from vitest (which can't resolve the admin client's
// "server-only" chain). The DB-touching functions live in ./data.ts, which
// re-exports these for callers that only need the data layer's surface.

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
