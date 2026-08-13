import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TermText } from "../src/components/TermText";

describe("TermText", () => {
  it("cycles term -> translit -> translation -> term on click", () => {
    const { getByRole } = render(
      <TermText term="کتاب" translit="ketâb" translation="book" />
    );
    const el = getByRole("button");
    expect(el.textContent).toBe("کتاب");
    fireEvent.click(el);
    expect(el.textContent).toBe("ketâb");
    fireEvent.click(el);
    expect(el.textContent).toBe("book");
    fireEvent.click(el);
    expect(el.textContent).toBe("کتاب");
  });
  it("skips missing translit", () => {
    const { getByRole } = render(<TermText term="کتاب" translation="book" />);
    fireEvent.click(getByRole("button"));
    expect(getByRole("button").textContent).toBe("book");
  });
  it("locked does not cycle", () => {
    const { getByText } = render(
      <TermText term="کتاب" translation="book" locked />
    );
    fireEvent.click(getByText("کتاب"));
    expect(getByText("کتاب")).toBeTruthy();
  });
  it("script stage is RTL with lang=fa by default", () => {
    const { container } = render(
      <TermText term="کتاب" translation="book" />
    );
    const span = container.querySelector('span[dir="rtl"]')!;
    expect(span.getAttribute("lang")).toBe("fa");
    expect(span.className).toContain("font-script");
  });
  it("Enter key cycles stages", () => {
    const { getByRole } = render(
      <TermText term="کتاب" translation="book" />
    );
    fireEvent.keyDown(getByRole("button"), { key: "Enter" });
    expect(getByRole("button").textContent).toBe("book");
  });
  it("rtl=false renders dir=ltr", () => {
    const { container } = render(
      <TermText term="hallo" translation="hello" rtl={false} langCode="de" />
    );
    const span = container.querySelector('span[dir="ltr"]')!;
    expect(span).toBeTruthy();
  });
  it("langCode lands on the lang attribute", () => {
    const { container } = render(
      <TermText term="hallo" translation="hello" rtl={false} langCode="de" />
    );
    const span = container.querySelector('span[dir="ltr"]')!;
    expect(span.getAttribute("lang")).toBe("de");
  });
});
