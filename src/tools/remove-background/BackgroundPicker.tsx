// Background choice for the cut-out: transparent, 8 swatches, a custom colour, a blurred copy of
// the original, or an uploaded image (drawn cover-fit at export).
import { useId } from 'preact/hooks';

export type BgChoice =
  | { kind: 'transparent' }
  | { kind: 'color'; hex: string }
  | { kind: 'blur' }
  | { kind: 'image'; bitmap: ImageBitmap; name: string };

const SWATCHES: { hex: string; name: string }[] = [
  { hex: '#ffffff', name: 'White' },
  { hex: '#000000', name: 'Black' },
  { hex: '#e5e7eb', name: 'Light grey' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#facc15', name: 'Yellow' },
  { hex: '#f9a8d4', name: 'Pink' },
];

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? Number.parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const ring = (on: boolean) =>
  on ? 'ring-2 ring-[var(--color-accent-600)] ring-offset-2 ring-offset-[var(--color-surface)]' : 'ring-1 ring-[var(--color-line)]';

export function BackgroundPicker({ value, onChange }: { value: BgChoice; onChange: (v: BgChoice) => void }) {
  const colorId = useId();
  const imageId = useId();
  const isHex = (hex: string) => value.kind === 'color' && value.hex.toLowerCase() === hex;
  const custom = value.kind === 'color' && !SWATCHES.some((s) => s.hex === value.hex.toLowerCase());

  const pickImage = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      onChange({ kind: 'image', bitmap, name: file.name });
    } catch {
      // The caller shows nothing for a bad file; keep the current background.
    }
  };

  return (
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-2 text-sm font-medium">Background</legend>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={value.kind === 'transparent'}
          title="Transparent"
          class={`checkerboard h-9 w-9 rounded-full ${ring(value.kind === 'transparent')}`}
          onClick={() => onChange({ kind: 'transparent' })}
        >
          <span class="sr-only">Transparent</span>
        </button>
        {SWATCHES.map((s) => (
          <button
            key={s.hex}
            type="button"
            aria-pressed={isHex(s.hex)}
            title={s.name}
            class={`h-9 w-9 rounded-full ${ring(isHex(s.hex))}`}
            style={{ background: s.hex }}
            onClick={() => onChange({ kind: 'color', hex: s.hex })}
          >
            <span class="sr-only">{s.name}</span>
          </button>
        ))}
        <label
          for={colorId}
          title="Custom colour"
          class={`relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] ${ring(custom)}`}
        >
          <span class="sr-only">Custom colour</span>
          <input
            id={colorId}
            type="color"
            value={value.kind === 'color' ? value.hex : '#ffffff'}
            onInput={(e) => onChange({ kind: 'color', hex: (e.target as HTMLInputElement).value })}
            class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={value.kind === 'blur'}
          class={`min-h-9 rounded-md px-3 text-sm font-medium ${ring(value.kind === 'blur')} ${value.kind === 'blur' ? 'bg-surface' : 'bg-surface-2'}`}
          onClick={() => onChange({ kind: 'blur' })}
        >
          Blur original
        </button>
        <label
          for={imageId}
          class={`flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium has-[:focus-visible]:outline-2 ${ring(value.kind === 'image')} ${value.kind === 'image' ? 'bg-surface' : 'bg-surface-2'}`}
        >
          {value.kind === 'image' ? `Image: ${value.name}` : 'Use an image'}
          <input id={imageId} type="file" accept="image/*" class="sr-only" onChange={pickImage} />
        </label>
      </div>
    </fieldset>
  );
}
