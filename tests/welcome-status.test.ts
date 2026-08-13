// vitest cannot resolve the "@/" alias, so import the module under test relatively (see
// tests/curriculum-actions.test.ts for the same convention).
import { describe, it, expect } from "vitest";
import { buildStatus } from "../src/app/welcome/status/build";

describe("buildStatus", () => {
  it("returns falsy/null defaults when there is no token and no curriculum", () => {
    expect(buildStatus([], [], 0)).toEqual({
      hasToken: false,
      tokenName: null,
      curriculumCount: 0,
      firstCurriculumName: null,
    });
  });

  it("treats null rows/count (PostgREST error or no-count response) the same as empty", () => {
    expect(buildStatus(null, null, null)).toEqual({
      hasToken: false,
      tokenName: null,
      curriculumCount: 0,
      firstCurriculumName: null,
    });
  });

  it("maps the first token name and first curriculum name when rows are present", () => {
    expect(buildStatus([{ name: "my-token" }], [{ name: "Farsi Basics" }], 3)).toEqual({
      hasToken: true,
      tokenName: "my-token",
      curriculumCount: 3,
      firstCurriculumName: "Farsi Basics",
    });
  });

  it("uses the count parameter for curriculumCount even when more curriculum rows exist than were fetched", () => {
    // The route only fetches the first curriculum row (limit(1)) but requests an exact count
    // separately — curriculumCount must reflect the count, not curriculumRows.length.
    expect(buildStatus([], [{ name: "Farsi Basics" }], 5)).toEqual({
      hasToken: false,
      tokenName: null,
      curriculumCount: 5,
      firstCurriculumName: "Farsi Basics",
    });
  });
});
