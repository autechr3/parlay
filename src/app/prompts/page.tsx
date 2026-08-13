import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CopyPromptButton } from "@/components/CopyPromptButton";
import {
  buildCreateCoursePrompt, buildNextLessonsPrompt, buildExercisesPrompt, buildAddVocabPrompt,
  type CurriculumState,
} from "@/lib/agent-prompts";

const COUNT_OPTIONS = [1, 5, 10] as const;

function PromptSection({ heading, when, prompt, extra }: {
  heading: string; when: string; prompt: string; extra?: React.ReactNode;
}) {
  return (
    <section className="rounded border p-4">
      <h2 className="font-semibold">{heading}</h2>
      <p className="mb-2 text-sm text-gray-500">{when}</p>
      {extra}
      <details>
        <summary className="cursor-pointer text-sm underline">Show prompt</summary>
        <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{prompt}</pre>
      </details>
    </section>
  );
}

function FallbackPromptSection({ heading, prompt }: { heading: string; prompt: string }) {
  return (
    <section className="rounded border p-4">
      <h3 className="font-semibold">{heading}</h3>
      <details>
        <summary className="cursor-pointer text-sm underline">Show prompt</summary>
        <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">{prompt}</pre>
      </details>
      <div className="mt-2"><CopyPromptButton prompt={prompt} /></div>
    </section>
  );
}

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ count?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;

  const { data: profile } = await supabase.from("profiles")
    .select("active_curriculum_id").eq("id", uid).single();
  const curriculumId = profile?.active_curriculum_id;

  if (!curriculumId) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-bold">Prompts</h1>
        <p className="text-gray-500">
          <Link className="underline" href="/welcome">Set up your AI tutor to generate your first curriculum</Link>.
        </p>
        <PromptSection
          heading="Create a curriculum"
          when="Use this first — no curriculum yet. Your tutor imports the result for you."
          prompt={buildCreateCoursePrompt()}
        />
        <details className="rounded border p-4">
          <summary className="cursor-pointer font-semibold">My AI tool can&apos;t use MCP tools</summary>
          <p className="mb-2 mt-2 text-sm text-gray-500">
            Paste the prompt below into your AI tool, then paste its JSON reply into{" "}
            <Link href="/curriculums/import" className="underline">Import</Link>.
          </p>
          <FallbackPromptSection
            heading="Create a curriculum"
            prompt={buildCreateCoursePrompt(false)}
          />
        </details>
      </main>
    );
  }

  const [{ data: curriculum }, { data: units }, { data: lessons }, { data: vocab }] = await Promise.all([
    supabase.from("curriculums").select("name, language_code, languages(name)").eq("id", curriculumId).single(),
    supabase.from("units").select("title").eq("curriculum_id", curriculumId).order("number"),
    supabase.from("lessons").select("id, number, title, grammar_points").eq("curriculum_id", curriculumId).order("number"),
    // No created_at column on vocab_items — take the query's natural (insertion-order) return
    // and slice the last 60 rather than adding an explicit orderBy this table doesn't support.
    supabase.from("vocab_items").select("term, lesson_id").eq("curriculum_id", curriculumId),
  ]);

  const lessonRows = lessons ?? [];
  const maxLesson = lessonRows.reduce((m, l) => Math.max(m, l.number), 0);
  const recentVocab = (vocab ?? []).slice(-60).map((v) => v.term);

  const vocabByLessonId = new Map<number, string[]>();
  for (const v of vocab ?? []) {
    if (v.lesson_id == null) continue;
    const arr = vocabByLessonId.get(v.lesson_id) ?? [];
    arr.push(v.term);
    vocabByLessonId.set(v.lesson_id, arr);
  }

  const languageRow = curriculum?.languages as unknown as { name: string } | null;
  const state: CurriculumState = {
    curriculumName: curriculum?.name ?? "",
    languageCode: curriculum?.language_code ?? "fa",
    languageName: languageRow?.name ?? "Persian",
    maxLesson,
    unitTitles: (units ?? []).map((u) => u.title),
    grammarCovered: [...new Set(lessonRows.flatMap((l) => l.grammar_points ?? []))],
    recentVocab,
    lessons: lessonRows.map((l) => ({
      number: l.number, title: l.title, grammar: l.grammar_points ?? [],
      vocab: vocabByLessonId.get(l.id) ?? [],
    })),
  };

  const countParam = Number((await searchParams).count);
  const count = COUNT_OPTIONS.includes(countParam as (typeof COUNT_OPTIONS)[number]) ? countParam : 5;

  const currentLesson = lessonRows[lessonRows.length - 1];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Prompts</h1>
      <p className="text-sm text-gray-600">
        Ask your connected tutor to grow{" "}
        <span className="font-medium">{state.curriculumName}</span> — it writes lessons, exercises,
        and vocabulary straight into your account through its tools. No copying or pasting needed.
      </p>

      <PromptSection
        heading="Create a curriculum"
        when="Start a brand-new curriculum from scratch."
        prompt={buildCreateCoursePrompt()}
      />

      <PromptSection
        heading="Generate the next lessons"
        when={`Extend the curriculum past lesson ${state.maxLesson} without repeating grammar or vocab.`}
        prompt={buildNextLessonsPrompt(state, count)}
        extra={
          <form className="mb-2 flex items-center gap-2 text-sm">
            <label htmlFor="count">How many lessons</label>
            <select id="count" name="count" defaultValue={count} className="rounded border p-1">
              {COUNT_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="submit" className="rounded border px-2 py-1">Update</button>
          </form>
        }
      />

      {currentLesson && (
        <PromptSection
          heading={`Generate exercises for lesson ${currentLesson.number}`}
          when={`Fill out exercises for "${currentLesson.title}" without touching its vocab.`}
          prompt={buildExercisesPrompt(state, currentLesson.number)}
        />
      )}

      <PromptSection
        heading="Add vocabulary"
        when="Grow the word list for existing lessons without adding new ones."
        prompt={buildAddVocabPrompt(state)}
      />

      <details className="rounded border p-4">
        <summary className="cursor-pointer font-semibold">My AI tool can&apos;t use MCP tools</summary>
        <p className="mb-2 mt-2 text-sm text-gray-500">
          Paste a prompt below into your AI tool, then paste its JSON reply into{" "}
          <Link href="/curriculums/import" className="underline">Import</Link>.
        </p>
        <div className="flex flex-col gap-4">
          <FallbackPromptSection
            heading="Create a curriculum"
            prompt={buildCreateCoursePrompt(false)}
          />
          <FallbackPromptSection
            heading="Generate the next lessons"
            prompt={buildNextLessonsPrompt(state, count, false)}
          />
          {currentLesson && (
            <FallbackPromptSection
              heading={`Generate exercises for lesson ${currentLesson.number}`}
              prompt={buildExercisesPrompt(state, currentLesson.number, false)}
            />
          )}
          <FallbackPromptSection
            heading="Add vocabulary"
            prompt={buildAddVocabPrompt(state, false)}
          />
        </div>
      </details>
    </main>
  );
}
