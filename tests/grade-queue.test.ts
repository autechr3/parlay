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
  it("moves a permanently-failing head item to the dead letter list after 5 attempts, then continues", async () => {
    const store = memStore();
    const rpc = vi.fn().mockRejectedValue(new Error("offline"));
    const q = new GradeQueue(store, rpc);
    await q.enqueue(grade);                     // v1 attempts -> 1
    await q.enqueue({ ...grade, vocabId: "v2" }); // v1 attempts -> 2
    await q.flush();                             // v1 attempts -> 3
    await q.flush();                             // v1 attempts -> 4
    // 5th failed attempt on v1: dead-lettered, then v2 is tried (also fails -> attempts 1)
    await q.flush();
    expect(await q.pendingCount()).toBe(1);
    const dead = await store.get("failed-grades");
    expect(dead?.length).toBe(1);
    expect(dead?.[0]).toMatchObject({ vocabId: "v1", attempts: 5 });

    rpc.mockResolvedValue(undefined);
    const r = await q.flush();
    expect(r).toEqual({ sent: 1, remaining: 0 });
    expect(rpc.mock.calls.at(-1)?.[0].vocabId).toBe("v2");
  });
});
