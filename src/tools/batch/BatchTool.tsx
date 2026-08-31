// Shared UI for the five batch tools: dropzone, live file list, summary bar, ZIP / folder download, cancel.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Button } from '../../components/ui/Button';
import { Dropzone } from '../../components/ui/Dropzone';
import { type FileItem, FileList } from '../../components/ui/FileList';
import { formatBytes } from '../../lib/files';
import { canSaveToFolder, saveAll } from '../../lib/zip';
import { type BatchResult, poolSize, processBatch, type Step } from './engine';
import { readSummary } from './metadata';
import { buildPipeline, defaultSettings, type Kind, type Settings, SettingsPanel } from './SettingsPanels';

const ACCEPT = 'image/*,.heic,.heif,.avif,.jxl';

export interface Finding {
  id: string;
  name: string;
  gps: boolean;
  details: string[];
}

function loadSettings(kind: Kind): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(`nopload:${kind}`);
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<Settings>) } : base;
  } catch {
    return base;
  }
}

let counter = 0;

export default function BatchTool({ kind }: { kind: Kind }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [items, setItems] = useState<FileItem[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [running, setRunning] = useState(0);
  const [message, setMessage] = useState('');
  const results = useRef(new Map<string, BatchResult>());
  const controller = useRef<AbortController | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => setSettings(loadSettings(kind)), [kind]);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      localStorage.setItem(`nopload:${kind}`, JSON.stringify(next));
    } catch {
      /* private mode: settings just are not remembered */
    }
  };

  async function addFiles(files: File[]) {
    setMessage('');
    controller.current ??= new AbortController();
    const ac = controller.current;
    const pipeline: Step[] = buildPipeline(kind, settingsRef.current);
    const ids = files.map(() => `f${++counter}`);
    setItems((cur) => [
      ...cur,
      ...files.map(
        (f, i): FileItem => ({
          id: ids[i],
          name: f.name,
          inBytes: f.size,
          status: i < poolSize() ? 'processing' : 'queued',
        }),
      ),
    ]);
    setRunning((n) => n + 1);
    try {
      const inputs = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
      if (kind === 'exif') {
        void Promise.all(
          inputs.map(async (inp, i) => {
            const s = await readSummary(inp.data).catch(() => undefined);
            if (!s) return;
            const details = [s.make, s.model, s.software].filter(Boolean) as string[];
            if (s.hasGps || details.length) {
              setFindings((cur) => [...cur, { id: ids[i], name: inp.name, gps: s.hasGps, details }]);
            }
          }),
        );
      }
      await processBatch(inputs, pipeline, {
        signal: ac.signal,
        onItem: (r, i) => {
          results.current.set(ids[i], r);
          setItems((cur) => {
            const next = cur.map((it) =>
              it.id === ids[i]
                ? {
                    ...it,
                    name: r.name,
                    outBytes: r.outBytes,
                    status: 'done' as const,
                    note: r.warnings.includes('already-optimal') ? 'Already optimal' : undefined,
                  }
                : it,
            );
            const q = next.find((it) => it.status === 'queued' && ids.includes(it.id));
            return q ? next.map((it) => (it === q ? { ...it, status: 'processing' as const } : it)) : next;
          });
        },
      });
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      setItems((cur) =>
        cur.map((it) =>
          ids.includes(it.id) && it.status !== 'done'
            ? {
                ...it,
                status: aborted ? ('cancelled' as const) : ('error' as const),
                error: aborted ? undefined : 'Could not read this image',
              }
            : it,
        ),
      );
      if (!aborted) setMessage((e as Error)?.message ?? 'Something went wrong');
    } finally {
      setRunning((n) => n - 1);
    }
  }

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setItems((cur) => cur.map((it) => (it.status === 'queued' || it.status === 'processing' ? { ...it, status: 'cancelled' } : it)));
  }

  async function clear() {
    controller.current?.abort();
    controller.current = null;
    results.current.clear();
    setItems([]);
    setFindings([]);
  }

  const doneItems = items.filter((i) => i.status === 'done');
  const collect = async (): Promise<{ name: string; data: Uint8Array }[]> =>
    Promise.all(
      doneItems.map(async (it) => {
        const r = results.current.get(it.id) as BatchResult;
        return { name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) };
      }),
    );
  const download = (id: string) => {
    const r = results.current.get(id);
    if (r) void r.blob.arrayBuffer().then((b) => saveAll([{ name: r.name, data: new Uint8Array(b) }]));
  };

  const summary = useMemo(() => {
    const a = doneItems.reduce((s, i) => s + i.inBytes, 0);
    const b = doneItems.reduce((s, i) => s + (i.outBytes ?? 0), 0);
    const saved = a > 0 ? Math.round((1 - b / a) * 100) : 0;
    return { a, b, saved };
  }, [items]);

  const busy = running > 0;
  const n = items.length;

  return (
    <div class="flex flex-col gap-6">
      <SettingsPanel kind={kind} settings={settings} update={update} />
      <Dropzone onFiles={addFiles} accept={ACCEPT} folder />
      {message && (
        <p role="alert" class="text-sm text-red-700">
          {message}
        </p>
      )}
      {findings.length > 0 && (
        <ul class="flex flex-col gap-2" aria-label="Privacy findings">
          {findings.map((f) => (
            <li key={f.id} class="flex flex-wrap items-center gap-2 text-sm">
              <span class="font-medium">{f.name}</span>
              {f.gps && <span class="rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-800">GPS location found</span>}
              {f.details.length > 0 && <span class="text-muted">{f.details.join(' · ')}</span>}
            </li>
          ))}
        </ul>
      )}
      {n > 0 && (
        <>
          <div data-testid="file-list">
            <FileList items={items} onRemove={undefined} onDownload={download} />
          </div>
          <div class="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-lift">
            <p class="mr-auto text-sm">
              <span class="font-semibold">{n === 1 ? '1 file' : `${n} files`}</span>
              {doneItems.length > 0 && (
                <span class="tabular-nums text-muted">
                  {' · '}
                  {formatBytes(summary.a)} → {formatBytes(summary.b)} · saved {summary.saved}%
                </span>
              )}
            </p>
            {busy && (
              <Button variant="secondary" onClick={cancel}>
                Cancel
              </Button>
            )}
            <Button variant="ghost" onClick={clear}>
              Clear
            </Button>
            {canSaveToFolder() && (
              <Button variant="secondary" disabled={!doneItems.length} onClick={async () => saveAll(await collect(), { toFolder: true })}>
                Save to folder
              </Button>
            )}
            <Button disabled={!doneItems.length} onClick={async () => saveAll(await collect(), { zipName: `nopload-${kind}.zip` })}>
              Download all
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
