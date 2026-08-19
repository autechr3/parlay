import { describe, it, expect } from "vitest";
import { checkAnswer } from "../src/lib/exercises/check";
import type { Exercise } from "../src/lib/exercises/schema";

const typedScript: Exercise = {
  id: "t1", type: "typed", prompt: { text: "Type 'water' in Farsi" },
  expected: ["آب"], input: "script",
};

describe("checkAnswer", () => {
  it("choice: matches by option id", () => {
    const ex: Exercise = { id: "e1", type: "choice", prompt: {},
      options: [{ id: "a", text: "آب" }, { id: "b", text: "نان" }], correct_id: "a" };
    expect(checkAnswer("fa", ex, "a").correct).toBe(true);
    expect(checkAnswer("fa", ex, "b").correct).toBe(false);
  });
  it("typed script: normalizes with the language module (diacritics stripped)", () => {
    // fa stripDiacritics removes fatha etc.; faNormalize unifies ي→ی and friends
    expect(checkAnswer("fa", typedScript, "آب").correct).toBe(true);
    expect(checkAnswer("fa", typedScript, "آَب").correct).toBe(true); // stray fatha
    expect(checkAnswer("fa", typedScript, "نان").correct).toBe(false);
  });
  it("typed translation: case/whitespace-insensitive generic normalize", () => {
    const ex: Exercise = { id: "t2", type: "typed", prompt: { term: "آب" },
      expected: ["water"], input: "translation" };
    expect(checkAnswer("fa", ex, "  Water ").correct).toBe(true);
    expect(checkAnswer("fa", ex, "bread").correct).toBe(false);
  });
  it("cloze: one answer per blank, all must match", () => {
    const ex: Exercise = { id: "c1", type: "cloze", prompt: {},
      tokens: ["من", "___", "می‌خورم"], blanks: [{ index: 1, expected: ["آب"] }], mode: "type" };
    expect(checkAnswer("fa", ex, ["آب"]).correct).toBe(true);
    expect(checkAnswer("fa", ex, ["نان"]).correct).toBe(false);
  });
  it("match: throws (widget scores matching itself)", () => {
    const ex: Exercise = { id: "m1", type: "match", prompt: {},
      pairs: [{ left: "آب", right: "water" }, { left: "نان", right: "bread" }] };
    expect(() => checkAnswer("fa", ex, "x")).toThrow();
  });
});
