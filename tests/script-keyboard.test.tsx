import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ScriptKeyboard } from "../src/components/ScriptKeyboard";
import { KEYBOARD_LAYOUT } from "../src/lib/languages/fa";

const SMALL_LAYOUT = [
  ["ا", "ب"],
  ["پ", "ت"],
];

describe("ScriptKeyboard", () => {
  it("renders rows from the layout prop and emits characters/backspace/space", () => {
    const onKey = vi.fn();
    const onBackspace = vi.fn();
    const { getByText, getByLabelText } = render(
      <ScriptKeyboard layout={SMALL_LAYOUT} onKey={onKey} onBackspace={onBackspace} />
    );
    fireEvent.click(getByText("ا"));
    expect(onKey).toHaveBeenCalledWith("ا");
    fireEvent.click(getByText("نیم‌فاصله"));
    expect(onKey).toHaveBeenCalledWith("‌");
    fireEvent.click(getByLabelText("space"));
    expect(onKey).toHaveBeenCalledWith(" ");
    fireEvent.click(getByLabelText("backspace"));
    expect(onBackspace).toHaveBeenCalled();
  });

  it("does not render keys outside the given layout", () => {
    const { queryByText } = render(
      <ScriptKeyboard layout={SMALL_LAYOUT} onKey={() => {}} onBackspace={() => {}} />
    );
    expect(queryByText("گ")).toBeNull();
  });

  it("keys carry font-script styling", () => {
    const { getByText } = render(
      <ScriptKeyboard layout={SMALL_LAYOUT} onKey={() => {}} onBackspace={() => {}} />
    );
    expect(getByText("ا").className).toContain("font-script");
  });

  it("renders all letters of the real fa KEYBOARD_LAYOUT", () => {
    const { getByText } = render(
      <ScriptKeyboard layout={KEYBOARD_LAYOUT} onKey={() => {}} onBackspace={() => {}} />
    );
    for (const ch of "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی") expect(getByText(ch)).toBeTruthy();
  });

  it("defaults to rtl dir and a Persian aria-label, overridable via rtl/label props", () => {
    const { getByLabelText, rerender } = render(
      <ScriptKeyboard layout={SMALL_LAYOUT} onKey={() => {}} onBackspace={() => {}} />
    );
    const defaultRoot = getByLabelText("Persian keyboard");
    expect(defaultRoot.getAttribute("dir")).toBe("rtl");

    rerender(
      <ScriptKeyboard layout={SMALL_LAYOUT} onKey={() => {}} onBackspace={() => {}}
        rtl={false} label="Custom keyboard" />
    );
    const overriddenRoot = getByLabelText("Custom keyboard");
    expect(overriddenRoot.getAttribute("dir")).toBe("ltr");
  });
});
