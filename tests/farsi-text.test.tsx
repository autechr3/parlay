import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FarsiText } from "../src/components/FarsiText";

describe("FarsiText", () => {
  it("cycles farsi -> translit -> english -> farsi on click", () => {
    const { getByRole } = render(<FarsiText farsi="کتاب" translit="ketâb" english="book" />);
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
    const { getByRole } = render(<FarsiText farsi="کتاب" english="book" />);
    fireEvent.click(getByRole("button"));
    expect(getByRole("button").textContent).toBe("book");
  });
  it("locked does not cycle", () => {
    const { getByText } = render(<FarsiText farsi="کتاب" english="book" locked />);
    fireEvent.click(getByText("کتاب"));
    expect(getByText("کتاب")).toBeTruthy();
  });
  it("farsi stage is RTL with lang=fa", () => {
    const { container } = render(<FarsiText farsi="کتاب" english="book" />);
    const span = container.querySelector('span[dir="rtl"]')!;
    expect(span.getAttribute("lang")).toBe("fa");
  });
  it("Enter key cycles stages", () => {
    const { getByRole } = render(<FarsiText farsi="کتاب" english="book" />);
    fireEvent.keyDown(getByRole("button"), { key: "Enter" });
    expect(getByRole("button").textContent).toBe("book");
  });
});
