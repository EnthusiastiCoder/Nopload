// The background remover island. Nothing heavy loads until the first image: the worker, the ONNX
// runtime and the model are fetched on first use. One image opens the editor; several run as a batch.
import * as Comlink from 'comlink';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '../../components/ui/Button';
import { Dropzone } from '../../components/ui/Dropzone';
import { type FileItem, FileList } from '../../components/ui/FileList';
import { Icon } from '../../components/ui/Icon';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { toast } from '../../components/ui/Toast';
import { outputName } from '../../lib/files';
import { downloadBlob, saveAll } from '../../lib/zip';
import { BackgroundPicker } from './BackgroundPicker';
import type { Backend, BgApi, BgResult, ModelKind, Progress } from './bg.worker';
import { Editor } from './Editor';
import { encode, type RenderSettings, render } from './render';

const SAMPLES = [
  { id: 'portrait', label: 'Portrait' },
  { id: 'pet', label: 'Pet' },
  { id: 'product', label: 'Product' },
] as const;

const DEFAULT_SETTINGS: RenderSettings = { background: { kind: 'transparent' }, softness: 0, trim: false };

const isHeic = (f: File) => /\.hei[cf]$/i.test(f.name) || /^image\/hei[cf]/i.test(f.type);

interface Single {
  file: File;
  kind: ModelKind;
  progress: Progress | null;
  result: BgResult | null;
}

interface BatchEntry {
  id: string;
  file: File;
  status: FileItem['status'];
  error?: string;
  result?: BgResult;
  png?: Blob;
  /** Settings the PNG was encoded with. */
  encodedWith?: RenderSettings;
  thumb?: string;
}

function stageText(p: Progress | null): { text: string; value?: number } {
  if (!p) return { text: 'Starting...' };
  switch (p.stage) {
    case 'loading-model':
      return {
        text: p.total
          ? `Downloading the model (first time only): ${(p.loaded / 1e6).toFixed(1)} of ${(p.total / 1e6).toFixed(1)} MB`
          : 'Downloading the model...',
        value: p.total ? p.loaded / p.total : undefined,
      };
    case 'decoding':
      return { text: 'Reading the image...' };
    case 'inference':
      return { text: 'Finding the subject...' };
    case 'compositing':
      return { text: 'Refining the edges...' };
  }
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function RemoveBackground() {
  const worker = useRef<Worker | null>(null);
  const api = useRef<Comlink.Remote<BgApi> | null>(null);
  const [backend, setBackend] = useState<Backend>('wasm');
  const [single, setSingle] = useState<Single | null>(null);
  const [batch, setBatch] = useState<BatchEntry[] | null>(null);
  const [batchKind, setBatchKind] = useState<ModelKind>('person');
  const [openId, setOpenId] = useState<string | null>(null);
  const settings = useRef<RenderSettings>(DEFAULT_SETTINGS);
  const [batchBg, setBatchBg] = useState(DEFAULT_SETTINGS.background);
  const run = useRef(0);

  useEffect(
    () => () => {
      worker.current?.terminate();
    },
    [],
  );

  const getApi = (): Comlink.Remote<BgApi> => {
    if (!api.current) {
      worker.current = new Worker(new URL('./bg.worker.ts', import.meta.url), { type: 'module' });
      api.current = Comlink.wrap<BgApi>(worker.current);
    }
    return api.current;
  };

  /** Runs the model; a WebGPU failure switches to WASM and retries once. */
  const segment = async (file: Blob, kind: ModelKind, onProgress: (p: Progress) => void): Promise<BgResult> => {
    const remote = getApi();
    const progress = Comlink.proxy(onProgress);
    const used = await remote.warm(kind, progress);
    setBackend(used);
    try {
      return await remote.process(file, kind, progress);
    } catch (err) {
      if (used !== 'webgpu') throw err;
      console.warn('WebGPU run failed, retrying on WASM', err);
      await remote.useWasmOnly();
      setBackend(await remote.warm(kind, progress));
      return await remote.process(file, kind, progress);
    }
  };

  const reset = () => {
    run.current++;
    for (const b of batch ?? []) if (b.thumb) URL.revokeObjectURL(b.thumb);
    setSingle(null);
    setBatch(null);
    setOpenId(null);
  };

  const startSingle = async (file: File, kind: ModelKind) => {
    const id = ++run.current;
    setSingle({ file, kind, progress: null, result: null });
    try {
      const result = await segment(file, kind, (p) => {
        if (run.current === id) setSingle((s) => (s ? { ...s, progress: p } : s));
      });
      if (run.current !== id) return;
      setBackend(result.backend);
      setSingle({ file, kind, progress: null, result });
    } catch (err) {
      if (run.current !== id) return;
      toast(`Could not process ${file.name}: ${errMsg(err)}`, { kind: 'error' });
      setSingle(null);
    }
  };

  const encodeEntry = async (e: BatchEntry, s: RenderSettings): Promise<Blob> => {
    const r = e.result as BgResult;
    return encode(render(r.rgba, r.alpha, r.width, r.height, s), 'png');
  };

  const startBatch = async (files: File[], kind: ModelKind) => {
    const id = ++run.current;
    let list: BatchEntry[] = files.map((file, i) => ({ id: `${Date.now()}-${i}`, file, status: 'queued' }));
    const update = (eid: string, patch: Partial<BatchEntry>) => {
      list = list.map((x) => (x.id === eid ? { ...x, ...patch } : x));
      if (run.current === id) setBatch(list);
    };
    setBatch(list);
    for (const entry of list) {
      if (run.current !== id) return;
      update(entry.id, { status: 'processing' });
      try {
        const result = await segment(entry.file, kind, () => undefined);
        if (run.current !== id) return;
        setBackend(result.backend);
        const s = settings.current;
        const png = await encodeEntry({ ...entry, result }, s);
        update(entry.id, { status: 'done', result, png, encodedWith: s, thumb: URL.createObjectURL(png) });
      } catch (err) {
        update(entry.id, { status: 'error', error: errMsg(err) });
      }
    }
  };

  const onFiles = (files: File[]) => {
    const heic = files.filter(isHeic);
    if (heic.length)
      toast('Convert HEIC first', {
        kind: 'error',
        action: { label: 'Open HEIC to JPG', onClick: () => location.assign('/heic-to-jpg') },
      });
    const ok = files.filter((f) => !isHeic(f));
    if (!ok.length) return;
    if (ok.length === 1 && !batch) void startSingle(ok[0], single?.kind ?? 'person');
    else void startBatch(batch ? [...batch.map((b) => b.file), ...ok] : ok, batchKind);
  };

  const trySample = async (id: string) => {
    try {
      const res = await fetch(`/samples/${id}.jpg`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      void startSingle(new File([blob], `${id}.jpg`, { type: 'image/jpeg' }), id === 'product' ? 'object' : 'person');
    } catch (err) {
      toast(`Could not load the sample: ${errMsg(err)}`, { kind: 'error' });
    }
  };

  const downloadAll = async () => {
    if (!batch) return;
    const taken = new Set<string>();
    const files = [];
    for (const e of batch) {
      if (e.status !== 'done' || !e.result) continue;
      let png = e.png as Blob;
      if (e.encodedWith !== settings.current) png = await encodeEntry(e, settings.current);
      files.push({ name: outputName(e.file.name, { suffix: '-nobg', ext: 'png' }, taken), data: new Uint8Array(await png.arrayBuffer()) });
    }
    if (!files.length) return;
    try {
      await saveAll(files, { zipName: 'nopload-nobg.zip' });
    } catch (err) {
      toast(`Could not save the files: ${errMsg(err)}`, { kind: 'error' });
    }
  };

  const downloadOne = async (eid: string) => {
    const e = batch?.find((x) => x.id === eid);
    if (!e?.result) return;
    const png = e.encodedWith === settings.current && e.png ? e.png : await encodeEntry(e, settings.current);
    downloadBlob(png, outputName(e.file.name, { suffix: '-nobg', ext: 'png' }));
  };

  const setBatchSettings = (s: RenderSettings) => {
    settings.current = s;
  };

  // ------------------------------------------------------------------ views

  const opened = openId ? batch?.find((b) => b.id === openId) : undefined;
  if (opened?.result) {
    const r = opened.result;
    return (
      <Editor
        key={opened.id}
        name={opened.file.name}
        width={r.width}
        height={r.height}
        rgba={r.rgba}
        alpha={r.alpha}
        backend={backend}
        kind={batchKind}
        onKindChange={(k) => {
          setBatchKind(k);
          setOpenId(null);
          void startBatch(
            (batch ?? []).map((b) => b.file),
            k,
          );
        }}
        onNew={() => setOpenId(null)}
        newLabel="Back to the list"
        initialSettings={settings.current}
        onSettingsChange={(s) => {
          setBatchSettings(s);
          setBatchBg(s.background);
        }}
        onAlphaChange={(a) => {
          r.alpha = new Uint8ClampedArray(a);
          setBatch((list) => (list ?? []).map((x) => (x.id === opened.id ? { ...x, encodedWith: undefined } : x)));
        }}
      />
    );
  }

  if (batch) {
    const done = batch.filter((b) => b.status === 'done').length;
    const items: FileItem[] = batch.map((b) => ({
      id: b.id,
      name: b.file.name,
      inBytes: b.file.size,
      outBytes: b.png?.size,
      status: b.status,
      thumb: b.thumb,
      error: b.error,
    }));
    return (
      <div class="flex flex-col gap-5">
        <Dropzone onFiles={onFiles} accept="image/*,.heic,.heif" compact title="Add more images" hint="Drop, paste or click" />
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted" aria-live="polite">
            {done} of {batch.length} done. Open a file to fine-tune it.
          </p>
          <div class="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              Clear
            </Button>
            <Button onClick={downloadAll} disabled={done === 0}>
              <Icon name="download" size={18} /> Download all
            </Button>
          </div>
        </div>
        <FileList
          items={items}
          onOpen={(id) => setOpenId(id)}
          onDownload={(id) => void downloadOne(id)}
          onRemove={(id) => setBatch((l) => ((l ?? []).length > 1 ? (l ?? []).filter((x) => x.id !== id) : null))}
        />
        <details class="rounded-lg border border-line bg-surface p-4">
          <summary class="cursor-pointer text-sm font-medium">Background for all files</summary>
          <div class="mt-4">
            <BackgroundPicker
              value={batchBg}
              onChange={(b) => {
                setBatchBg(b);
                settings.current = { ...settings.current, background: b };
              }}
            />
          </div>
        </details>
      </div>
    );
  }

  if (single?.result) {
    const r = single.result;
    return (
      <Editor
        key={`${single.file.name}-${single.kind}-${run.current}`}
        name={single.file.name}
        width={r.width}
        height={r.height}
        rgba={r.rgba}
        alpha={r.alpha}
        backend={backend}
        kind={single.kind}
        onKindChange={(k) => void startSingle(single.file, k)}
        onNew={reset}
      />
    );
  }

  if (single) {
    const st = stageText(single.progress);
    return (
      <div class="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface px-6 py-16 text-center" aria-busy="true">
        <p class="text-lg font-semibold">Removing the background from {single.file.name}</p>
        <div class="w-full max-w-md">
          <ProgressBar value={st.value} label={st.text} />
        </div>
        <p class="text-sm text-muted" aria-live="polite">
          {st.text}
        </p>
        <Button variant="ghost" onClick={reset}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-4">
      <Dropzone
        onFiles={onFiles}
        accept="image/*,.heic,.heif"
        multiple
        paste
        title="Drop a photo to remove its background"
        hint="or click to choose, or paste an image"
        onReject={(files) => toast(`Not an image: ${files.map((f) => f.name).join(', ')}`, { kind: 'error' })}
      />
      <div class="flex flex-wrap items-center justify-center gap-2 text-sm">
        <span class="text-muted">No photo handy? Try a sample:</span>
        {SAMPLES.map((s) => (
          <Button key={s.id} variant="secondary" size="sm" onClick={() => void trySample(s.id)}>
            <Icon name="image" size={16} /> {s.label}
          </Button>
        ))}
      </div>
      <p class="flex items-center justify-center gap-1.5 text-center text-sm text-muted">
        <Icon name="lock" size={16} /> Runs on your device. Model 6.6 MB, downloaded once.
      </p>
    </div>
  );
}
