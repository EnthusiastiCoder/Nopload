// Batch engine: runs a pipeline over many files with bounded concurrency, cancellation and the
// "already optimal" fallback. Per-file work is an injectable Executor (the worker pool in production).
import { MIME, outputName, sniffType } from '../../lib/files';
import { abortError, comlinkSlotFactory, createPool, defaultPoolSize, type Pool } from '../../lib/worker-pool';
import type { WorkerResult, WorkerTask } from './codecs.worker';
import type { ResizeMode } from './resize';

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl';

export type Step =
  | { kind: 'decode' }
  | { kind: 'resize'; mode: ResizeMode; noUpscale?: boolean }
  | {
      kind: 'encode';
      format: OutputFormat | 'same';
      quality?: number;
      background?: [number, number, number];
      /** JPEG output only: copy the source's DateTimeOriginal (and nothing else) into a fresh Exif. */
      keepDateTaken?: boolean;
    }
  | { kind: 'stripMetadata'; keepIcc?: boolean; keepOrientation?: boolean };

export interface BatchInput {
  name: string;
  data: Uint8Array;
}

export interface BatchResult {
  name: string;
  inBytes: number;
  outBytes: number;
  width: number;
  height: number;
  blob: Blob;
  warnings: string[];
}

/** Runs the whole pipeline for one file (in production: on the worker pool). */
export type Executor = (
  file: BatchInput,
  pipeline: Step[],
  signal: AbortSignal,
) => Promise<{ data: Uint8Array; width: number; height: number; format: OutputFormat }>;

let pool: Pool<WorkerTask, WorkerResult> | undefined;
let poolPromise: Promise<Pool<WorkerTask, WorkerResult>> | undefined;

async function getPool(): Promise<Pool<WorkerTask, WorkerResult>> {
  poolPromise ??= comlinkSlotFactory<WorkerTask, WorkerResult>(
    () => new Worker(new URL('./codecs.worker.ts', import.meta.url), { type: 'module' }),
  ).then((factory) => (pool = createPool(factory, defaultPoolSize())));
  return poolPromise;
}

export const poolSize = (): number => pool?.size ?? defaultPoolSize();

/** Default executor: one task on the worker pool. The input bytes are copied so the caller keeps them. */
export const poolExecutor: Executor = async (file, pipeline, signal) => {
  const p = await getPool();
  const data = file.data.slice();
  const r = await p.run({ name: file.name, data, pipeline }, [data.buffer], { signal });
  return r;
};

const EXT: Record<OutputFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif', jxl: 'jxl' };
const FORMAT_OF_TYPE: Record<string, OutputFormat> = { jpeg: 'jpeg', png: 'png', webp: 'webp', avif: 'avif', jxl: 'jxl' };

export async function processBatch(
  files: BatchInput[],
  pipeline: Step[],
  opts: {
    onItem?: (result: BatchResult, index: number) => void;
    signal?: AbortSignal;
    /** Injected by tests; defaults to the worker-pool executor. */
    executor?: Executor;
    /** Max items in flight; defaults to the pool size. */
    concurrency?: number;
  } = {},
): Promise<BatchResult[]> {
  const { signal, onItem } = opts;
  const executor = opts.executor ?? poolExecutor;
  const concurrency = Math.max(1, opts.concurrency ?? defaultPoolSize());
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) ac.abort();
  const taken = new Set<string>();
  const names = files.map((f) => f.name);
  const results: BatchResult[] = new Array(files.length);
  const hasResize = pipeline.some((s) => s.kind === 'resize');
  let next = 0;
  let failure: unknown;

  async function one(i: number): Promise<void> {
    const file = files[i];
    const out = await executor(file, pipeline, ac.signal);
    const inType = FORMAT_OF_TYPE[sniffType(file.data)];
    const encode = pipeline.find((s) => s.kind === 'encode');
    const warnings: string[] = [];
    let data = out.data;
    let format = out.format;
    // A same-format re-encode that grew keeps the original bytes.
    if (!hasResize && encode && inType === out.format && out.data.length >= file.data.length) {
      data = file.data;
      format = inType;
      warnings.push('already-optimal');
    }
    results[i] = {
      name: names[i],
      inBytes: file.data.length,
      outBytes: data.length,
      width: out.width,
      height: out.height,
      blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: MIME[format === 'jpeg' ? 'jpeg' : format] }),
      warnings,
    };
    onItem?.(results[i], i);
  }

  async function lane(): Promise<void> {
    while (!ac.signal.aborted && failure === undefined) {
      const i = next++;
      if (i >= files.length) return;
      try {
        await one(i);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        // A bad file must not sink the batch: the caller sees it through a rejected item.
        failure = e;
        ac.abort();
      }
    }
  }

  try {
    // Output names are assigned in input order so duplicates are stable.
    const enc = pipeline.find((s) => s.kind === 'encode');
    files.forEach((f, i) => {
      const inType = FORMAT_OF_TYPE[sniffType(f.data)];
      const fmt = !enc || enc.format === 'same' ? (inType ?? 'jpeg') : enc.format;
      names[i] = outputName(f.name, { ext: EXT[fmt] }, taken);
    });
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, lane));
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  if (failure !== undefined) throw failure;
  if (signal?.aborted) throw abortError();
  return results;
}
