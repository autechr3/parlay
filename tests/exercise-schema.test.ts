import { describe, it, expect } from "vitest";
import { drillSchema } from "../src/lib/exercises/schema";

const choice = {
  id: "e1", type: "choice",
  prompt: { text: "Which means 'water'?" },
  options: [{ id: "a", text: "آب", script: true }, { id: "b", text: "نان", script: true }],
  correct_id: "a",
};

describe("drillSchema", () => {
  it("accepts a minimal valid drill and applies defaults", () => {
    const d = drillSchema.parse({ language: "fa", exercises: [choice] });
    expect(d.srs_default).toBe(true);
    expect(d.exercises).toHaveLength(1);
  });
  it("rejects a drill with zero or >10 exercises", () => {
    expect(drillSchema.safeParse({ language: "fa", exercises: [] }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...choice, id: `e${i}` }));
    expect(drillSchema.safeParse({ language: "fa", exercises: eleven }).success).toBe(false);
  });
  it("rejects choice whose correct_id is not among options", () => {
    const bad = { ...choice, correct_id: "zzz" };
    expect(drillSchema.safeParse({ language: "fa", exercises: [bad] }).success).toBe(false);
  });
  it("rejects cloze whose blank index is out of range", () => {
    const bad = {
      id: "c1", type: "cloze", prompt: { text: "fill" },
      tokens: ["من", "___"], blanks: [{ index: 5, expected: ["آب"] }], mode: "type",
    };
    expect(drillSchema.safeParse({ language: "fa", exercises: [bad] }).success).toBe(false);
  });
  it("rejects duplicate exercise ids", () => {
    expect(drillSchema.safeParse({ language: "fa", exercises: [choice, { ...choice }] }).success).toBe(false);
  });
  it("rejects a tiles-mode cloze whose tile pool has no match for a blank", () => {
    const missing = {
      id: "c1", type: "cloze", prompt: { text: "fill" },
      tokens: ["من", "___", "می‌خورم"],
      blanks: [{ index: 1, expected: ["آب"] }], mode: "tiles", tiles: ["نان", "شیر"],
    };
    expect(drillSchema.safeParse({ language: "fa", exercises: [missing] }).success).toBe(false);
    const present = { ...missing, tiles: ["آب", "نان"] };
    expect(drillSchema.safeParse({ language: "fa", exercises: [present] }).success).toBe(true);
  });
  it("accepts all four types together", () => {
    const d = drillSchema.parse({
      language: "fa",
      exercises: [
        choice,
        { id: "t1", type: "typed", prompt: { term: "آب" }, expected: ["water"], input: "translation" },
        { id: "c1", type: "cloze", prompt: { text: "fill" }, tokens: ["من", "___", "می‌خورم"],
          blanks: [{ index: 1, expected: ["آب"] }], mode: "tiles", tiles: ["آب", "نان"] },
        { id: "m1", type: "match", prompt: { text: "match" },
          pairs: [{ left: "آب", right: "water" }, { left: "نان", right: "bread" }] },
      ],
    });
    expect(d.exercises.map((e) => e.type)).toEqual(["choice", "typed", "cloze", "match"]);
  });
});
