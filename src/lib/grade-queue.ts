import { get as idbGet, set as idbSet } from "idb-keyval";
import type { Direction } from "./directions";

export type PendingGrade = {
  id: string; vocabId: string; grade: number; direction: Direction;
  msTaken: number; ts: number; attempts?: number;
};
export type KVStore = {
  get(k: string): Promise<PendingGrade[] | undefined>;
  set(k: string, v: PendingGrade[]): Promise<void>;
};

const KEY = "pending-grades";
const DEAD_LETTER_KEY = "failed-grades";

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
  #chain: Promise<unknown> = Promise.resolve();
  constructor(
    private store: KVStore,
    private rpc: (g: PendingGrade) => Promise<void>,
  ) {}

  #serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.#chain.then(fn, fn);
    this.#chain = next.catch(() => {});
    return next;
  }

  async enqueue(g: Omit<PendingGrade, "id">): Promise<void> {
    await this.#serialize(async () => {
      const list = (await this.store.get(KEY)) ?? [];
      list.push({ ...g, id: crypto.randomUUID() });
      await this.store.set(KEY, list);
    });
    await this.flush();
  }

  async flush(): Promise<{ sent: number; remaining: number }> {
    return this.#serialize(async () => {
      let sent = 0;
      let list = (await this.store.get(KEY)) ?? [];
      while (list.length > 0) {
        try {
          await this.rpc(list[0]);
        } catch {
          // offline / error: bump this item's attempt count and persist it.
          const attempts = (list[0].attempts ?? 0) + 1;
          if (attempts >= 5) {
            // Permanent-failure escape: a single poison item (e.g. a vocab_id that no
            // longer exists) would otherwise wedge the FIFO queue forever, blocking every
            // grade behind it. Move it aside and keep going with the next item.
            const dead = (await this.store.get(DEAD_LETTER_KEY)) ?? [];
            dead.push({ ...list[0], attempts });
            await this.store.set(DEAD_LETTER_KEY, dead);
            list = list.slice(1);
            await this.store.set(KEY, list);
            continue;
          }
          list = [{ ...list[0], attempts }, ...list.slice(1)];
          await this.store.set(KEY, list);
          break;                            // keep everything from here, FIFO order preserved
        }
        list = list.slice(1);
        await this.store.set(KEY, list);
        sent++;
      }
      return { sent, remaining: list.length };
    });
  }

  async pendingCount(): Promise<number> {
    return ((await this.store.get(KEY)) ?? []).length;
  }
}
