// STUB written by the test-writer (WS3 replaces the bodies). See tests/unit/engine.test.ts.
import type { ResizeMode } from './resize';

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl';

export type Step =
  | { kind: 'decode' }
  | { kind: 'resize'; mode: ResizeMode; noUpscale?: boolean }
  | { kind: 'encode'; format: OutputFormat | 'same'; quality?: number; background?: [number, number, number] }
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

export function processBatch(
  _files: BatchInput[],
  _pipeline: Step[],
  _opts: {
    onItem?: (result: BatchResult, index: number) => void;
    signal?: AbortSignal;
    /** Injected by tests; defaults to the worker-pool executor. */
    executor?: Executor;
    /** Max items in flight; defaults to the pool size. */
    concurrency?: number;
  },
): Promise<BatchResult[]> {
  throw new Error('not implemented: processBatch');
}
