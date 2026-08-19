import { describe, it, expect, vi } from "vitest";
import { createWidgetStore, buildCompletionUpdate } from "../src/widgets/drill/host";

describe("widget store", () => {
  it("captures the drill payload from a tool result and notifies subscribers", () => {
    const store = createWidgetStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.handleToolResult({
      content: [{ type: "text", text: "ok" }],
      structuredContent: { drill_id: "d1", drill: { language: "fa", srs_default: true, exercises: [] } },
    });
    expect(store.getState().payload?.drill_id).toBe("d1");
    expect(listener).toHaveBeenCalled();
  });
  it("ignores tool results without a drill payload", () => {
    const store = createWidgetStore();
    store.handleToolResult({ content: [], structuredContent: { something: 1 } });
    expect(store.getState().payload).toBeNull();
  });
  it("applies host theme changes, keeping current theme otherwise", () => {
    const store = createWidgetStore();
    store.handleHostContext({ theme: "dark" });
    expect(store.getState().theme).toBe("dark");
    store.handleHostContext({ locale: "en-US" });
    expect(store.getState().theme).toBe("dark");
  });
});

describe("buildCompletionUpdate", () => {
  it("summarizes for the model", () => {
    const u = buildCompletionUpdate("d1", { total: 5, correct: 3, missed: ["آب", "نان"] });
    expect(u.structuredContent).toMatchObject({ drill_id: "d1", total: 5, correct: 3 });
    const text = (u.content?.[0] as { text: string }).text;
    expect(text).toContain("3/5");
    expect(text).toContain("آب");
  });
});
