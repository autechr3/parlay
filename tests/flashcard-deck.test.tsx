import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FlashcardDeck, shuffle } from "../src/components/FlashcardDeck";

const cards = [
  { id: "1", farsi: "کتاب", translit: "ketâb", english: "book", kind: "vocab" as const },
  { id: "2", farsi: "رفتن", translit: "raftan", english: "to go", kind: "verb" as const,
    presentStem: "رو", pastStem: "رفت" },
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
    const { container, getByText } = render(<FlashcardDeck cards={cards} />);
    expect(getByText("کتاب")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });     // -> verb card
    expect(getByText("رفتن")).toBeTruthy();
    fireEvent.keyDown(window, { key: " " });              // flip
    expect(getByText("می‌روم")).toBeTruthy();              // present 1sg
    expect(getByText("رفتم")).toBeTruthy();                // past 1sg
    expect(container.textContent).toContain("من");
  });
  it("shows script, transliteration, and english together on vocab flip", () => {
    const { getByText } = render(<FlashcardDeck cards={cards} />);
    fireEvent.keyDown(window, { key: " " });              // flip vocab card
    expect(getByText("کتاب")).toBeTruthy();
    expect(getByText("ketâb")).toBeTruthy();
    expect(getByText("book")).toBeTruthy();
  });
  it("counter uses positions", () => {
    const { getByText } = render(<FlashcardDeck cards={cards} />);
    expect(getByText(/1\s*\/\s*2/)).toBeTruthy();
  });
});
