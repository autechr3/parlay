// vitest cannot resolve the "@/" alias, so import the modules under test relatively (see
// tests/curriculum-actions.test.ts for the same convention).
import { useState } from "react";
import { render, fireEvent, screen, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StepLanguage, type WizardLanguage } from "../src/components/wizard/StepLanguage";
import { StepSkill } from "../src/components/wizard/StepSkill";
import { StepConnect } from "../src/components/wizard/StepConnect";
import { StepCurriculum } from "../src/components/wizard/StepCurriculum";
import { Wizard } from "../src/components/wizard/Wizard";
import type { WelcomeStatus } from "../src/app/welcome/status/build";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const completeOnboardingMock = vi.fn().mockResolvedValue(undefined);
// Wizard.tsx / StepCurriculum.tsx both import this relatively (see their header comments) —
// vi.mock's specifier must match so both resolve to the same mocked module.
vi.mock("../src/app/welcome/actions", () => ({
  completeOnboarding: (...args: unknown[]) => completeOnboardingMock(...args),
}));

function makeStatus(overrides: Partial<WelcomeStatus> = {}): WelcomeStatus {
  return {
    hasToken: false,
    tokenName: null,
    curriculumCount: 0,
    firstCurriculumName: null,
    ...overrides,
  };
}

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

// StepSkill is no longer its own wizard step — it is deleted from the step rail but the
// component itself is unchanged and still fully functional; it now renders inside StepConnect's
// "Set up manually instead" <details>. These direct-render tests keep proving the component
// works standalone (tabs/copy/download), independent of where its parent mounts it.
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

describe("StepConnect", () => {
  const baseProps = {
    languageCode: "fa",
    languageName: "Persian",
    siteUrl: "http://localhost:3000",
  };

  it("renders a bootstrap prompt (from buildBootstrapPrompt) naming get_tutor_instructions", () => {
    const { container } = render(
      <StepConnect {...baseProps} aiTool="claude" onAiToolChange={() => {}} status={makeStatus()} />,
    );
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("get_tutor_instructions");
    expect(pre!.textContent).toContain("get_study_state");
  });

  it("copy button (for the bootstrap prompt) writes the prompt text to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const { container } = render(
      <StepConnect {...baseProps} aiTool="claude" onAiToolChange={() => {}} status={makeStatus()} />,
    );
    const pre = container.querySelector("pre")!;
    fireEvent.click(screen.getAllByText("Copy")[0]);
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(pre.textContent);
  });

  it("renders the connector URL as a copyable line beneath the prompt", () => {
    render(
      <StepConnect {...baseProps} aiTool="claude" onAiToolChange={() => {}} status={makeStatus()} />,
    );
    expect(screen.getAllByText("http://localhost:3000/api/mcp").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the neutral waiting strip when there is no token", () => {
    render(
      <StepConnect {...baseProps} aiTool="claude" onAiToolChange={() => {}} status={makeStatus()} />,
    );
    expect(screen.getByText(/Waiting for your AI tool to connect/)).toBeTruthy();
  });

  it("shows the connected strip with the token name once hasToken is true", () => {
    render(
      <StepConnect
        {...baseProps}
        aiTool="claude"
        onAiToolChange={() => {}}
        status={makeStatus({ hasToken: true, tokenName: "my-mac" })}
      />,
    );
    expect(screen.getByText(/✓ Connected.*my-mac.*active/)).toBeTruthy();
    expect(screen.queryByText(/Waiting for your AI tool to connect/)).toBeNull();
  });

  it("has a 'Set up manually instead' details section, collapsed by default, containing StepSkill content and the per-tool connector instructions", () => {
    const { container } = render(
      <StepConnect {...baseProps} aiTool="claude" onAiToolChange={() => {}} status={makeStatus()} />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBeFalsy();
    expect(screen.getByText("Set up manually instead")).toBeTruthy();

    // A known StepSkill string (its YAML frontmatter) is present in the DOM even though the
    // <details> is collapsed — jsdom doesn't apply the browser's UA-stylesheet visibility hiding,
    // so the content is reachable without simulating a click on <summary>.
    expect(details!.textContent).toContain("---\nname: persian-tutor");

    // The old per-tool connector instructions (moved out of StepConnect's main body) are also
    // present inside the details.
    const withinDetails = within(details!);
    expect(withinDetails.getByText(/Add custom connector/)).toBeTruthy();
  });

  it("shows the ChatGPT best-effort caveat (via the embedded StepSkill) only on the chatgpt tab", () => {
    const { rerender, queryByText } = render(
      <StepConnect {...baseProps} aiTool="claude" onAiToolChange={() => {}} status={makeStatus()} />,
    );
    expect(queryByText(/best-effort and untested/i)).toBeNull();

    rerender(
      <StepConnect {...baseProps} aiTool="chatgpt" onAiToolChange={() => {}} status={makeStatus()} />,
    );
    expect(queryByText(/best-effort and untested/i)).toBeTruthy();
  });
});

describe("StepCurriculum", () => {
  it("renders the waiting copy explaining the tutor will interview then import, and a waiting strip when there is no curriculum yet", () => {
    render(<StepCurriculum status={makeStatus()} onCurriculumArrived={() => {}} />);
    expect(screen.getByText(/interview you about pace and interests/)).toBeTruthy();
    expect(screen.getByText(/Waiting for your tutor to import a curriculum/)).toBeTruthy();
  });

  it("does NOT render a <pre> prompt block — the prompt moved to step 2's bootstrap prompt", () => {
    const { container } = render(<StepCurriculum status={makeStatus()} onCurriculumArrived={() => {}} />);
    expect(container.querySelector("pre")).toBeNull();
  });

  it("renders the imported strip with a Start learning link once curriculumCount > 0", () => {
    render(
      <StepCurriculum
        status={makeStatus({ curriculumCount: 1, firstCurriculumName: "Farsi A1" })}
        onCurriculumArrived={() => {}}
      />,
    );
    expect(screen.getByText(/✓ 'Farsi A1' imported/)).toBeTruthy();
    const link = screen.getByText("Start learning →").closest("a");
    expect(link?.getAttribute("href")).toBe("/lessons");
  });

  it("does not call onCurriculumArrived while curriculumCount is 0, but does once it is > 0", () => {
    const onCurriculumArrived = vi.fn();
    const { rerender } = render(
      <StepCurriculum status={makeStatus()} onCurriculumArrived={onCurriculumArrived} />,
    );
    expect(onCurriculumArrived).not.toHaveBeenCalled();

    rerender(
      <StepCurriculum
        status={makeStatus({ curriculumCount: 1, firstCurriculumName: "Farsi A1" })}
        onCurriculumArrived={onCurriculumArrived}
      />,
    );
    expect(onCurriculumArrived).toHaveBeenCalledTimes(1);

    // StepCurriculum itself does not guard against repeat calls — that guard is Wizard's job
    // (it stays mounted for the whole session, unlike this component, which remounts every time
    // the learner steps off step 3). This component's contract is simply "tell the parent
    // whenever curriculumCount > 0"; a rerender with an unchanged count is a no-op React bail-out,
    // not a call this component chose to suppress.
    rerender(
      <StepCurriculum
        status={makeStatus({ curriculumCount: 1, firstCurriculumName: "Farsi A1" })}
        onCurriculumArrived={onCurriculumArrived}
      />,
    );
    expect(onCurriculumArrived).toHaveBeenCalledTimes(1);

    rerender(
      <StepCurriculum
        status={makeStatus({ curriculumCount: 2, firstCurriculumName: "Farsi A1" })}
        onCurriculumArrived={onCurriculumArrived}
      />,
    );
    expect(onCurriculumArrived).toHaveBeenCalledTimes(2);
  });

  it("has an Advanced: manual import details section linking to /curriculums/import", () => {
    render(<StepCurriculum status={makeStatus()} onCurriculumArrived={() => {}} />);
    const summary = screen.getByText("Advanced: manual import");
    fireEvent.click(summary);
    const link = screen.getByText("import a content package manually").closest("a");
    expect(link?.getAttribute("href")).toBe("/curriculums/import");
  });
});

describe("Wizard", () => {
  const languages: WizardLanguage[] = [
    { code: "fa", name: "Persian", native_name: "فارسی", rtl: true },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    routerPush.mockClear();
    completeOnboardingMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function stubFetch(...responses: WelcomeStatus[]) {
    const fetchMock = vi.fn();
    for (const r of responses) {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => r });
    }
    // Any call beyond the queued responses (e.g. an extra tick the test doesn't advance to)
    // just repeats the last one rather than failing with an unmocked rejection.
    fetchMock.mockResolvedValue({ ok: true, json: async () => responses[responses.length - 1] });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  // Selecting a language now lands directly on step 2 (Connect your AI) — StepSkill is no longer
  // a standalone step in between, so there is no extra Next click required to reach it.
  function goToStep2() {
    fireEvent.click(screen.getByText("فارسی").closest("button")!); // step 1 -> 2
  }

  it("rail shows the three renumbered step labels", () => {
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);
    expect(screen.getByText("Choose language")).toBeTruthy();
    expect(screen.getByText("Connect your AI")).toBeTruthy();
    expect(screen.getByText("First curriculum")).toBeTruthy();
  });

  it("fetches /welcome/status immediately on entering step 2, then again on each 4s tick", async () => {
    const fetchMock = stubFetch(makeStatus());
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    goToStep2();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the connected strip with the token name once a poll returns hasToken", async () => {
    stubFetch(makeStatus(), makeStatus({ hasToken: true, tokenName: "my-mac" }));
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    goToStep2();
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await flush();

    expect(screen.getByText(/✓ Connected.*my-mac.*active/)).toBeTruthy();
  });

  it("on step 3, renders the Start learning link and calls completeOnboarding exactly once once a curriculum arrives", async () => {
    const fetchMock = stubFetch(
      makeStatus(), // step 2 immediate fetch
      makeStatus(), // step 3 immediate fetch
      makeStatus({ curriculumCount: 1, firstCurriculumName: "Farsi A1" }), // first 4s tick
    );
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    goToStep2();
    await flush();
    fireEvent.click(screen.getByText("Next")); // step 2 -> 3
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await flush();

    expect(screen.getByText(/✓ 'Farsi A1' imported/)).toBeTruthy();
    expect(screen.getByText("Start learning →").closest("a")?.getAttribute("href")).toBe("/lessons");
    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
    const callsAtArrival = fetchMock.mock.calls.length;
    expect(callsAtArrival).toBe(3);

    // Prove the interval itself was torn down, not just that a guard is hiding a leak: advance
    // three more 4s ticks' worth of time and assert the fetch call count does not grow at all —
    // if the interval had leaked, this would keep incrementing every 4s.
    await act(async () => {
      vi.advanceTimersByTime(12000);
    });
    await flush();
    expect(fetchMock.mock.calls.length).toBe(callsAtArrival);
    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
  });

  it("stops fetching once the Wizard unmounts while on step 2", async () => {
    const fetchMock = stubFetch(makeStatus());
    const { unmount } = render(
      <Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />,
    );

    goToStep2();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(12000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stepping Back from step 2 to step 1 stops polling entirely — no fetch on leaving, none on later ticks", async () => {
    const fetchMock = stubFetch(makeStatus());
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    goToStep2();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Back")); // step 2 -> 1
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // leaving step 2 fetches nothing extra

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // the interval was actually cleared, not just idle
  });

  it("stepping from step 3 Back to step 2 keeps polling and fetches immediately on the transition itself", async () => {
    const fetchMock = stubFetch(makeStatus());
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    goToStep2();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // entering step 2

    fireEvent.click(screen.getByText("Next")); // step 2 -> 3
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2); // entering step 3

    fireEvent.click(screen.getByText("Back")); // step 3 -> 2
    await flush();
    // The call count increments from the transition itself, before any 4s tick elapses.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("remounting StepCurriculum via Back(2)->Next(3) after arrival does not re-fire completeOnboarding", async () => {
    // Regression test: the "fire once" guard must live in Wizard (which stays mounted for the
    // whole session), not inside StepCurriculum (which unmounts every time the learner steps off
    // step 3) — otherwise a fresh StepCurriculum instance gets a fresh ref and re-fires.
    stubFetch(
      makeStatus(), // step 2 immediate fetch
      makeStatus(), // step 3 immediate fetch
      makeStatus({ curriculumCount: 1, firstCurriculumName: "Farsi A1" }), // first 4s tick
    );
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    goToStep2();
    await flush();
    fireEvent.click(screen.getByText("Next")); // step 2 -> 3
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await flush();
    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Back")); // step 3 -> 2, unmounts StepCurriculum
    await flush();
    fireEvent.click(screen.getByText("Next")); // step 2 -> 3, remounts a fresh StepCurriculum
    await flush();

    expect(screen.getByText(/✓ 'Farsi A1' imported/)).toBeTruthy();
    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
  });

  it("Finish on step 3 calls completeOnboarding and navigates to /curriculums", async () => {
    stubFetch(makeStatus());
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    goToStep2();
    await flush();
    fireEvent.click(screen.getByText("Next")); // step 2 -> 3
    await flush();

    fireEvent.click(screen.getByText("Finish"));
    await flush();

    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith("/curriculums");
  });

  it("Skip calls completeOnboarding and navigates to /curriculums", async () => {
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByText("Skip setup"));
    await flush();

    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith("/curriculums");
  });

  it("Skip still navigates to /curriculums when completeOnboarding rejects (logs, doesn't strand the learner)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    completeOnboardingMock.mockRejectedValueOnce(new Error("expired session"));
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    fireEvent.click(screen.getByText("Skip setup"));
    await flush();

    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith("/curriculums");
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("a rejected arrival-stamp retries on the next trigger — resolves on second attempt, called twice total", async () => {
    // The first attempt to stamp completeOnboarding on curriculum arrival fails. Wizard's own
    // /welcome/status polling never fires again after arrival (status.curriculumCount > 0 stops
    // it for good — see the fetch-effect's early return), so the only remaining trigger for a
    // retry is a fresh mount of StepCurriculum: Back(3->2) then Next(2->3) unmounts and remounts
    // it, and its mount effect re-checks status.curriculumCount independently of Wizard's ref.
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    completeOnboardingMock.mockRejectedValueOnce(new Error("transient failure"));
    stubFetch(
      makeStatus(), // step 2 immediate fetch
      makeStatus(), // step 3 immediate fetch
      makeStatus({ curriculumCount: 1, firstCurriculumName: "Farsi A1" }), // first 4s tick
    );
    render(<Wizard languages={languages} initialStatus={makeStatus()} siteUrl="http://localhost:3000" />);

    goToStep2();
    await flush();
    fireEvent.click(screen.getByText("Next")); // step 2 -> 3
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await flush();

    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/✓ 'Farsi A1' imported/)).toBeTruthy();

    fireEvent.click(screen.getByText("Back")); // step 3 -> 2, unmounts StepCurriculum
    await flush();
    fireEvent.click(screen.getByText("Next")); // step 2 -> 3, remounts StepCurriculum, retries the stamp
    await flush();

    expect(completeOnboardingMock).toHaveBeenCalledTimes(2);
    consoleErrorSpy.mockRestore();
  });
});
