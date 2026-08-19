import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ThemeProvider } from "../src/widgets/drill/theme";
import { DrillPlayer } from "../src/widgets/drill/components/DrillPlayer";
import { themes } from "../src/lib/design/tokens";
import type { Drill } from "../src/lib/exercises/schema";

const drill: Drill = {
  language: "fa", srs_default: true, title: "test",
  exercises: [
    { id: "e1", type: "choice", prompt: { text: "water?" },
      options: [{ id: "a", text: "آب" }, { id: "b", text: "نان" }], correct_id: "a" },
    { id: "c1", type: "cloze", prompt: { text: "fill" }, tokens: ["من", "___"],
      blanks: [{ index: 1, expected: ["آب"] }], mode: "tiles", tiles: ["آب", "نان"] },
  ],
};

describe("DrillPlayer", () => {
  it("advances through exercises, emits one attempt each, then completes once", () => {
    const onAttempt = vi.fn();
    const onComplete = vi.fn();
    const { getByText } = render(
      <ThemeProvider theme={themes.light}>
        <DrillPlayer drill={drill} languageCode="fa" theme={themes.light}
          onAttempt={onAttempt} onComplete={onComplete} />
      </ThemeProvider>,
    );
    fireEvent.click(getByText("آب"));                    // choice: correct
    fireEvent.click(getByText("Continue"));
    fireEvent.click(getByText("نان"));                   // cloze tile: wrong fill
    fireEvent.click(getByText("Check"));
    fireEvent.click(getByText("Continue"));
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt.mock.calls[0][0]).toMatchObject({ exercise_id: "e1", correct: true });
    expect(onAttempt.mock.calls[1][0]).toMatchObject({ exercise_id: "c1", correct: false });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ total: 2, correct: 1 });
    expect(getByText("1/2")).toBeTruthy();               // summary score
  });
});
