import { describe, it, expect } from "vitest";
import { themes, radius, space, font } from "../src/lib/design/tokens";

describe("design tokens", () => {
  it("defines complete light and dark themes with identical key sets", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(themes.light)).toEqual(keys(themes.dark));
    for (const t of [themes.light, themes.dark]) {
      for (const v of Object.values(t)) expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
  it("spacing is a 4px scale", () => {
    expect(space(0)).toBe(0);
    expect(space(4)).toBe(16);
  });
  it("script font stack leads with Estedad", () => {
    expect(font.script.startsWith("'Estedad'")).toBe(true);
    expect(radius.pill).toBe(999);
  });
});
