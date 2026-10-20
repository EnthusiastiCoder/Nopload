// The single-image editor: preview with Erase/Restore brushes and undo, background, edge softness,
// crop, model choice, a before/after compare, and full-resolution downloads.
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { NextSteps } from '../../components/NextSteps';
import { BeforeAfter } from '../../components/ui/BeforeAfter';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Segmented } from '../../components/ui/Segmented';
import { Slider } from '../../components/ui/Slider';
import { toast } from '../../components/ui/Toast';
import { Toggle } from '../../components/ui/Toggle';
import { outputName } from '../../lib/files';
import { downloadBlob } from '../../lib/zip';
import { BackgroundPicker, type BgChoice, hexToRgb } from './BackgroundPicker';
import { BrushCanvas, type BrushTool, type StrokeEvent } from './BrushCanvas';
import type { Backend, ModelKind } from './bg.worker';
import { type Background, blurRgba, composite, refineAlpha } from './matte';
import { coverPixels, encode, type OutputFormat, type RenderSettings, render } from './render';

const PREVIEW_MAX = 1280;
const UNDO_MAX = 30;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface UndoStep {
  rect: Rect;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
}

export interface EditorProps {
  name: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** The model's matte at full resolution. The editor edits its own copy. */
  alpha: Uint8ClampedArray;
  backend: Backend;
  kind: ModelKind;
  onKindChange: (kind: ModelKind) => void;
  onNew: () => void;
  newLabel?: string;
  /** Called with the edited matte after every stroke, undo or redo. */
  onAlphaChange?: (alpha: Uint8ClampedArray) => void;
  /** Called whenever the export settings change. */
  onSettingsChange?: (s: RenderSettings) => void;
  initialSettings?: RenderSettings;
}

function copyRect(src: Uint8ClampedArray, width: number, r: Rect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(r.w * r.h);
  for (let y = 0; y < r.h; y++) out.set(src.subarray((r.y + y) * width + r.x, (r.y + y) * width + r.x + r.w), y * r.w);
  return out;
}

function pasteRect(dst: Uint8ClampedArray, width: number, r: Rect, patch: Uint8ClampedArray): void {
  for (let y = 0; y < r.h; y++) dst.set(patch.subarray(y * r.w, (y + 1) * r.w), (r.y + y) * width + r.x);
}

/** Fills a disc of `value` into a W x H mask and grows `dirty` to cover it. */
function stamp(mask: Uint8ClampedArray, W: number, H: number, cx: number, cy: number, r: number, value: number, dirty: Rect | null): Rect {
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  let minX = W;
  let maxX = -1;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    const span = r * r - dy * dy;
    if (span < 0) continue;
    const dx = Math.sqrt(span);
    const x0 = Math.max(0, Math.ceil(cx - dx - 0.5));
    const x1 = Math.min(W - 1, Math.floor(cx + dx - 0.5));
    if (x1 < x0) continue;
    mask.fill(value, y * W + x0, y * W + x1 + 1);
    if (x0 < minX) minX = x0;
    if (x1 > maxX) maxX = x1;
  }
  if (maxX < 0) return dirty ?? { x: 0, y: 0, w: 0, h: 0 };
  const r2 = { x: minX, y: y0, w: maxX - minX + 1, h: y1 - y0 + 1 };
  if (!dirty || dirty.w === 0) return r2;
  const x = Math.min(dirty.x, r2.x);
  const y = Math.min(dirty.y, r2.y);
  return { x, y, w: Math.max(dirty.x + dirty.w, r2.x + r2.w) - x, h: Math.max(dirty.y + dirty.h, r2.y + r2.h) - y };
}

async function previewPixels(rgba: Uint8ClampedArray, W: number, H: number, pw: number, ph: number): Promise<Uint8ClampedArray> {
  const img = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, W, H);
  const bmp = await createImageBitmap(img, { resizeWidth: pw, resizeHeight: ph, resizeQuality: 'high' });
  try {
    const c = new OffscreenCanvas(pw, ph);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available.');
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, pw, ph).data;
  } finally {
    bmp.close();
  }
}

async function pngUrl(data: Uint8ClampedArray, w: number, h: number): Promise<string> {
  return URL.createObjectURL(await encode({ data, width: w, height: h }, 'png'));
}

export function Editor({
  name,
  width: W,
  height: H,
  rgba,
  alpha,
  backend,
  kind,
  onKindChange,
  onNew,
  newLabel = 'New image',
  onAlphaChange,
  onSettingsChange,
  initialSettings,
}: EditorProps) {
  const scale = Math.min(1, PREVIEW_MAX / Math.max(W, H));
  const pw = Math.max(1, Math.round(W * scale));
  const ph = Math.max(1, Math.round(H * scale));

  const edit = useRef(new Uint8ClampedArray(alpha));
  const undo = useRef<UndoStep[]>([]);
  const redo = useRef<UndoStep[]>([]);
  const stroke = useRef<{ snapshot: Uint8ClampedArray; last: { x: number; y: number }; dirty: Rect | null } | null>(null);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });

  const [tool, setTool] = useState<BrushTool>('move');
  const [brush, setBrush] = useState(40);
  const [softness, setSoftness] = useState(initialSettings?.softness ?? 0);
  const [trim, setTrim] = useState(initialSettings?.trim ?? false);
  const [bg, setBg] = useState<BgChoice>(initialSettings?.background ?? { kind: 'transparent' });
  const [view, setView] = useState<'result' | 'compare'>('result');
  const [busy, setBusy] = useState<OutputFormat | null>(null);
  const [version, setVersion] = useState(0);

  const settings = useMemo<RenderSettings>(() => ({ background: bg, softness, trim }), [bg, softness, trim]);
  useEffect(() => onSettingsChange?.(settings), [settings]);

  // Preview buffers: a downscaled original once, and the alpha resampled (nearest) on each redraw.
  const [prgba, setPrgba] = useState<Uint8ClampedArray | null>(null);
  useEffect(() => {
    let live = true;
    previewPixels(rgba, W, H, pw, ph)
      .then((p) => live && setPrgba(p))
      .catch((err) => toast(`Could not draw the preview: ${(err as Error).message}`, { kind: 'error' }));
    return () => {
      live = false;
    };
  }, [rgba, W, H, pw, ph]);

  const maps = useMemo(() => {
    const xs = new Uint32Array(pw);
    const ys = new Uint32Array(ph);
    for (let x = 0; x < pw; x++) xs[x] = Math.min(W - 1, Math.floor(((x + 0.5) * W) / pw));
    for (let y = 0; y < ph; y++) ys[y] = Math.min(H - 1, Math.floor(((y + 0.5) * H) / ph));
    return { xs, ys };
  }, [W, H, pw, ph]);

  const previewAlpha = useCallback((): Uint8ClampedArray => {
    const a = edit.current;
    const out = new Uint8ClampedArray(pw * ph);
    const { xs, ys } = maps;
    for (let y = 0; y < ph; y++) {
      const row = ys[y] * W;
      const o = y * pw;
      for (let x = 0; x < pw; x++) out[o + x] = a[row + xs[x]];
    }
    return out;
  }, [maps, pw, ph, W]);

  const previewBg = useMemo<Background | null>(() => {
    if (!prgba) return null;
    switch (bg.kind) {
      case 'transparent':
        return { kind: 'transparent' };
      case 'color':
        return { kind: 'color', rgb: hexToRgb(bg.hex) };
      case 'blur':
        return { kind: 'image', rgba: blurRgba(prgba, pw, ph, Math.max(4, Math.round(Math.max(W, H) / 80)) * scale) };
      case 'image':
        return { kind: 'image', rgba: coverPixels(bg.bitmap, pw, ph) };
    }
  }, [bg, prgba, pw, ph, W, H, scale]);

  const previewComposite = useCallback((): Uint8ClampedArray | null => {
    if (!prgba || !previewBg) return null;
    const pa = previewAlpha();
    const a = softness > 0 ? refineAlpha(pa, pw, ph, softness * scale) : pa;
    return composite(prgba, a, previewBg, { width: pw, height: ph });
  }, [prgba, previewBg, previewAlpha, softness, pw, ph, scale]);

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const out = previewComposite();
      if (!out) return;
      ctx.putImageData(new ImageData(out as Uint8ClampedArray<ArrayBuffer>, pw, ph), 0, 0);
    },
    [previewComposite, pw, ph],
  );

  // Coalesce redraws to one per frame while painting.
  const raf = useRef(0);
  const redraw = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setVersion((v) => v + 1);
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const commit = useCallback(() => {
    setHistory({ undo: undo.current.length, redo: redo.current.length });
    onAlphaChange?.(edit.current);
    redraw();
  }, [onAlphaChange, redraw]);

  const onStroke = useCallback(
    (e: StrokeEvent) => {
      if (tool === 'move') return;
      const value = tool === 'erase' ? 0 : 255;
      const r = Math.max(0.5, e.radius);
      if (e.phase === 'start') {
        stroke.current = { snapshot: new Uint8ClampedArray(edit.current), last: { x: e.x, y: e.y }, dirty: null };
        stroke.current.dirty = stamp(edit.current, W, H, e.x, e.y, r, value, null);
        redraw();
        return;
      }
      const s = stroke.current;
      if (!s) return;
      const dx = e.x - s.last.x;
      const dy = e.y - s.last.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / Math.max(1, r / 3)));
      for (let i = 1; i <= steps; i++)
        s.dirty = stamp(edit.current, W, H, s.last.x + (dx * i) / steps, s.last.y + (dy * i) / steps, r, value, s.dirty);
      s.last = { x: e.x, y: e.y };
      if (e.phase === 'end') {
        stroke.current = null;
        const rect = s.dirty;
        if (rect && rect.w > 0 && rect.h > 0) {
          undo.current.push({ rect, before: copyRect(s.snapshot, W, rect), after: copyRect(edit.current, W, rect) });
          if (undo.current.length > UNDO_MAX) undo.current.shift();
          redo.current = [];
        }
        commit();
        return;
      }
      redraw();
    },
    [tool, W, H, redraw, commit],
  );

  const doUndo = useCallback(() => {
    const step = undo.current.pop();
    if (!step) return;
    pasteRect(edit.current, W, step.rect, step.before);
    redo.current.push(step);
    commit();
  }, [W, commit]);

  const doRedo = useCallback(() => {
    const step = redo.current.pop();
    if (!step) return;
    pasteRect(edit.current, W, step.rect, step.after);
    undo.current.push(step);
    commit();
  }, [W, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || t?.tagName === 'TEXTAREA') return;
      if (t?.tagName === 'INPUT' && /^(text|number|search|email|url|tel|password)$/.test((t as HTMLInputElement).type)) return;
      e.preventDefault();
      if (key === 'y' || e.shiftKey) doRedo();
      else doUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo]);

  // Before/after images for the compare view.
  const [compare, setCompare] = useState<{ before: string; after: string } | null>(null);
  useEffect(() => {
    if (view !== 'compare' || !prgba) return;
    let live = true;
    let urls: string[] = [];
    const after = previewComposite();
    if (!after) return;
    Promise.all([pngUrl(prgba, pw, ph), pngUrl(after, pw, ph)])
      .then(([b, a]) => {
        urls = [b, a];
        if (live) setCompare({ before: b, after: a });
        else for (const u of urls) URL.revokeObjectURL(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      for (const u of urls) URL.revokeObjectURL(u);
      setCompare(null);
    };
  }, [view, prgba, previewComposite, pw, ph, history]);

  const pickTool = (t: BrushTool) => {
    setTool(t);
    if (t !== 'move') setView('result');
  };

  const download = async (format: OutputFormat) => {
    setBusy(format);
    try {
      // Let the button show its busy state before the heavy work.
      await new Promise((r) => setTimeout(r, 0));
      const img = render(rgba, edit.current, W, H, settings);
      const blob = await encode(img, format);
      downloadBlob(blob, outputName(name, { suffix: '-nobg', ext: format }));
    } catch (err) {
      toast(`Could not save the image: ${(err as Error).message}`, { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  /** The current edit as a PNG, for the next tool. */
  const pngForNext = async () => {
    const blob = await encode(render(rgba, edit.current, W, H, settings), 'png');
    return [{ name: outputName(name, { suffix: '-nobg', ext: 'png' }), blob }];
  };

  const transparent = bg.kind === 'transparent';

  return (
    <div data-testid="result" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="flex min-w-0 flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="max-w-xs flex-1">
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: 'result', label: 'Result' },
                { value: 'compare', label: 'Compare' },
              ]}
            />
          </div>
          <p class="flex items-center gap-1.5 text-sm text-muted">
            <Icon name={backend === 'webgpu' ? 'zap' : 'cpu'} size={16} />
            {backend === 'webgpu' ? 'Using your GPU (WebGPU)' : 'Using your CPU (WASM)'}
          </p>
        </div>
        {view === 'compare' ? (
          compare ? (
            <BeforeAfter before={compare.before} after={compare.after} alt={`${name}, background removed`} checker={transparent} />
          ) : (
            <div class="checkerboard rounded-lg border border-line" style={{ aspectRatio: `${pw} / ${ph}` }} />
          )
        ) : (
          <BrushCanvas
            width={pw}
            height={ph}
            imageWidth={W}
            tool={tool}
            brushSize={brush}
            version={version}
            paint={paint}
            onStroke={onStroke}
            label={`${name} with the background removed. Use Erase or Restore to fix the edges.`}
          />
        )}
        <p class="text-xs text-muted">
          {W} x {H} px. Downloads are full resolution. Undo with Ctrl+Z, redo with Ctrl+Shift+Z.
        </p>
      </div>

      <div class="flex flex-col gap-5">
        <Segmented
          label="Tool"
          value={tool}
          onChange={pickTool}
          options={[
            { value: 'move', label: 'Move' },
            { value: 'erase', label: 'Erase' },
            { value: 'restore', label: 'Restore' },
          ]}
        />
        <Slider label="Brush size" value={brush} min={5} max={200} onInput={setBrush} format={(v) => `${v} px`} />
        <div class="flex gap-2">
          <Button variant="secondary" size="sm" disabled={history.undo === 0} onClick={doUndo}>
            Undo
          </Button>
          <Button variant="secondary" size="sm" disabled={history.redo === 0} onClick={doRedo}>
            Redo
          </Button>
        </div>
        <Slider label="Edge softness" value={softness} min={0} max={10} onInput={setSoftness} format={(v) => `${v} px`} />
        <Toggle label="Crop to subject" checked={trim} onChange={setTrim} />
        <BackgroundPicker value={bg} onChange={setBg} />
        <Segmented
          label="Model"
          value={kind}
          onChange={onKindChange}
          options={[
            { value: 'person', label: 'Person' },
            { value: 'object', label: 'Object' },
          ]}
        />
        <div class="flex flex-col gap-2">
          <Button onClick={() => download('png')} disabled={busy !== null}>
            <Icon name="download" size={18} /> {busy === 'png' ? 'Saving...' : 'Download PNG'}
          </Button>
          <div class="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => download('jpg')}
              disabled={busy !== null || transparent}
              title={transparent ? 'JPG has no transparency: pick a background first' : undefined}
            >
              {busy === 'jpg' ? 'Saving...' : 'Download JPG'}
            </Button>
            <Button variant="secondary" onClick={() => download('webp')} disabled={busy !== null}>
              {busy === 'webp' ? 'Saving...' : 'Download WebP'}
            </Button>
          </div>
          <Button variant="ghost" onClick={onNew}>
            {newLabel}
          </Button>
        </div>
        <NextSteps current="remove-background" count={1} getFiles={pngForNext} disabled={busy !== null} />
      </div>
    </div>
  );
}
