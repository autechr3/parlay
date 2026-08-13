// Upconverts a v1 content package (format "farsi-tracker/content-package", version 1) to the
// v2 shape consumed by ContentPackageSchema. v1 was Farsi-only, so the target language is
// always "fa". Field renames follow the Task 5 brief's Rename Map:
//   course → curriculum (+ language:"fa"); farsi → term; farsi_vocalized → term_vocalized;
//   english → translation; en_to_fa → to_target; fa_to_en → from_target;
//   present_stem/past_stem → morphology.{present_stem,past_stem}
// Anything already at version 2 (or otherwise not recognizably v1) passes through untouched —
// ContentPackageSchema.parse is the actual gate for validity.

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

function convertVocab(v: unknown): unknown {
  if (!isRecord(v)) return v;
  const { farsi, farsi_vocalized, english, present_stem, past_stem, ...rest } = v;

  const morphology: Record<string, string> = {};
  if (typeof present_stem === "string") morphology.present_stem = present_stem;
  if (typeof past_stem === "string") morphology.past_stem = past_stem;

  return {
    ...rest,
    term: farsi,
    translation: english,
    ...(farsi_vocalized !== undefined ? { term_vocalized: farsi_vocalized } : {}),
    // presence-aware: only attach morphology when a v1 stem was actually supplied
    ...(Object.keys(morphology).length > 0 ? { morphology } : {}),
  };
}

function convertExerciseType(type: unknown): unknown {
  if (type === "en_to_fa") return "to_target";
  if (type === "fa_to_en") return "from_target";
  return type; // cloze / scramble / anything unrecognized pass through for schema to reject
}

function convertExercise(e: unknown): unknown {
  if (!isRecord(e)) return e;
  return { ...e, type: convertExerciseType(e.type) };
}

function convertLesson(l: unknown): unknown {
  if (!isRecord(l)) return l;
  const out: UnknownRecord = { ...l };
  if (Array.isArray(l.vocab)) out.vocab = l.vocab.map(convertVocab);
  if (Array.isArray(l.exercises)) out.exercises = l.exercises.map(convertExercise);
  return out;
}

export function upconvertV1(raw: unknown): unknown {
  if (!isRecord(raw) || raw.version !== 1) return raw;

  const { course, lessons, ...rest } = raw;
  const curriculum = isRecord(course)
    ? { name: course.name, description: course.description, language: "fa" }
    : course;

  return {
    ...rest,
    version: 2,
    curriculum,
    ...(Array.isArray(lessons) ? { lessons: lessons.map(convertLesson) } : {}),
  };
}
