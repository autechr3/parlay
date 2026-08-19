import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ThemeProvider } from "../src/widgets/drill/theme";
import { ChoiceCard } from "../src/widgets/drill/components/ChoiceCard";
import { TypedCard } from "../src/widgets/drill/components/TypedCard";
import { MatchCard, seededShuffle } from "../src/widgets/drill/components/MatchCard";
import { themes } from "../src/lib/design/tokens";
import type { Exercise } from "../src/lib/exercises/schema";

const wrap = (ui: React.ReactNode) => render(<ThemeProvider theme={themes.light}>{ui}</ThemeProvider>);

describe("ChoiceCard", () => {
  const ex = { id: "e1", type: "choice", prompt: { text: "Which means water?" },
    options: [{ id: "a", text: "آب", script: true }, { id: "b", text: "نان", script: true }],
    correct_id: "a" } as Extract<Exercise, { type: "choice" }>;
  it("reports a correct answer and locks further taps", () => {
    const onAnswer = vi.fn();
    const { getByText } = wrap(<ChoiceCard exercise={ex} languageCode="fa" onAnswer={onAnswer} />);
    fireEvent.click(getByText("آب"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: true, answer_given: "a" }));
    fireEvent.click(getByText("نان"));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
});

describe("TypedCard", () => {
  const ex = { id: "t1", type: "typed", prompt: { text: "Type water in Farsi" },
    expected: ["آب"], input: "script" } as Extract<Exercise, { type: "typed" }>;
  it("normalizes the typed script answer", () => {
    const onAnswer = vi.fn();
    const { getByLabelText, getByText } = wrap(<TypedCard exercise={ex} languageCode="fa" onAnswer={onAnswer} />);
    fireEvent.change(getByLabelText("answer"), { target: { value: "آَب" } }); // stray fatha still correct
    fireEvent.click(getByText("Check"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
  it("renders the script keyboard for script input", () => {
    const { getByLabelText } = wrap(<TypedCard exercise={ex} languageCode="fa" onAnswer={vi.fn()} />);
    expect(getByLabelText("backspace")).toBeTruthy();
  });
});

describe("MatchCard", () => {
  const ex = { id: "m1", type: "match", prompt: { text: "Match" },
    pairs: [{ left: "آب", right: "water" }, { left: "نان", right: "bread" }] } as Extract<Exercise, { type: "match" }>;
  it("seededShuffle is deterministic", () => {
    expect(seededShuffle([1, 2, 3, 4], "m1")).toEqual(seededShuffle([1, 2, 3, 4], "m1"));
  });
  it("completes with correct=true when no misses", () => {
    const onAnswer = vi.fn();
    const { getByText } = wrap(<MatchCard exercise={ex} languageCode="fa" onAnswer={onAnswer} />);
    fireEvent.click(getByText("آب")); fireEvent.click(getByText("water"));
    fireEvent.click(getByText("نان")); fireEvent.click(getByText("bread"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
  it("counts a miss and reports correct=false", () => {
    const onAnswer = vi.fn();
    const { getByText } = wrap(<MatchCard exercise={ex} languageCode="fa" onAnswer={onAnswer} />);
    fireEvent.click(getByText("آب")); fireEvent.click(getByText("bread")); // miss
    fireEvent.click(getByText("آب")); fireEvent.click(getByText("water"));
    fireEvent.click(getByText("نان")); fireEvent.click(getByText("bread"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: false, answer_given: JSON.stringify({ misses: 1 }) }));
  });
});
