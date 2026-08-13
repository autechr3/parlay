import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ScriptScaleSlider } from "../src/components/ScriptScaleSlider";

describe("ScriptScaleSlider", () => {
  it("shows the initial value and scales the preview as it slides", () => {
    const { container, getByText } = render(
      <ScriptScaleSlider initial={125} sampleText="خواهش می‌کنم" rtl langCode="fa" />
    );
    expect(getByText("125%")).toBeTruthy();
    expect(getByText("Script size")).toBeTruthy();

    const preview = container.querySelector(".font-script") as HTMLElement;
    expect(preview.style.getPropertyValue("--script-scale")).toBe("1.25");

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider.name).toBe("script_scale");
    fireEvent.change(slider, { target: { value: "175" } });

    expect(getByText("175%")).toBeTruthy();
    expect(preview.style.getPropertyValue("--script-scale")).toBe("1.75");
  });
});
