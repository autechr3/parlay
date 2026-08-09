import { completeLesson } from "@/app/lessons/actions";

const SKILLS = ["ezafe", "ra", "present_stems", "past_stems", "verb_final_order",
  "possessive_suffixes", "numbers_by_ear", "telling_time", "reading_unvocalized",
  "formal_colloquial", "conversation"];

export function CompletionForm({ lessonId, isAssessment }:
  { lessonId: number; isAssessment: boolean }) {
  return (
    <form action={completeLesson} className="mt-8 flex flex-col gap-3 rounded border p-4">
      <h2 className="font-semibold">Mark complete</h2>
      <input type="hidden" name="lesson_id" value={lessonId} />
      <label className="flex justify-between">Minutes spent
        <input type="number" name="minutes_spent" min={0} max={600} className="w-24 rounded border p-1" /></label>
      <label className="flex justify-between">Homework done
        <input type="checkbox" name="homework_done" /></label>
      <label className="flex justify-between">Negar drill done
        <input type="checkbox" name="negar_drill_done" /></label>
      <label className="flex justify-between">Confidence (1–5)
        <input type="number" name="confidence" min={1} max={5} className="w-24 rounded border p-1" /></label>
      <textarea name="notes" placeholder="notes" className="rounded border p-2" />
      {isAssessment && (
        <fieldset className="mt-2 flex flex-col gap-1 border-t pt-2">
          <legend className="text-sm font-semibold">Skill self-ratings (1–5, blank to skip)</legend>
          {SKILLS.map((s) => (
            <label key={s} className="flex justify-between text-sm">{s.replaceAll("_", " ")}
              <input type="number" name={`skill:${s}`} min={1} max={5} className="w-20 rounded border p-1" /></label>
          ))}
        </fieldset>
      )}
      <button className="rounded bg-black p-3 text-white">Complete lesson</button>
    </form>
  );
}
