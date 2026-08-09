import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseLessonFile, parseVocabCsv, parseVocabTables, parseExercises } from "../src/lib/import-parsers";
import { ContentPackageSchema, importContentPackage } from "../src/lib/content-package";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const OWNER_EMAIL = process.argv.includes("--user")
  ? process.argv[process.argv.indexOf("--user") + 1]
  : "mag@saf.com";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
    version: 1,
    course: { name: "Farsi", description: "Structured Farsi curriculum, generated lessons" },
    units: [...new Set(parsed.map((l) => l.unit))].map((n) => ({ number: n, title: `Unit ${n}` })),
    lessons: parsed.map((l) => ({
      number: l.number, title: l.title, unit: l.unit, slug: l.slug,
      grammar_points: l.grammar_points, estimated_minutes: l.estimated_minutes,
      is_review: l.is_review, is_assessment: l.is_assessment, body_md: l.body_md,
      vocab: csvLessons.has(l.number)
        ? csvRows.filter((r) => r.lesson === l.number).map((r) => ({
            farsi: r.farsi, transliteration: r.translit, english: r.english,
            part_of_speech: r.pos, present_stem: r.present_stem,
            past_stem: r.past_stem, colloquial: r.colloquial }))
        : parseVocabTables(l.body_md).map((v) => ({
            farsi: v.farsi, transliteration: v.translit, english: v.english,
            part_of_speech: v.present_stem ? "verb" : null,
            present_stem: v.present_stem ?? null })),
      exercises: (() => {
        const exs = parseExercises(l.body_md);
        return exs.length ? exs : undefined;   // undefined = leave existing alone
      })(),
    })),
  });

  const r = await importContentPackage(supabase, owner.id, pkg);
  console.log(`Imported course ${r.courseId}: ${r.lessons} lessons, ${r.units} units, ${r.vocab} vocab, ${r.exercises} exercises.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
