import { describe, it, expect, vi } from "vitest";
import { GradeQueue, type PendingGrade, type KVStore } from "../src/lib/grade-queue";

function memStore(): KVStore {
  const m = new Map<string, PendingGrade[]>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}
const grade = { vocabId: "v1", grade: 4, direction: "fa_to_en" as const, msTaken: 900, ts: 1 };

describe("GradeQueue", () => {
  it("enqueue persists then flushes to rpc", async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    const q = new GradeQueue(memStore(), rpc);
    await q.enqueue(grade);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await q.pendingCount()).toBe(0);
  });
  it("keeps grades when rpc fails, resends on next flush", async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const q = new GradeQueue(memStore(), rpc);
    await q.enqueue(grade);                    // fails silently, stays queued
    expect(await q.pendingCount()).toBe(1);
    const r = await q.flush();                 // network back
    expect(r).toEqual({ sent: 1, remaining: 0 });
  });
  it("flush stops at first failure, preserves order", async () => {
    const rpc = vi.fn()
      .mockRejectedValue(new Error("offline"));
    const q = new GradeQueue(memStore(), rpc);
    await q.enqueue(grade);
    await q.enqueue({ ...grade, vocabId: "v2" });
    expect(await q.pendingCount()).toBe(2);
    rpc.mockResolvedValue(undefined);
    const r = await q.flush();
    expect(r.sent).toBe(2);
    expect(rpc.mock.calls.map((c) => c[0].vocabId).slice(-2)).toEqual(["v1", "v2"]);
  });
});
