// The editing surface: shows the composited preview over a checkerboard, paints Erase/Restore
// strokes with mouse, touch or pen (pointer events), and zooms/pans with the wheel, pinch or the
// Move tool. Stroke points are reported in full-resolution image pixels.
import { useEffect, useRef, useState } from 'preact/hooks';

export type BrushTool = 'move' | 'erase' | 'restore';

export interface StrokeEvent {
  phase: 'start' | 'move' | 'end';
  x: number;
  y: number;
  /** Brush radius in full-resolution image pixels. */
  radius: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export function BrushCanvas({
  width,
  height,
  imageWidth,
  tool,
  brushSize,
  version,
  paint,
  onStroke,
  label,
}: {
  /** Preview (canvas backing store) size. */
  width: number;
  height: number;
  /** Full-resolution width, to convert screen pixels to image pixels. */
  imageWidth: number;
  tool: BrushTool;
  /** Brush diameter in screen pixels. */
  brushSize: number;
  /** Bump to redraw. */
  version: number;
  paint: (ctx: CanvasRenderingContext2D) => void;
  onStroke: (e: StrokeEvent) => void;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: { x: number; y: number }; view: typeof view } | null>(null);
  const drag = useRef<{ x: number; y: number; view: typeof view } | null>(null);
  const painting = useRef(false);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paint(ctx);
  }, [version, width, height, paint]);

  const clampView = (v: typeof view) => {
    const r = frame.current?.getBoundingClientRect();
    if (!r) return v;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom));
    const minX = r.width - r.width * zoom;
    const minY = r.height - r.height * zoom;
    return { zoom, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
  };

  /** Zooms by `factor` keeping the frame-relative point (fx, fy) fixed. */
  const zoomAt = (base: typeof view, factor: number, fx: number, fy: number) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base.zoom * factor));
    const k = zoom / base.zoom;
    return clampView({ zoom, x: fx - (fx - base.x) * k, y: fy - (fy - base.y) * k });
  };

  const toImage = (clientX: number, clientY: number) => {
    const r = canvas.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const scale = imageWidth / r.width;
    return { x: (clientX - r.left) * scale, y: (clientY - r.top) * scale, radius: (brushSize / 2) * scale };
  };

  const local = (e: PointerEvent | WheelEvent) => {
    const r = frame.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      // A second finger turns the gesture into pinch-zoom; abandon any stroke in progress.
      if (painting.current) {
        painting.current = false;
        const p = toImage(e.clientX, e.clientY);
        if (p) onStroke({ phase: 'end', ...p });
      }
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
      return;
    }
    if (tool === 'move' || e.button === 1) {
      drag.current = { ...local(e), view };
      return;
    }
    if (e.button !== 0) return;
    const p = toImage(e.clientX, e.clientY);
    if (!p) return;
    painting.current = true;
    onStroke({ phase: 'start', ...p });
  };

  const onPointerMove = (e: PointerEvent) => {
    const l = local(e);
    setCursor(l);
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, l);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const base = pinch.current.view;
      const z = zoomAt(base, dist / pinch.current.dist, pinch.current.mid.x, pinch.current.mid.y);
      setView(clampView({ ...z, x: z.x + mid.x - pinch.current.mid.x, y: z.y + mid.y - pinch.current.mid.y }));
      return;
    }
    if (drag.current) {
      const d = drag.current;
      setView(clampView({ zoom: d.view.zoom, x: d.view.x + l.x - d.x, y: d.view.y + l.y - d.y }));
      return;
    }
    if (painting.current) {
      const p = toImage(e.clientX, e.clientY);
      if (p) onStroke({ phase: 'move', ...p });
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
    if (painting.current) {
      painting.current = false;
      const p = toImage(e.clientX, e.clientY);
      if (p) onStroke({ phase: 'end', ...p });
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const l = local(e);
    setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), l.x, l.y));
  };

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    // Registered natively so preventDefault works (Preact's wheel listener may be passive).
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const showBrush = tool !== 'move' && cursor;

  return (
    <div class="flex flex-col gap-2">
      <div
        ref={frame}
        class="checkerboard relative w-full touch-none overflow-hidden rounded-lg border border-line select-none"
        style={{ aspectRatio: `${width} / ${height}`, cursor: tool === 'move' ? 'grab' : 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
      >
        <canvas
          ref={canvas}
          data-testid="brush-canvas"
          width={width}
          height={height}
          role="img"
          aria-label={label}
          class="absolute top-0 left-0 block h-full w-full origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        />
        {showBrush && (
          <div
            aria-hidden="true"
            class="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
            style={{
              width: `${brushSize}px`,
              height: `${brushSize}px`,
              left: `${cursor.x - brushSize / 2}px`,
              top: `${cursor.y - brushSize / 2}px`,
            }}
          />
        )}
      </div>
      <div class="flex items-center justify-between text-xs text-muted">
        <span>Scroll or pinch to zoom{view.zoom > 1 ? `: ${Math.round(view.zoom * 100)}%` : ''}</span>
        {view.zoom > 1 && (
          <button
            type="button"
            class="font-medium text-accent-700 underline underline-offset-2"
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          >
            Reset zoom
          </button>
        )}
      </div>
    </div>
  );
}
