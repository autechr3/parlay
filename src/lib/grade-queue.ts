import { get as idbGet, set as idbSet } from "idb-keyval";
import type { Direction } from "./directions";

export type PendingGrade = {
  id: string; vocabId: string; grade: number; direction: Direction;
  msTaken: number; ts: number;
};
export type KVStore = {
  get(k: string): Promise<PendingGrade[] | undefined>;
  set(k: string, v: PendingGrade[]): Promise<void>;
};

const KEY = "pending-grades";

export function makeIdbStore(): KVStore {
  return { get: (k) => idbGet(k), set: (k, v) => idbSet(k, v) };
}

export function makeGradeRpc(supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
}) {
  return async (g: PendingGrade) => {
    const { error } = await supabase.rpc("grade_card", {
      p_vocab_id: g.vocabId, p_grade: g.grade,
      p_direction: g.direction, p_ms_taken: g.msTaken,
    });
    if (error) throw error;
  };
}

export class GradeQueue {
  #flushing = false;
  constructor(
    private store: KVStore,
    private rpc: (g: PendingGrade) => Promise<void>,
  ) {}

  async enqueue(g: Omit<PendingGrade, "id">): Promise<void> {
    const list = (await this.store.get(KEY)) ?? [];
    list.push({ ...g, id: crypto.randomUUID() });
    await this.store.set(KEY, list);
    await this.flush();
  }

  async flush(): Promise<{ sent: number; remaining: number }> {
    if (this.#flushing) return { sent: 0, remaining: await this.pendingCount() };
    this.#flushing = true;
    let sent = 0;
    try {
      let list = (await this.store.get(KEY)) ?? [];
      while (list.length > 0) {
        try { await this.rpc(list[0]); }
        catch { break; }                    // offline / error: keep everything from here
        list = list.slice(1);
        await this.store.set(KEY, list);
        sent++;
      }
      return { sent, remaining: list.length };
    } finally { this.#flushing = false; }
  }

  async pendingCount(): Promise<number> {
    return ((await this.store.get(KEY)) ?? []).length;
  }
}
