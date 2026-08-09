import { describe, it, expect } from "vitest";
import { parseLessonFile, parseVocabCsv, parseVocabTables } from "../src/lib/import-parsers";

const FM = `---
lesson: 04
unit: 1
title: Present Tense I
duration: 40 min lesson + 20 min homework
prerequisites: [L01, L02, L03]
grammar: [می- prefix, present stems, personal endings, داشتن exception]
new_vocab: 10 verbs + 8 time words
negar_drill: yes
---

# Lesson 04 — Present Tense I
body here
`;

describe("parseLessonFile", () => {
  const p = parseLessonFile("L04-present-tense-i.md", FM);
  it("core fields", () => {
    expect(p.number).toBe(4);
    expect(p.unit).toBe(1);
    expect(p.title).toBe("Present Tense I");
    expect(p.slug).toBe("present-tense-i");
  });
  it("sums duration minutes", () => expect(p.estimated_minutes).toBe(60));
  it("sums new_vocab numbers", () => expect(p.new_vocab_count).toBe(18));
  it("grammar array preserved", () => expect(p.grammar_points).toHaveLength(4));
  it("flags", () => {
    expect(p.is_review).toBe(false);
    expect(parseLessonFile("L05-saying-no-review1.md", FM).is_review).toBe(true);
    expect(parseLessonFile("L10-simple-past-review2.md", FM).is_assessment).toBe(false); // number from fm (4), not filename
  });
  it("body excludes frontmatter", () => expect(p.body_md).toContain("# Lesson 04"));
});

describe("parseVocabCsv", () => {
  it("handles quoted commas and empty stems", () => {
    const rows = parseVocabCsv(
      'lesson,farsi,translit,english,pos,present_stem,past_stem,colloquial\n' +
      '4,خوردن,khordan,"to eat, to drink",verb,خور,خورد,\n' +
      '1,ممنون,mamnun,thank you,phrase,,,مرسی\n'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].english).toBe("to eat, to drink");
    expect(rows[0].present_stem).toBe("خور");
    expect(rows[1].present_stem).toBeNull();
    expect(rows[1].colloquial).toBe("مرسی");
  });
});

describe("parseVocabTables", () => {
  it("parses a 3-col vocab table", () => {
    const md = `## 2. Vocabulary\n\n| Farsi | Translit | English |\n|---|---|---|\n| سلام | salâm | hello |\n`;
    expect(parseVocabTables(md)).toEqual([{ farsi: "سلام", translit: "salâm", english: "hello" }]);
  });
  it("parses a verb table with stems", () => {
    const md = `## 1. Grammar\n\n| Infinitive | Meaning | Present stem | 1sg |\n|---|---|---|---|\n| رفتن (raftan) | to go | **رو** rav‑ | می‌روم |\n`;
    expect(parseVocabTables(md)).toEqual([
      { farsi: "رفتن", translit: "raftan", english: "to go", present_stem: "رو" },
    ]);
  });
});
