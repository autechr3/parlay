import { describe, it, expect } from "vitest";
import { pickWeakSkills, rankErrors, curriculumConflictMessage, drillGrade, drillDirection } from "../src/lib/mcp/helpers";

describe("pickWeakSkills", () => {
  it("keeps only the LATEST rating per skill, filters > 3", () => {
    const out = pickWeakSkills([
      { skill: "ezafe", rating: 2, rated_at: "2026-01-01" },
      { skill: "ezafe", rating: 4, rated_at: "2026-06-01" },   // latest, strong → excluded
      { skill: "ra", rating: 5, rated_at: "2026-01-01" },
      { skill: "ra", rating: 3, rated_at: "2026-06-01" },      // latest, weak → included
      { skill: "stems", rating: 1, rated_at: "2026-03-01" },
    ]);
    expect(out).toEqual([{ skill: "stems", rating: 1 }, { skill: "ra", rating: 3 }]);
  });
});

describe("rankErrors", () => {
  it("counts, ranks, caps", () => {
    const out = rankErrors([
      { errors: ["verb not final", "dropped را"] },
      { errors: ["verb not final"] },
      { errors: null },
    ], 1);
    expect(out).toEqual([{ error: "verb not final", count: 2 }]);
  });
});

// Regression coverage for the MCP import_content_package tool's second-curriculum guard
// (src/lib/mcp/data.ts's importPackage → curriculumConflictMessage), a real tenant-isolation
// concern: without this check an MCP caller could import a package under a *different*
// curriculum name than the one they already own, silently minting a second curriculum they
// have no way to switch to or see, and scattering their content across two tenants. Renamed
// from the pre-v2 "course" wording; behavior and message shape are unchanged.
describe("curriculumConflictMessage", () => {
  it("allows the import when the caller owns no curriculum yet", () => {
    expect(curriculumConflictMessage([], "Persian Basics")).toBeNull();
  });

  it("allows the import when the package name matches the caller's existing curriculum", () => {
    expect(curriculumConflictMessage(["Persian Basics"], "Persian Basics")).toBeNull();
  });

  it("blocks the import and names the existing curriculum when the package name differs", () => {
    const msg = curriculumConflictMessage(["Persian Basics"], "Spanish 101");
    expect(msg).toContain("You already have a curriculum ('Persian Basics')");
    expect(msg).toContain("set curriculum.name to exactly 'Persian Basics'");
  });
});

describe("drill grading helpers", () => {
  it("maps correctness to SM-2 grades 4/1", () => {
    expect(drillGrade(true)).toBe(4);
    expect(drillGrade(false)).toBe(1);
  });
  it("derives direction: producing script = en_to_fa, everything else fa_to_en", () => {
    const typedScript = { id: "t", type: "typed", prompt: {}, expected: ["آب"], input: "script" } as const;
    const typedTranslation = { ...typedScript, input: "translation" } as const;
    const choice = { id: "c", type: "choice", prompt: {}, options: [{ id: "a", text: "x" }, { id: "b", text: "y" }], correct_id: "a" } as const;
    expect(drillDirection(typedScript as never)).toBe("en_to_fa");
    expect(drillDirection(typedTranslation as never)).toBe("fa_to_en");
    expect(drillDirection(choice as never)).toBe("fa_to_en");
  });
});
