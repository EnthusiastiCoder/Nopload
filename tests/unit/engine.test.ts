// U3.6 batch engine: "already optimal" fallback and cancellation.
// The per-file work is injected through `executor`, so no worker or codec is needed here.
import { describe, expect, it } from 'vitest';
import { processBatch, type BatchInput, type Executor, type Step } from '../../src/tools/batch/engine';
import { makeJpeg } from '../helpers/images';

const COMPRESS: Step[] = [{ kind: 'decode' }, { kind: 'encode', format: 'same', quality: 75 }];

const jpg = (name: string, seed = 1): BatchInput => ({ name, data: new Uint8Array(makeJpeg(64, 48, 95, seed)) });

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('processBatch (U3.6)', () => {
  it('returns the original bytes with warning "already-optimal" when a same-format re-encode is bigger', async () => {
    const input = jpg('big.jpg');
    const bigger = new Uint8Array(input.data.length + 500).fill(7);
    const executor: Executor = async () => ({ data: bigger, width: 64, height: 48, format: 'jpeg' });
    const [r] = await processBatch([input], COMPRESS, { executor, concurrency: 1 });
    expect(r.warnings).toContain('already-optimal');
    expect(r.inBytes).toBe(input.data.length);
    expect(r.outBytes).toBe(input.data.length);
    expect(Buffer.from(await bytesOf(r.blob)).equals(Buffer.from(input.data))).toBe(true);
  });

  it('uses the re-encoded bytes when they are smaller', async () => {
    const input = jpg('small.jpg');
    const smaller = input.data.slice(0, Math.floor(input.data.length / 2));
    const executor: Executor = async () => ({ data: smaller, width: 64, height: 48, format: 'jpeg' });
    const [r] = await processBatch([input], COMPRESS, { executor, concurrency: 1 });
    expect(r.warnings).not.toContain('already-optimal');
    expect(r.outBytes).toBe(smaller.length);
    expect(r.outBytes).toBeLessThan(r.inBytes);
    expect([r.width, r.height]).toEqual([64, 48]);
  });

  it('keeps a bigger output when the format changes (conversion is not "already optimal")', async () => {
    const input = jpg('to-png.jpg');
    const bigger = new Uint8Array(input.data.length * 3).fill(1);
    const executor: Executor = async () => ({ data: bigger, width: 64, height: 48, format: 'png' });
    const [r] = await processBatch([input], [{ kind: 'decode' }, { kind: 'encode', format: 'png' }], {
      executor,
      concurrency: 1,
    });
    expect(r.warnings).not.toContain('already-optimal');
    expect(r.outBytes).toBe(bigger.length);
  });

  it('calls onItem once per finished file with its index', async () => {
    const files = [jpg('a.jpg', 1), jpg('b.jpg', 2), jpg('c.jpg', 3)];
    const executor: Executor = async (f) => ({ data: f.data.slice(0, 10), width: 64, height: 48, format: 'jpeg' });
    const seen: number[] = [];
    const results = await processBatch(files, COMPRESS, { executor, concurrency: 2, onItem: (_r, i) => seen.push(i) });
    expect(results.map((r) => r.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(seen.sort()).toEqual([0, 1, 2]);
  });

  it('a cancelled signal stops the remaining items', async () => {
    const files = Array.from({ length: 10 }, (_, i) => jpg(`f${i}.jpg`, i + 1));
    const ac = new AbortController();
    let calls = 0;
    const executor: Executor = async (f) => {
      calls++;
      if (calls === 2) ac.abort();
      await new Promise((r) => setTimeout(r, 5));
      return { data: f.data.slice(0, 10), width: 64, height: 48, format: 'jpeg' };
    };
    const done: number[] = [];
    const outcome = await processBatch(files, COMPRESS, {
      executor,
      concurrency: 1,
      signal: ac.signal,
      onItem: (_r, i) => done.push(i),
    }).then(
      (r) => ({ ok: true as const, r }),
      (e: unknown) => ({ ok: false as const, e }),
    );
    expect(calls).toBe(2);
    expect(done.length).toBeLessThan(10);
    if (!outcome.ok) expect((outcome.e as Error).name).toBe('AbortError');
    else expect(outcome.r.length).toBeLessThan(10);
  });

  it('a signal already aborted runs nothing', async () => {
    const ac = new AbortController();
    ac.abort();
    let calls = 0;
    const executor: Executor = async (f) => {
      calls++;
      return { data: f.data, width: 1, height: 1, format: 'jpeg' };
    };
    await processBatch([jpg('x.jpg')], COMPRESS, { executor, signal: ac.signal }).catch(() => undefined);
    expect(calls).toBe(0);
  });
});
