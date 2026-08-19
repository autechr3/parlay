import type { Drill } from "../../lib/exercises/schema";
import type { ThemeName } from "../../lib/design/tokens";
import type { DrillSummary } from "./components/DrillPlayer";

export type DrillPayload = { drill_id: string; drill: Drill };
type ToolResultLike = { content?: unknown[]; structuredContent?: unknown; isError?: boolean };

export type WidgetState = { payload: DrillPayload | null; theme: ThemeName };

// Tiny external store: the ext-apps App pushes events in, React reads via
// useSyncExternalStore. Kept App-free so it is unit-testable.
export function createWidgetStore(initialTheme: ThemeName = "light") {
  let state: WidgetState = { payload: null, theme: initialTheme };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    getState: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
    handleToolResult: (result: ToolResultLike) => {
      const sc = result.structuredContent as Partial<DrillPayload> | undefined;
      if (sc && typeof sc.drill_id === "string" && sc.drill) {
        state = { ...state, payload: sc as DrillPayload };
        emit();
      }
    },
    handleHostContext: (ctx: { theme?: unknown; [key: string]: unknown }) => {
      if (ctx.theme === "light" || ctx.theme === "dark") {
        state = { ...state, theme: ctx.theme };
        emit();
      }
    },
  };
}

export function buildCompletionUpdate(drillId: string, summary: DrillSummary) {
  const missed = summary.missed.length ? ` Missed: ${summary.missed.join("، ")}.` : "";
  return {
    content: [{
      type: "text" as const,
      text: `Drill complete: ${summary.correct}/${summary.total} correct.${missed} Call get_drill_results for details.`,
    }],
    structuredContent: { drill_id: drillId, total: summary.total, correct: summary.correct, missed: summary.missed },
  };
}
