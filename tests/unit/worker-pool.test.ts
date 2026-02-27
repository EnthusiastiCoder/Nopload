// U1.5 worker pool: bounded concurrency, per-task results, cancelAll, error isolation.
import { describe, expect, it } from 'vitest';
import { createPool, type PoolWorker } from '../../src/lib/worker-pool';

type Task = { id: number; ms: number; fail?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake worker factory that records how many tasks run at the same time. */
function harness() {
  const state = { running: 0, maxRunning: 0, started: [] as number[], workers: 0 };
  const factory = (): PoolWorker<Task, string> => {
    state.workers++;
    return {
      async exec(task) {
        state.running++;
        state.maxRunning = Math.max(state.maxRunning, state.running);
        state.started.push(task.id);
        try {
          await sleep(task.ms);
          if (task.fail) throw new Error(`task ${task.id} failed`);
          return `done-${task.id}`;
        } finally {
          state.running--;
        }
      },
      terminate() {},
    };
  };
  return { state, factory };
}

describe('createPool', () => {
  it('never runs more than `size` tasks at once', async () => {
    const { state, factory } = harness();
    const pool = createPool(factory, 3);
    const tasks = Array.from({ length: 10 }, (_, i) => pool.run({ id: i, ms: 5 + (i % 3) * 5 }));
    await Promise.all(tasks);
    expect(state.maxRunning).toBe(3);
    expect(state.workers).toBeLessThanOrEqual(3);
  });

  it('starts queued tasks in FIFO order', async () => {
    const { state, factory } = harness();
    const pool = createPool(factory, 1);
    await Promise.all([0, 1, 2, 3].map((id) => pool.run({ id, ms: 1 })));
    expect(state.started).toEqual([0, 1, 2, 3]);
  });

  it("resolves each promise with its own task's result, not in global order", async () => {
    const { factory } = harness();
    const pool = createPool(factory, 2);
    const order: number[] = [];
    const slow = pool.run({ id: 1, ms: 40 }).then((r) => (order.push(1), r));
    const fast = pool.run({ id: 2, ms: 1 }).then((r) => (order.push(2), r));
    expect(await slow).toBe('done-1');
    expect(await fast).toBe('done-2');
    expect(order).toEqual([2, 1]);
  });

  it('cancelAll rejects the pending tasks with AbortError', async () => {
    const { state, factory } = harness();
    const pool = createPool(factory, 1);
    const running = pool.run({ id: 0, ms: 30 });
    const pending = [1, 2, 3].map((id) => pool.run({ id, ms: 1 }));
    await sleep(5);
    pool.cancelAll();
    for (const p of pending) await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await running.catch(() => undefined);
    expect(state.started).not.toContain(1);
    expect(state.started).not.toContain(2);
    expect(state.started).not.toContain(3);
  });

  it('a task error rejects only that task', async () => {
    const { factory } = harness();
    const pool = createPool(factory, 2);
    const results = await Promise.allSettled([
      pool.run({ id: 1, ms: 5 }),
      pool.run({ id: 2, ms: 5, fail: true }),
      pool.run({ id: 3, ms: 5 }),
      pool.run({ id: 4, ms: 5 }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
    expect((results[1] as PromiseRejectedResult).reason.message).toBe('task 2 failed');
    // The pool keeps working after a failure.
    await expect(pool.run({ id: 5, ms: 1 })).resolves.toBe('done-5');
  });

  it('an aborted per-task signal rejects that queued task with AbortError', async () => {
    const { state, factory } = harness();
    const pool = createPool(factory, 1);
    const first = pool.run({ id: 0, ms: 20 });
    const ac = new AbortController();
    const second = pool.run({ id: 1, ms: 1 }, [], { signal: ac.signal });
    ac.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    await first;
    expect(state.started).toEqual([0]);
  });
});
