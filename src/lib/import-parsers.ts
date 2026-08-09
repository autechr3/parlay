import { load as yamlLoad, CORE_SCHEMA } from "js-yaml";
import { parse as csvParse } from "csv-parse/sync";

export type ParsedLesson = {
  number: number; unit: number; title: string; slug: string; filename: string;
  grammar_points: string[]; new_vocab_count: number | null; estimated_minutes: number;
  is_review: boolean; is_assessment: boolean; body_md: string;
};

const sumNumbers = (s: string): number =>
  (s.match(/\d+/g) ?? []).reduce((a, n) => a + Number(n), 0);

export function parseLessonFile(filename: string, raw: string): ParsedLesson {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error(`${filename}: no YAML frontmatter`);
  // js-yaml load() is safe by default; CORE_SCHEMA pins it to plain data types only.
  // Installed js-yaml is v5, which (unlike v4) has no default export in ESM, so we
  // use named imports (load, CORE_SCHEMA) instead of the brief's `yaml.load(...)`.
  const fm = yamlLoad(m[1], { schema: CORE_SCHEMA }) as Record<string, unknown>;
  const number = Number(fm.lesson);
  const durations = String(fm.duration ?? "");
  return {
    number,
    unit: Number(fm.unit),
    title: String(fm.title),
    slug: filename.replace(/^L\d+-/, "").replace(/\.md$/i, ""),
    filename,
    grammar_points: Array.isArray(fm.grammar) ? fm.grammar.map(String) : [],
    new_vocab_count: fm.new_vocab != null ? sumNumbers(String(fm.new_vocab)) : null,
    estimated_minutes: durations ? sumNumbers(durations) : 60,
    is_review: /review/i.test(filename),
    is_assessment: number % 10 === 0,
    body_md: raw.slice(m[0].length),
  };
}

export type CsvVocabRow = {
  lesson: number; farsi: string; translit: string; english: string;
  pos: string | null; present_stem: string | null; past_stem: string | null;
  colloquial: string | null;
};

export function parseVocabCsv(raw: string): CsvVocabRow[] {
  const records = csvParse(raw, { columns: true, skip_empty_lines: true, trim: false }) as
    Record<string, string>[];
  const nn = (s: string | undefined) => {
    const v = (s ?? "").trim();
    return v === "" ? null : v;
  };
  return records.map((r) => ({
    lesson: Number(r.lesson),
    farsi: r.farsi.trim(),          // plain spaces only; ZWNJ is U+200C and untouched by trim
    translit: r.translit.trim(),
    english: r.english.trim(),
    pos: nn(r.pos),
    present_stem: nn(r.present_stem),
    past_stem: nn(r.past_stem),
    colloquial: nn(r.colloquial),
  }));
}

export function parseVocabTables(bodyMd: string) {
  const out: { farsi: string; translit: string; english: string; present_stem?: string }[] = [];
  const lines = bodyMd.split(/\r?\n/);
  let header: string[] | null = null;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) { header = null; continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    if (!header) { header = cells.map((c) => c.toLowerCase()); continue; }

    if (header[0].includes("infinitive")) {
      // | رفتن (raftan) | to go | **رو** rav‑ | می‌روم |
      const im = cells[0].match(/^(\S+)\s*\(([^)]+)\)/);
      const sm = cells[2]?.match(/\*\*(.+?)\*\*/);
      if (im && sm) out.push({
        farsi: im[1], translit: im[2], english: cells[1].replace(/\*/g, "").trim(),
        present_stem: sm[1],
      });
    } else if (
      (header[0].includes("farsi") || header[0].includes("فارسی")) && cells.length >= 3
    ) {
      out.push({ farsi: cells[0], translit: cells[1], english: cells[2] });
    }
  }
  return out;
}

export function parseExercises(bodyMd: string) {
  const m = bodyMd.match(/```exercises\r?\n([\s\S]*?)```/);
  if (!m) return [];
  const list = yamlLoad(m[1], { schema: CORE_SCHEMA }) as Record<string, unknown>[];
  if (!Array.isArray(list)) return [];
  return list.map((e) => ({
    type: String(e.type),
    prompt: String(e.prompt),
    answer: String(e.answer),
    accept: Array.isArray(e.accept) ? e.accept.map(String) : [],
    hint: e.hint != null ? String(e.hint) : null,
  }));
}
