import { describe, it, expect } from "vitest";
import { ContentPackageSchema, slugify } from "../src/lib/content-package";

const minimal = {
  format: "farsi-tracker/content-package", version: 1,
  course: { name: "Farsi A1" },
  lessons: [{ number: 1, title: "Greetings" }],
};

describe("ContentPackageSchema", () => {
  it("accepts a minimal package", () =>
    expect(ContentPackageSchema.safeParse(minimal).success).toBe(true));
  it("rejects wrong format string", () =>
    expect(ContentPackageSchema.safeParse({ ...minimal, format: "x" }).success).toBe(false));
  it("rejects lesson without number", () => {
    const bad = { ...minimal, lessons: [{ title: "no number" }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects unknown exercise type", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      exercises: [{ type: "multiple_choice", prompt: "p", answer: "a" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
});

describe("slugify", () => {
  it("derives clean slugs", () =>
    expect(slugify("Ezâfe — the Persian Glue!")).toBe("ez-fe-the-persian-glue"));
});
