// STUB written by the test-writer (WS1 replaces the bodies). See tests/unit/worker-pool.test.ts.

/** One pool slot. Real slots wrap a module Worker (via Comlink); tests pass fakes. */
export interface PoolWorker<T, R> {
  exec(task: T, transfer: Transferable[], signal: AbortSignal): Promise<R>;
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

export function createPool<T, R>(_factory: () => PoolWorker<T, R>, _size: number): Pool<T, R> {
  throw new Error('not implemented: createPool');
}
