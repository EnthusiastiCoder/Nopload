// A small generic worker pool: bounded concurrency, FIFO queue, per-task results,
// AbortSignal support and progress fan-out. Slots are created lazily up to `size`.

/** One pool slot. Real slots wrap a module Worker (via Comlink, see `comlinkSlot`); tests pass fakes. */
export interface PoolWorker<T, R> {
  exec(task: T, transfer: Transferable[], signal: AbortSignal, onProgress?: (p: unknown) => void): Promise<R>;
  terminate(): void;
}

export interface Pool<T, R> {
  readonly size: number;
  /** Queues FIFO; resolves or rejects with this task's own result only. */
  run(task: T, transfer?: Transferable[], opts?: { signal?: AbortSignal }): Promise<R>;
  /** Rejects every queued (not yet started) task with a DOMException named "AbortError". */
  cancelAll(): void;
  onProgress(cb: (progress: unknown) => void): () => void;
  terminate(): void;
}

export const abortError = (msg = 'The operation was aborted.'): DOMException => new DOMException(msg, 'AbortError');

/** `max(1, min(4, hardwareConcurrency - 1))`. */
export function defaultPoolSize(): number {
  const hc = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(4, hc - 1));
}

interface Job<T, R> {
  task: T;
  transfer: Transferable[];
  signal: AbortSignal;
  resolve(v: R): void;
  reject(e: unknown): void;
  cleanup(): void;
}

export function createPool<T, R>(factory: () => PoolWorker<T, R>, size: number): Pool<T, R> {
  const max = Math.max(1, Math.floor(size));
  const idle: PoolWorker<T, R>[] = [];
  const all = new Set<PoolWorker<T, R>>();
  const queue: Job<T, R>[] = [];
  const listeners = new Set<(p: unknown) => void>();
  let busy = 0;
  let dead = false;

  const emit = (p: unknown) => {
    for (const cb of listeners) cb(p);
  };

  function acquire(): PoolWorker<T, R> | null {
    const w = idle.pop();
    if (w) return w;
    if (all.size < max) {
      const created = factory();
      all.add(created);
      return created;
    }
    return null;
  }

  function pump(): void {
    while (!dead && queue.length && busy < max) {
      const worker = acquire();
      if (!worker) return;
      const job = queue.shift()!;
      job.cleanup();
      busy++;
      let p: Promise<R>;
      try {
        p = worker.exec(job.task, job.transfer, job.signal, emit);
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(job.resolve, job.reject).finally(() => {
        busy--;
        // A slot aborted mid-task may have terminated its worker: drop it, a fresh one is made lazily.
        if (job.signal.aborted) {
          all.delete(worker);
          worker.terminate();
        } else if (!dead) idle.push(worker);
        pump();
      });
    }
  }

  return {
    size: max,
    run(task, transfer = [], opts = {}) {
      return new Promise<R>((resolve, reject) => {
        if (dead) return reject(new Error('pool terminated'));
        const own = new AbortController();
        const outer = opts.signal;
        if (outer?.aborted) return reject(abortError());
        const onAbort = () => {
          const i = queue.indexOf(job);
          if (i >= 0) {
            queue.splice(i, 1);
            reject(abortError());
          }
          own.abort();
        };
        const job: Job<T, R> = {
          task,
          transfer,
          signal: own.signal,
          resolve: (v) => {
            outer?.removeEventListener('abort', onAbort);
            resolve(v);
          },
          reject: (e) => {
            outer?.removeEventListener('abort', onAbort);
            reject(e);
          },
          cleanup: () => {},
        };
        outer?.addEventListener('abort', onAbort, { once: true });
        queue.push(job);
        pump();
      });
    },
    cancelAll() {
      const pending = queue.splice(0, queue.length);
      for (const job of pending) job.reject(abortError());
    },
    onProgress(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    terminate() {
      dead = true;
      this.cancelAll();
      for (const w of all) w.terminate();
      all.clear();
      idle.length = 0;
    },
  };
}

/**
 * A pool slot backed by a module Worker that exposes `{ run(task, onProgress) }` via Comlink.
 * Aborting a running task terminates the worker (the pool replaces it).
 */
export async function comlinkSlotFactory<T, R>(makeWorker: () => Worker): Promise<() => PoolWorker<T, R>> {
  const Comlink = await import('comlink');
  return () => {
    const worker = makeWorker();
    const remote = Comlink.wrap<{ run(task: T, onProgress?: (p: unknown) => void): Promise<R> }>(worker);
    return {
      exec(task, transfer, signal, onProgress) {
        return new Promise<R>((resolve, reject) => {
          const onAbort = () => {
            worker.terminate();
            reject(abortError());
          };
          if (signal.aborted) return onAbort();
          signal.addEventListener('abort', onAbort, { once: true });
          remote
            .run(Comlink.transfer(task, transfer) as Parameters<typeof remote.run>[0], onProgress ? Comlink.proxy(onProgress) : undefined)
            .then(resolve as (v: unknown) => void, reject)
            .finally(() => signal.removeEventListener('abort', onAbort));
        });
      },
      terminate: () => worker.terminate(),
    };
  };
}
