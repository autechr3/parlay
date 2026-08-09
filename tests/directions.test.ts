import { describe, it, expect } from "vitest";
import { pickDirection } from "../src/lib/directions";

describe("pickDirection", () => {
  it("recognition until 2 reps", () => {
    expect(pickDirection("noun", 0)).toBe("fa_to_en");
    expect(pickDirection("verb", 1)).toBe("fa_to_en");
  });
  it("non-verbs alternate after unlock", () => {
    expect(pickDirection("noun", 2)).toBe("fa_to_en");
    expect(pickDirection("noun", 3)).toBe("en_to_fa");
  });
  it("verbs cycle with stem first", () => {
    expect(pickDirection("verb", 2)).toBe("stem");
    expect(pickDirection("verb", 3)).toBe("fa_to_en");
    expect(pickDirection("verb", 4)).toBe("en_to_fa");
    expect(pickDirection("verb", 5)).toBe("stem");
  });
  it("verbs without a present stem fall through to the non-verb alternation", () => {
    expect(pickDirection("verb", 2, false)).toBe("fa_to_en");
    expect(pickDirection("verb", 3, false)).toBe("en_to_fa");
  });
});
