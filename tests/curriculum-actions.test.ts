import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setActiveCurriculumFor, deleteCurriculumFor, exportTableFilter, type ExportScope } from "../src/app/curriculums/lib";

// Minimal chainable mock in the same spirit as the querybuilder used throughout the app:
// .from(table) returns a queued canned response for that table, and every chain method
// (select/eq/order/limit/update/delete) just returns the same chain so call order doesn't
// matter — only the queue order (one entry per .from(table) call, in call sequence) does.
// The chain is also thenable so `await supabase.from(t)...eq(...)` resolves without an
// explicit .maybeSingle()/.single() call, matching how the real supabase-js builder behaves.
type Resp = { data?: unknown; error?: unknown };
type Chain = Record<string, unknown> & { update: (v: unknown) => Chain };

function makeChain(response: Resp): Chain {
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    update: () => chain,
    delete: () => chain,
    maybeSingle: async () => response,
    single: async () => response,
    then: (resolve: (v: Resp) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return chain;
}

function asClient(from: (table: string) => Chain): SupabaseClient {
  return { from } as unknown as SupabaseClient;
}

function makeMockSupabase(queues: Record<string, Resp[]>): SupabaseClient {
  return asClient((table) => {
    const q = queues[table];
    if (!q || q.length === 0) throw new Error(`no mock response queued for table "${table}"`);
    return makeChain(q.shift()!);
  });
}

// Tracks every payload passed to profiles.update(...) so tests can assert on it without
// caring how the chain is otherwise driven.
function trackProfileUpdates(chain: Chain, updateCalls: unknown[]): Chain {
  const originalUpdate = chain.update;
  chain.update = (v: unknown) => { updateCalls.push(v); return originalUpdate(v); };
  return chain;
}

describe("setActiveCurriculumFor", () => {
  it("throws 'curriculum not found' when the id isn't owned by the user (RLS returns null)", async () => {
    const supabase = makeMockSupabase({
      curriculums: [{ data: null, error: null }],
    });
    await expect(setActiveCurriculumFor(supabase, "user-1", "someone-elses-curriculum"))
      .rejects.toThrow("curriculum not found");
  });

  it("updates profiles.active_curriculum_id when the curriculum is owned", async () => {
    const updateCalls: unknown[] = [];
    const supabase = asClient((table) => {
      if (table === "curriculums") return makeChain({ data: { id: "c1" }, error: null });
      if (table === "profiles") return trackProfileUpdates(makeChain({ data: null, error: null }), updateCalls);
      throw new Error(`unexpected table ${table}`);
    });

    await expect(setActiveCurriculumFor(supabase, "user-1", "c1")).resolves.toBeUndefined();
    expect(updateCalls).toEqual([{ active_curriculum_id: "c1" }]);
  });
});

describe("deleteCurriculumFor", () => {
  it("throws 'curriculum not found' when the id isn't owned by the user", async () => {
    const supabase = makeMockSupabase({
      curriculums: [{ data: null, error: null }],
    });
    await expect(deleteCurriculumFor(supabase, "user-1", "someone-elses-curriculum"))
      .rejects.toThrow("curriculum not found");
  });

  it("does not touch active_curriculum_id when the deleted curriculum wasn't active", async () => {
    const supabase = makeMockSupabase({
      curriculums: [
        { data: { id: "c2" }, error: null }, // ownership check
        { data: null, error: null },          // delete
      ],
      profiles: [
        { data: { active_curriculum_id: "c1" }, error: null }, // select — active is c1, not c2
      ],
    });
    await expect(deleteCurriculumFor(supabase, "user-1", "c2")).resolves.toBeUndefined();
  });

  it("reassigns active_curriculum_id to the most recently created remaining curriculum", async () => {
    const updateCalls: unknown[] = [];
    let curriculumCall = 0;
    const supabase = asClient((table) => {
      if (table === "curriculums") {
        curriculumCall++;
        if (curriculumCall === 1) return makeChain({ data: { id: "c1" }, error: null }); // ownership
        if (curriculumCall === 2) return makeChain({ data: null, error: null });          // delete
        return makeChain({ data: { id: "c-newest" }, error: null });                      // remaining
      }
      if (table === "profiles") {
        return trackProfileUpdates(makeChain({ data: { active_curriculum_id: "c1" }, error: null }), updateCalls);
      }
      throw new Error(`unexpected table ${table}`);
    });

    await deleteCurriculumFor(supabase, "user-1", "c1");
    expect(updateCalls).toEqual([{ active_curriculum_id: "c-newest" }]);
  });

  it("clears active_curriculum_id to null when the deleted curriculum was active and none remain", async () => {
    const updateCalls: unknown[] = [];
    let curriculumCall = 0;
    const supabase = asClient((table) => {
      if (table === "curriculums") {
        curriculumCall++;
        if (curriculumCall === 1) return makeChain({ data: { id: "c1" }, error: null }); // ownership
        if (curriculumCall === 2) return makeChain({ data: null, error: null });          // delete
        return makeChain({ data: null, error: null });                                    // remaining: none
      }
      if (table === "profiles") {
        return trackProfileUpdates(makeChain({ data: { active_curriculum_id: "c1" }, error: null }), updateCalls);
      }
      throw new Error(`unexpected table ${table}`);
    });

    await deleteCurriculumFor(supabase, "user-1", "c1");
    expect(updateCalls).toEqual([{ active_curriculum_id: null }]);
  });
});

describe("exportTableFilter", () => {
  const scope: ExportScope = {
    curriculumId: "curric-1",
    lessonIds: [1, 2, 3],
    vocabIds: ["v1", "v2"],
    exerciseIds: ["e1", "e2"],
  };

  it("returns null (no extra filter) for every table when scope is null — full unscoped export", () => {
    for (const t of ["profiles", "curriculums", "units", "lessons", "vocab_items", "exercises",
      "lesson_completions", "exercise_attempts", "vocab_reviews", "review_log",
      "practice_sessions", "skill_ratings", "study_days", "email_log"]) {
      expect(exportTableFilter(t, null)).toBeNull();
    }
  });

  it("filters curriculums by id", () => {
    expect(exportTableFilter("curriculums", scope)).toEqual({ op: "eq", column: "id", value: "curric-1" });
  });

  it("filters units/lessons/vocab_items/exercises by curriculum_id", () => {
    for (const t of ["units", "lessons", "vocab_items", "exercises"]) {
      expect(exportTableFilter(t, scope)).toEqual({ op: "eq", column: "curriculum_id", value: "curric-1" });
    }
  });

  it("filters lesson_completions by lesson_id in the curriculum's lesson ids", () => {
    expect(exportTableFilter("lesson_completions", scope)).toEqual({ op: "in", column: "lesson_id", values: [1, 2, 3] });
  });

  it("filters exercise_attempts by exercise_id (no lesson_id column on that table)", () => {
    expect(exportTableFilter("exercise_attempts", scope)).toEqual({ op: "in", column: "exercise_id", values: ["e1", "e2"] });
  });

  it("filters vocab_reviews and review_log by vocab_id in the curriculum's vocab ids", () => {
    expect(exportTableFilter("vocab_reviews", scope)).toEqual({ op: "in", column: "vocab_id", values: ["v1", "v2"] });
    expect(exportTableFilter("review_log", scope)).toEqual({ op: "in", column: "vocab_id", values: ["v1", "v2"] });
  });

  it("leaves study_days, email_log, practice_sessions, skill_ratings, profiles unfiltered even when scoped — they stay user-scoped only", () => {
    for (const t of ["study_days", "email_log", "practice_sessions", "skill_ratings", "profiles"]) {
      expect(exportTableFilter(t, scope)).toBeNull();
    }
  });

  it("guards empty id lists with a never-match sentinel instead of an empty .in() array", () => {
    // A curriculum can legitimately have zero exercises/vocab (both optional at import) and,
    // transiently, zero completed lessons — `.in(col, [])` must never be handed to supabase-js.
    const emptyScope: ExportScope = {
      curriculumId: "curric-empty", lessonIds: [], vocabIds: [], exerciseIds: [],
    };
    // lesson_id is an int column — the sentinel must itself be a plausible int, never [].
    const lessonFilter = exportTableFilter("lesson_completions", emptyScope);
    expect(lessonFilter).not.toEqual({ op: "in", column: "lesson_id", values: [] });
    expect(lessonFilter).toEqual({ op: "in", column: "lesson_id", values: [-1] });

    // exercise_id/vocab_id are uuid columns — -1 isn't valid uuid input, so these need a
    // well-formed-but-unassignable uuid sentinel rather than reusing the int one.
    const exerciseFilter = exportTableFilter("exercise_attempts", emptyScope);
    expect(exerciseFilter).not.toEqual({ op: "in", column: "exercise_id", values: [] });
    expect(exerciseFilter).toEqual({
      op: "in", column: "exercise_id", values: ["00000000-0000-0000-0000-000000000000"],
    });

    const vocabReviewsFilter = exportTableFilter("vocab_reviews", emptyScope);
    const reviewLogFilter = exportTableFilter("review_log", emptyScope);
    for (const filter of [vocabReviewsFilter, reviewLogFilter]) {
      expect(filter).not.toEqual({ op: "in", column: "vocab_id", values: [] });
      expect(filter).toEqual({ op: "in", column: "vocab_id", values: ["00000000-0000-0000-0000-000000000000"] });
    }
  });
});
