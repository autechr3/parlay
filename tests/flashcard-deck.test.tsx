import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FlashcardDeck, type DeckCard, shuffle } from "../src/components/FlashcardDeck";

const cards: DeckCard[] = [
  { id: "1", term: "کتاب", translit: "ketâb", translation: "book", kind: "vocab" },
  { id: "2", term: "رفتن", translit: "raftan", translation: "to go", kind: "verb",
    morphology: { present_stem: "رو", past_stem: "رفت" } },
];

describe("shuffle", () => {
  it("is deterministic for a seed and keeps all items", () => {
    const a = shuffle([1, 2, 3, 4, 5], 42);
    expect(a).toEqual(shuffle([1, 2, 3, 4, 5], 42));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("FlashcardDeck", () => {
  it("navigates with arrows and shows verb conjugations on flip", () => {
    const { container, getByText } = render(<FlashcardDeck cards={cards} langCode="fa" />);
    expect(getByText("کتاب")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });     // -> verb card
    expect(getByText("رفتن")).toBeTruthy();
    fireEvent.keyDown(window, { key: " " });              // flip
    expect(getByText("می‌روم")).toBeTruthy();              // present 1sg
    expect(getByText("رفتم")).toBeTruthy();                // past 1sg
    expect(container.textContent).toContain("من");
  });
  it("shows script, transliteration, and translation together on vocab flip", () => {
    const { getByText } = render(<FlashcardDeck cards={cards} langCode="fa" />);
    fireEvent.keyDown(window, { key: " " });              // flip vocab card
    expect(getByText("کتاب")).toBeTruthy();
    expect(getByText("ketâb")).toBeTruthy();
    expect(getByText("book")).toBeTruthy();
  });
  it("counter uses positions", () => {
    const { getByText } = render(<FlashcardDeck cards={cards} langCode="fa" />);
    expect(getByText(/1\s*\/\s*2/)).toBeTruthy();
  });
  it("a verb card with morphology:null does not render a conjugation table", () => {
    const noStemCards: DeckCard[] = [
      { id: "3", term: "دیدن", translit: "didan", translation: "to see", kind: "verb", morphology: null },
    ];
    const { container, getByText } = render(<FlashcardDeck cards={noStemCards} langCode="fa" />);
    fireEvent.keyDown(window, { key: " " });              // flip
    expect(container.querySelector("table")).toBeNull();
    // falls back to the same vocab-style detail view
    expect(getByText("didan")).toBeTruthy();
    expect(getByText("to see")).toBeTruthy();
  });
});
