// Pure response-shaping for GET /welcome/status, decoupled from the Supabase client so it can be
// unit tested without a real (or mocked-chain) SupabaseClient — see src/app/curriculums/lib.ts /
// tests/curriculum-actions.test.ts for the same pattern. vitest cannot resolve the "@/" alias, so
// nothing importable from a test may pull in @/lib/supabase/server.
export type TokenRow = { name: string };
export type CurriculumRow = { name: string };

export type WelcomeStatus = {
  hasToken: boolean;
  tokenName: string | null;
  curriculumCount: number;
  firstCurriculumName: string | null;
};

// tokenRows/curriculumRows are the (at most one row, via .limit(1)) results of the route's two
// queries; count is the separate exact count PostgREST returns alongside the curriculums query
// (curriculumRows.length would only ever be 0 or 1, so curriculumCount must come from count, not
// the row array).
export function buildStatus(
  tokenRows: TokenRow[] | null,
  curriculumRows: CurriculumRow[] | null,
  count: number | null,
): WelcomeStatus {
  const token = tokenRows?.[0] ?? null;
  const curriculum = curriculumRows?.[0] ?? null;
  return {
    hasToken: token !== null,
    tokenName: token?.name ?? null,
    curriculumCount: count ?? 0,
    firstCurriculumName: curriculum?.name ?? null,
  };
}
