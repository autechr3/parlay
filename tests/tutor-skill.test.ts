import { describe, it, expect } from "vitest";
import {
  buildTutorSkill,
  tutorSkillFilename,
  buildBootstrapPrompt,
  buildFirstCurriculumGuidance,
  type TutorSkillParams,
} from "../src/lib/tutor-skill";

const TOOL_NAMES = [
  "get_study_state",
  "get_lesson",
  "get_due_vocab",
  "get_struggling_vocab",
  "search_vocab",
  "log_practice_session",
  "complete_lesson",
  "add_vocab",
  "import_content_package",
  "get_review_queue",
  "grade_card",
];

const faParams: TutorSkillParams = {
  languageCode: "fa",
  languageName: "Persian",
  siteUrl: "http://localhost:3000",
  flavor: "claude-skill",
};

describe("tutor-skill filename", () => {
  it("builds `${code}-tutor-skill.md`", () => {
    expect(tutorSkillFilename("fa")).toBe("fa-tutor-skill.md");
    expect(tutorSkillFilename("es")).toBe("es-tutor-skill.md");
  });
});

describe("tutor-skill frontmatter", () => {
  it("claude flavor starts with well-formed YAML frontmatter", () => {
    const skill = buildTutorSkill(faParams);
    expect(skill.startsWith("---\n")).toBe(true);
    const closeIdx = skill.indexOf("\n---", 4);
    expect(closeIdx).toBeGreaterThan(0);
    const frontmatter = skill.slice(4, closeIdx);
    expect(frontmatter).toContain("name: persian-tutor");
    expect(frontmatter).toContain(
      "description: Persian language tutor connected to the learner's Parlay app",
    );
    expect(frontmatter).toContain("tracks lessons, SRS vocabulary review, and authors curriculum content directly via MCP tools.");
  });

  it("claude flavor frontmatter block matches the exact contract", () => {
    const skill = buildTutorSkill(faParams);
    const expected = `---
name: persian-tutor
description: Persian language tutor connected to the learner's Parlay app — tracks lessons, SRS vocabulary review, and authors curriculum content directly via MCP tools.
---`;
    expect(skill.startsWith(expected)).toBe(true);
  });

  it("gpt flavor has NO frontmatter and opens with the tutor sentence", () => {
    const skill = buildTutorSkill({ ...faParams, flavor: "gpt-instructions" });
    expect(skill.startsWith("---")).toBe(false);
    expect(skill.startsWith("You are a Persian language tutor")).toBe(true);
  });

  it("slugifies a multi-word language name in the frontmatter `name` field", () => {
    const skill = buildTutorSkill({
      languageCode: "pt-br",
      languageName: "Brazilian Portuguese",
      siteUrl: "http://localhost:3000",
      flavor: "claude-skill",
    });
    expect(skill).toContain("name: brazilian-portuguese-tutor");
  });
});

describe("tutor-skill body sections", () => {
  it("includes all required headings, both flavors", () => {
    const headings = [
      "# Role",
      "# Session start",
      "# Running reviews",
      "# Teaching lessons",
      "# Authoring content (tool-first)",
      "# Content rules",
      "# When tools are unavailable",
    ];
    for (const flavor of ["claude-skill", "gpt-instructions"] as const) {
      const skill = buildTutorSkill({ ...faParams, flavor });
      for (const h of headings) {
        expect(skill).toContain(h);
      }
    }
  });

  it("mentions all 11 MCP tool names in workflow context", () => {
    const skill = buildTutorSkill(faParams);
    for (const name of TOOL_NAMES) {
      expect(skill).toContain(name);
    }
  });

  it("states the tool-first mandate — never hand the user JSON when tools are available", () => {
    const skill = buildTutorSkill(faParams);
    expect(skill.toLowerCase()).toContain("never hand the user json");
  });

  it("includes the grading rubric anchors", () => {
    const skill = buildTutorSkill(faParams);
    expect(skill).toContain("5");
    expect(skill).toMatch(/instant/i);
    expect(skill).toMatch(/slight hesitation/i);
    expect(skill).toMatch(/hard recall/i);
    expect(skill).toMatch(/wrong.but.recognized/i);
    expect(skill).toMatch(/blackout/i);
  });

  it("documents the MCP connection endpoint via siteUrl", () => {
    const skill = buildTutorSkill(faParams);
    expect(skill).toContain("# Connection");
    expect(skill).toContain("http://localhost:3000/api/mcp");
  });

  it("directs the fallback path to Library -> Advanced -> Manual import", () => {
    const skill = buildTutorSkill(faParams);
    expect(skill).toContain("http://localhost:3000/curriculums/import");
  });
});

describe("tutor-skill language rules", () => {
  it("includes Persian language rules for languageCode fa", () => {
    const skill = buildTutorSkill(faParams);
    expect(skill).toContain("Language rules (Persian)");
    expect(skill).toMatch(/ZWNJ|U\+200C/);
    expect(skill).toContain("می‌روم");
  });

  it("omits language rules for a non-fa language code", () => {
    const skill = buildTutorSkill({
      languageCode: "es",
      languageName: "Spanish",
      siteUrl: "http://localhost:3000",
      flavor: "claude-skill",
    });
    expect(skill).not.toContain("Language rules (Persian)");
    expect(skill).not.toMatch(/ZWNJ|U\+200C/);
  });
});

describe("buildBootstrapPrompt", () => {
  const p = { languageCode: "fa", languageName: "Persian", siteUrl: "http://localhost:3000" };

  it("covers all three platform connect paths with exact strings", () => {
    const prompt = buildBootstrapPrompt(p);
    expect(prompt).toContain("Settings → Connectors");
    expect(prompt).toContain("claude mcp add --transport http parlay");
    expect(prompt).toContain("ChatGPT");
  });

  it("interpolates the passed siteUrl into the connector URL, never a prod URL", () => {
    const prompt = buildBootstrapPrompt(p);
    expect(prompt).toContain("http://localhost:3000/api/mcp");
    expect(prompt).not.toMatch(/vercel\.app/);
  });

  it("names both tools the agent must call", () => {
    const prompt = buildBootstrapPrompt(p);
    expect(prompt).toContain("get_study_state");
    expect(prompt).toContain("get_tutor_instructions");
  });

  it("interpolates the language code for get_tutor_instructions", () => {
    const prompt = buildBootstrapPrompt(p);
    expect(prompt).toContain("fa");
  });

  it("stays short — at most 30 lines", () => {
    const prompt = buildBootstrapPrompt(p);
    expect(prompt.split("\n").length).toBeLessThanOrEqual(30);
  });

  it("contains no JSON or schema content — no braces at all", () => {
    const prompt = buildBootstrapPrompt(p);
    expect(prompt).not.toContain("{");
    expect(prompt).not.toContain("}");
  });

  it("tells the agent to wait for the user to confirm before verifying", () => {
    const prompt = buildBootstrapPrompt(p);
    expect(prompt.toLowerCase()).toMatch(/wait[\s\S]*confirm/);
  });
});

describe("buildFirstCurriculumGuidance", () => {
  it("mentions import_content_package as the authoring path", () => {
    const guidance = buildFirstCurriculumGuidance("Persian");
    expect(guidance).toContain("import_content_package");
  });

  it("covers the interview topics: pace, weekly time, interests, script-vs-transliteration", () => {
    const guidance = buildFirstCurriculumGuidance("Persian");
    expect(guidance.toLowerCase()).toMatch(/pace/);
    expect(guidance.toLowerCase()).toMatch(/weekly time|time per week|how much time/);
    expect(guidance.toLowerCase()).toMatch(/interests?/);
    expect(guidance.toLowerCase()).toMatch(/script|transliteration/);
  });

  it("uses the conditional 'no curriculum yet' framing", () => {
    const guidance = buildFirstCurriculumGuidance("Persian");
    expect(guidance).toMatch(/no curriculum yet/i);
  });

  it("never instructs the agent to output raw JSON", () => {
    const guidance = buildFirstCurriculumGuidance("Persian");
    expect(guidance).not.toContain("Output ONLY the JSON");
    expect(guidance.toLowerCase()).not.toMatch(/output.*only.*json/);
  });

  it("interpolates the language name", () => {
    const guidance = buildFirstCurriculumGuidance("Persian");
    expect(guidance).toContain("Persian");
  });
});

describe("tutor-skill morphology guidance is language-gated", () => {
  it("states the concrete present_stem/past_stem shape for fa", () => {
    const skill = buildTutorSkill(faParams);
    expect(skill).toContain("present_stem");
    expect(skill).toContain("past_stem");
  });

  it("does NOT claim present_stem/past_stem for a non-fa language, only the generic rule", () => {
    const skill = buildTutorSkill({
      languageCode: "es",
      languageName: "Spanish",
      siteUrl: "http://localhost:3000",
      flavor: "claude-skill",
    });
    expect(skill).not.toContain("present_stem");
    expect(skill).not.toContain("past_stem");
    expect(skill).toContain("morphology");
  });
});

describe("tutor-skill siteUrl interpolation", () => {
  it("interpolates the passed siteUrl and never hardcodes a production URL", () => {
    const skill = buildTutorSkill(faParams);
    expect(skill).not.toMatch(/vercel\.app/);
    expect(skill).not.toMatch(/https:\/\//); // localhost siteUrl is http-only; no https literal should sneak in
    // every siteUrl-derived link actually uses the localhost value passed in
    const occurrences = skill.split("http://localhost:3000").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // connection line + fallback import link
  });
});
