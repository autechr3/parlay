import { describe, it, expect } from "vitest";
import { checkEnglishAnswer } from "../src/lib/english-check";

describe("checkEnglishAnswer", () => {
  it("case and punctuation insensitive", () =>
    expect(checkEnglishAnswer("I'm going home!", "im going home", [])).toBe(true));
  it("accept alternatives", () =>
    expect(checkEnglishAnswer("to eat", "to eat, to drink", ["to eat", "to drink"])).toBe(true));
  it("one typo tolerated", () =>
    expect(checkEnglishAnswer("hovse", "house", [])).toBe(true));
  it("wrong is wrong", () =>
    expect(checkEnglishAnswer("car", "house", [])).toBe(false));
});
