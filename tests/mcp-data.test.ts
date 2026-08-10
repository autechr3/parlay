import { describe, it, expect } from "vitest";
import { pickWeakSkills, rankErrors } from "../src/lib/mcp/helpers";

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
