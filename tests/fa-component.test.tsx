import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Fa } from "../src/components/Fa";

describe("Fa", () => {
  it("renders RTL Persian span with lang and font class", () => {
    const { container } = render(<Fa>می‌روم</Fa>);
    const span = container.querySelector("span")!;
    expect(span.getAttribute("dir")).toBe("rtl");
    expect(span.getAttribute("lang")).toBe("fa");
    expect(span.className).toContain("font-fa");
    // ZWNJ must survive rendering untouched
    expect(span.textContent).toBe("می‌روم");
  });
});
