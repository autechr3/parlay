import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import { themes } from "../../lib/design/tokens";
import { ThemeProvider } from "./theme";
import { DrillPlayer, type AttemptEvent, type DrillSummary } from "./components/DrillPlayer";
import { createWidgetStore, buildCompletionUpdate } from "./host";
import { View, Text } from "./ui";

const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const store = createWidgetStore(prefersDark ? "dark" : "light");
const app = new App({ name: "parlay-drill", version: "1.0.0" });

// Handlers registered BEFORE connect() — required by the ext-apps lifecycle.
app.ontoolresult = (result) => store.handleToolResult(result);
app.onhostcontextchanged = (ctx) => store.handleHostContext(ctx);

function onAttempt(drillId: string, a: AttemptEvent) {
  app.callServerTool({
    name: "record_attempt",
    arguments: {
      drill_id: drillId, exercise_id: a.exercise_id, correct: a.correct,
      answer_given: a.answer_given, ms_taken: a.ms_taken,
    },
  }).catch((e) => console.error("[parlay-drill] record_attempt failed", e));
}

function onComplete(drillId: string, s: DrillSummary) {
  app.updateModelContext(buildCompletionUpdate(drillId, s))
    .catch((e) => console.error("[parlay-drill] updateModelContext failed", e));
}

function Root() {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const theme = themes[state.theme];
  return (
    <ThemeProvider theme={theme}>
      <View style={{ background: theme.bg, color: theme.text, minHeight: 120, padding: 12, fontFamily: "'Figtree', 'Segoe UI', system-ui, sans-serif" }}>
        {state.payload ? (
          <DrillPlayer
            drill={state.payload.drill}
            languageCode={state.payload.drill.language}
            theme={theme}
            onAttempt={(a) => onAttempt(state.payload!.drill_id, a)}
            onComplete={(s) => onComplete(state.payload!.drill_id, s)}
          />
        ) : (
          <Text>Waiting for your drill…</Text>
        )}
      </View>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);

app.connect().then(() => {
  const t = app.getHostContext()?.theme;
  if (t) store.handleHostContext({ theme: t });
}).catch((e) => console.error("[parlay-drill] connect failed", e));
