import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseLessonFile, parseVocabCsv, parseVocabTables, parseExercises } from "../src/lib/import-parsers";
import { ContentPackageSchema, importContentPackage } from "../src/lib/content-package";

// .env.local is optional here (CI/fresh checkouts may rely on real env vars instead) — a missing
// file must not crash the script before the usage guard below gets a chance to print a message.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const OWNER_EMAIL = process.argv.includes("--user")
  ? process.argv[process.argv.indexOf("--user") + 1]
  : "mag@saf.com";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Usage: npx tsx scripts/seed-lessons.ts [--user <email>]\n" +
    "Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, either in .env.local or the environment.",
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  const { data: owner, error: oErr } = await supabase.from("profiles")
    .select("id").eq("email", OWNER_EMAIL).single();
  if (oErr || !owner) throw new Error(`no profile for ${OWNER_EMAIL} — sign that user up first`);

  const dir = "content/lessons";
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const parsed = files.map((f) => parseLessonFile(f, readFileSync(join(dir, f), "utf8")));
  const csvRows = existsSync("content/vocab.csv")
    ? parseVocabCsv(readFileSync("content/vocab.csv", "utf8")) : [];
  const csvLessons = new Set(csvRows.map((r) => r.lesson));

  const pkg = ContentPackageSchema.parse({
    format: "farsi-tracker/content-package",
    version: 2,
    curriculum: { name: "Farsi", language: "fa", description: "Structured Farsi curriculum, generated lessons" },
    units: [...new Set(parsed.map((l) => l.unit))].map((n) => ({ number: n, title: `Unit ${n}` })),
    lessons: parsed.map((l) => ({
      number: l.number, title: l.title, unit: l.unit, slug: l.slug,
      grammar_points: l.grammar_points, estimated_minutes: l.estimated_minutes,
      is_review: l.is_review, is_assessment: l.is_assessment, body_md: l.body_md,
      vocab: csvLessons.has(l.number)
        ? csvRows.filter((r) => r.lesson === l.number).map((r) => ({
            term: r.farsi, transliteration: r.translit, translation: r.english,
            part_of_speech: r.pos,
            ...(r.present_stem || r.past_stem
              ? { morphology: { ...(r.present_stem ? { present_stem: r.present_stem } : {}),
                                ...(r.past_stem ? { past_stem: r.past_stem } : {}) } }
              : {}),
            colloquial: r.colloquial }))
        : parseVocabTables(l.body_md).map((v) => ({
            term: v.farsi, transliteration: v.translit, translation: v.english,
            part_of_speech: v.present_stem ? "verb" : null,
            ...(v.present_stem ? { morphology: { present_stem: v.present_stem } } : {}) })),
      exercises: (() => {
        const exs = parseExercises(l.body_md);
        return exs.length ? exs : undefined;   // undefined = leave existing alone
      })(),
    })),
  });

  const r = await importContentPackage(supabase, owner.id, pkg);
  console.log(`Imported curriculum ${r.curriculumId}: ${r.lessons} lessons, ${r.units} units, ${r.vocab} vocab, ${r.exercises} exercises.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
