import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import { themes } from "../../lib/design/tokens";

const app = new App({ name: "parlay-drill", version: "1.0.0" });

// Handlers MUST be registered before connect() or the initial
// tool-input/tool-result notifications are missed.
app.ontoolresult = (result) => {
  console.log("[parlay-drill] tool result", result);
};

const theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? themes.dark : themes.light;
const root = createRoot(document.getElementById("root")!);
root.render(<div style={{ background: theme.bg, color: theme.text, padding: 16 }}>Parlay drill widget shell</div>);

app.connect().catch((e) => console.error("[parlay-drill] connect failed", e));
