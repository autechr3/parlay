import { z } from "zod";

// Shared envelope for every exercise in a drill. `srs` overrides the drill's
// srs_default for one exercise; grading only ever applies when vocab_id is set.
const promptSchema = z.object({
  text: z.string().optional(),
  term: z.string().optional(),
  term_vocalized: z.string().optional(),
  transliteration: z.string().optional(),
});

const base = {
  id: z.string().min(1),
  prompt: promptSchema,
  vocab_id: z.string().uuid().optional(),
  srs: z.boolean().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  skill: z.string().optional(),
};

const choiceExercise = z.object({
  ...base,
  type: z.literal("choice"),
  options: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    script: z.boolean().optional(),
  })).min(2).max(6),
  correct_id: z.string().min(1),
});

const typedExercise = z.object({
  ...base,
  type: z.literal("typed"),
  expected: z.array(z.string().min(1)).min(1),
  input: z.enum(["script", "translit", "translation"]),
  keyboard: z.boolean().optional(),
});

const clozeExercise = z.object({
  ...base,
  type: z.literal("cloze"),
  tokens: z.array(z.string()).min(1),
  blanks: z.array(z.object({
    index: z.number().int().min(0),
    expected: z.array(z.string().min(1)).min(1),
  })).min(1),
  mode: z.enum(["type", "tiles"]),
  tiles: z.array(z.string()).optional(),
});

const matchExercise = z.object({
  ...base,
  type: z.literal("match"),
  pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2).max(8),
});

export const exerciseSchema = z.discriminatedUnion("type", [
  choiceExercise, typedExercise, clozeExercise, matchExercise,
]);
export type Exercise = z.infer<typeof exerciseSchema>;

export const drillSchema = z.object({
  title: z.string().optional(),
  language: z.string().min(1).default("fa"),
  srs_default: z.boolean().default(true),
  exercises: z.array(exerciseSchema).min(1).max(10),
}).superRefine((drill, ctx) => {
  const seen = new Set<string>();
  drill.exercises.forEach((ex, i) => {
    if (seen.has(ex.id)) {
      ctx.addIssue({ code: "custom", path: ["exercises", i, "id"], message: `duplicate exercise id "${ex.id}"` });
    }
    seen.add(ex.id);
    if (ex.type === "choice" && !ex.options.some((o) => o.id === ex.correct_id)) {
      ctx.addIssue({ code: "custom", path: ["exercises", i, "correct_id"], message: "correct_id not among options" });
    }
    if (ex.type === "cloze") {
      for (const b of ex.blanks) {
        if (b.index >= ex.tokens.length) {
          ctx.addIssue({ code: "custom", path: ["exercises", i, "blanks"], message: `blank index ${b.index} out of range` });
        }
      }
    }
  });
});
export type Drill = z.infer<typeof drillSchema>;
