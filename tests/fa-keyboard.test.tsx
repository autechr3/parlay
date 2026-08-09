import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FaKeyboard } from "../src/components/FaKeyboard";

describe("FaKeyboard", () => {
  it("emits characters, ZWNJ, space, backspace", () => {
    const onKey = vi.fn(); const onBackspace = vi.fn();
    const { getByText, getByLabelText } = render(
      <FaKeyboard onKey={onKey} onBackspace={onBackspace} />);
    fireEvent.click(getByText("ک"));
    expect(onKey).toHaveBeenCalledWith("ک");
    fireEvent.click(getByText("نیم‌فاصله"));
    expect(onKey).toHaveBeenCalledWith("‌");
    fireEvent.click(getByLabelText("space"));
    expect(onKey).toHaveBeenCalledWith(" ");
    fireEvent.click(getByLabelText("backspace"));
    expect(onBackspace).toHaveBeenCalled();
  });
  it("renders all 32 Persian letters", () => {
    const { getByText } = render(<FaKeyboard onKey={() => {}} onBackspace={() => {}} />);
    for (const ch of "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی") expect(getByText(ch)).toBeTruthy();
  });
});
