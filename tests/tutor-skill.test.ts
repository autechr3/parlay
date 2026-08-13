import { describe, it, expect } from "vitest";
import { buildTutorSkill, tutorSkillFilename, type TutorSkillParams } from "../src/lib/tutor-skill";

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
      "description: Persian language tutor connected to the learner's Farsi Progress Tracker app",
    );
    expect(frontmatter).toContain("tracks lessons, SRS vocabulary review, and authors curriculum content directly via MCP tools.");
  });

  it("claude flavor frontmatter block matches the exact contract", () => {
    const skill = buildTutorSkill(faParams);
    const expected = `---
name: persian-tutor
description: Persian language tutor connected to the learner's Farsi Progress Tracker app — tracks lessons, SRS vocabulary review, and authors curriculum content directly via MCP tools.
---`;
    expect(skill.startsWith(expected)).toBe(true);
  });

  it("gpt flavor has NO frontmatter and opens with the tutor sentence", () => {
    const skill = buildTutorSkill({ ...faParams, flavor: "gpt-instructions" });
    expect(skill.startsWith("---")).toBe(false);
    expect(skill.startsWith("You are a Persian language tutor")).toBe(true);
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
