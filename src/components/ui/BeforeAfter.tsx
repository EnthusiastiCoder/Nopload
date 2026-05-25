// Draggable before/after comparison. Pointer drag anywhere, or arrow keys on the handle.
import { useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';

export function BeforeAfter({
  before,
  after,
  alt,
  checker = true,
  initial = 50,
}: {
  before: string;
  after: string;
  alt: string;
  /** Show a checkerboard behind the "after" image (for transparency). */
  checker?: boolean;
  initial?: number;
}) {
  const [pos, setPos] = useState(initial);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={box}
      class={`relative w-full touch-none overflow-hidden rounded-lg border border-line select-none ${checker ? 'checkerboard' : ''}`}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      <img src={after} alt={`${alt} (after)`} class="block h-auto w-full" draggable={false} />
      <div class="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt={`${alt} (before)`} class="block h-auto w-full" draggable={false} />
      </div>
      <div class="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div class="absolute inset-y-0 -left-px w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.2)]" />
      </div>
      <button
        type="button"
        role="slider"
        aria-label="Compare before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`${Math.round(pos)}% original`}
        class="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-900 shadow-lift"
        style={{ left: `${pos}%` }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setPos((p) => Math.max(0, p - step));
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setPos((p) => Math.min(100, p + step));
          else if (e.key === 'Home') setPos(0);
          else if (e.key === 'End') setPos(100);
          else return;
          e.preventDefault();
        }}
      >
        <Icon name="chevrons-lr" size={18} />
      </button>
      <span class="pointer-events-none absolute top-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
        Before
      </span>
      <span class="pointer-events-none absolute top-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
        After
      </span>
    </div>
  );
}
