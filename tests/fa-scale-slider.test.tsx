import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FaScaleSlider } from "../src/components/FaScaleSlider";

describe("FaScaleSlider", () => {
  it("shows the initial value and scales the preview as it slides", () => {
    const { container, getByText } = render(<FaScaleSlider initial={125} />);
    expect(getByText("125%")).toBeTruthy();

    const preview = container.querySelector(".font-fa") as HTMLElement;
    expect(preview.style.getPropertyValue("--fa-scale")).toBe("1.25");

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.name).toBe("fa_scale");   // still submits with the settings form
    fireEvent.change(slider, { target: { value: "175" } });

    expect(getByText("175%")).toBeTruthy();
    expect(preview.style.getPropertyValue("--fa-scale")).toBe("1.75");
  });
});
