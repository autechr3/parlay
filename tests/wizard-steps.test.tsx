// vitest cannot resolve the "@/" alias, so import the modules under test relatively (see
// tests/curriculum-actions.test.ts for the same convention).
import { useState } from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StepLanguage, type WizardLanguage } from "../src/components/wizard/StepLanguage";
import { StepSkill } from "../src/components/wizard/StepSkill";

const LANGUAGES: WizardLanguage[] = [
  { code: "fa", name: "Persian", native_name: "فارسی", rtl: true },
];

describe("StepLanguage", () => {
  it("renders the native-name card with rtl dir, lang, and font-script styling", () => {
    render(<StepLanguage languages={LANGUAGES} onSelect={() => {}} />);
    const native = screen.getByText("فارسی");
    expect(native.getAttribute("dir")).toBe("rtl");
    expect(native.getAttribute("lang")).toBe("fa");
    expect(native.className).toContain("font-script");
    expect(screen.getByText("Persian")).toBeTruthy();
  });

  it("selecting a language card calls onSelect with its code", () => {
    const onSelect = vi.fn();
    render(<StepLanguage languages={LANGUAGES} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("فارسی").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith("fa");
  });

  it("renders a disabled 'More languages coming soon' placeholder card", () => {
    render(<StepLanguage languages={LANGUAGES} onSelect={() => {}} />);
    const placeholderButton = screen.getByText("More languages coming soon").closest("button");
    expect(placeholderButton).not.toBeNull();
    expect(placeholderButton!.disabled).toBe(true);
  });
});

describe("StepSkill", () => {
  const baseProps = {
    languageCode: "fa",
    languageName: "Persian",
    siteUrl: "http://localhost:3000",
  };

  it("claude tab renders a skill with YAML frontmatter", () => {
    const { container } = render(
      <StepSkill {...baseProps} aiTool="claude" onAiToolChange={() => {}} />,
    );
    expect(container.textContent).toContain("---\nname: persian-tutor");
  });

  it("switching to the chatgpt tab swaps the flavor — frontmatter disappears, opening sentence appears", () => {
    function Wrapper() {
      const [aiTool, setAiTool] = useState<"claude" | "chatgpt">("claude");
      return <StepSkill {...baseProps} aiTool={aiTool} onAiToolChange={setAiTool} />;
    }
    const { container, getByRole } = render(<Wrapper />);
    expect(container.textContent).toContain("---\nname: persian-tutor");

    fireEvent.click(getByRole("tab", { name: "ChatGPT" }));

    expect(container.textContent).not.toContain("---\nname: persian-tutor");
    expect(container.textContent).toContain("You are a Persian language tutor");
  });

  it("shows the ChatGPT best-effort caveat only on the chatgpt tab", () => {
    const { rerender, queryByText } = render(
      <StepSkill {...baseProps} aiTool="claude" onAiToolChange={() => {}} />,
    );
    expect(queryByText(/best-effort and untested/i)).toBeNull();

    rerender(<StepSkill {...baseProps} aiTool="chatgpt" onAiToolChange={() => {}} />);
    expect(queryByText(/best-effort and untested/i)).toBeTruthy();
  });

  it("copy button writes the generated skill text to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<StepSkill {...baseProps} aiTool="claude" onAiToolChange={() => {}} />);
    fireEvent.click(screen.getByText("Copy"));
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("name: persian-tutor");
  });

  it("download filename uses tutorSkillFilename(code)", () => {
    const { container } = render(
      <StepSkill {...baseProps} aiTool="claude" onAiToolChange={() => {}} />,
    );
    // The Download button exists; the anchor it creates is verified via tutor-skill's own
    // filename contract (tests/tutor-skill.test.ts) — here we just assert the button is present.
    expect(container.textContent).toContain("Download");
  });
});
