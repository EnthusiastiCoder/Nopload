// Per-tool settings and the pipeline each tool builds from them.
import { useId } from 'preact/hooks';
import { Segmented } from '../../components/ui/Segmented';
import { Slider } from '../../components/ui/Slider';
import { Toggle } from '../../components/ui/Toggle';
import type { OutputFormat, Step } from './engine';
import type { ResizeMode } from './resize';

export type Kind = 'compress' | 'convert' | 'resize' | 'heic' | 'exif';
export type ResizeKind = ResizeMode['kind'];

export interface Settings {
  quality: number;
  compressFormat: 'same' | 'webp' | 'avif';
  maxDim: string;
  convertFormat: OutputFormat;
  qualities: Record<string, number>;
  background: string;
  resizeKind: ResizeKind;
  width: string;
  height: string;
  percent: number;
  ratio: '1:1' | '4:5' | '16:9' | '3:2';
  heicFormat: 'jpeg' | 'png';
  heicQuality: number;
  keepIcc: boolean;
  keepOrientation: boolean;
}

export const defaultSettings = (): Settings => ({
  quality: 75,
  compressFormat: 'same',
  maxDim: '',
  convertFormat: 'webp',
  qualities: { jpeg: 85, webp: 80, avif: 60, jxl: 75 },
  background: '#ffffff',
  resizeKind: 'fit',
  width: '1200',
  height: '1200',
  percent: 50,
  ratio: '1:1',
  heicFormat: 'jpeg',
  heicQuality: 90,
  keepIcc: true,
  keepOrientation: true,
});

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const px = (s: string, fallback: number) => {
  const v = Math.round(Number(s));
  return v >= 1 ? v : fallback;
};

export function buildPipeline(kind: Kind, s: Settings): Step[] {
  switch (kind) {
    case 'compress': {
      const steps: Step[] = [{ kind: 'decode' }];
      const m = Math.round(Number(s.maxDim));
      if (m >= 1) steps.push({ kind: 'resize', mode: { kind: 'fit', w: m, h: m }, noUpscale: true });
      steps.push({ kind: 'encode', format: s.compressFormat, quality: s.quality });
      return steps;
    }
    case 'convert':
      return [
        { kind: 'decode' },
        { kind: 'encode', format: s.convertFormat, quality: s.qualities[s.convertFormat], background: rgb(s.background) },
      ];
    case 'resize': {
      let mode: ResizeMode;
      switch (s.resizeKind) {
        case 'percent':
          mode = { kind: 'percent', p: s.percent };
          break;
        case 'width':
          mode = { kind: 'width', w: px(s.width, 1200), keepAspect: true };
          break;
        case 'height':
          mode = { kind: 'height', h: px(s.height, 1200) };
          break;
        case 'cover':
          mode = { kind: 'cover', w: px(s.width, 1200), h: px(s.height, 1200) };
          break;
        case 'aspect':
          mode = { kind: 'aspect', ratio: s.ratio };
          break;
        default:
          mode = { kind: 'fit', w: px(s.width, 1200), h: px(s.height, 1200) };
      }
      return [{ kind: 'decode' }, { kind: 'resize', mode }, { kind: 'encode', format: 'same', quality: 90 }];
    }
    case 'heic':
      return [{ kind: 'decode' }, { kind: 'encode', format: s.heicFormat, quality: s.heicQuality, background: [255, 255, 255] }];
    case 'exif':
      return [{ kind: 'stripMetadata', keepIcc: s.keepIcc, keepOrientation: s.keepOrientation }];
  }
}

function NumberField({ label, value, onInput }: { label: string; value: string; onInput: (v: string) => void }) {
  const id = useId();
  return (
    <div class="flex flex-col gap-1.5">
      <label for={id} class="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min="1"
        inputMode="numeric"
        value={value}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        class="min-h-11 w-36 rounded-md border border-line bg-surface px-3 text-sm"
      />
    </div>
  );
}

function ColourField({ value, onInput }: { value: string; onInput: (v: string) => void }) {
  const id = useId();
  return (
    <div class="flex flex-col gap-1.5">
      <label for={id} class="text-sm font-medium">
        Background colour
      </label>
      <input
        id={id}
        type="color"
        value={value}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        class="h-11 w-20 cursor-pointer rounded-md border border-line bg-surface p-1"
      />
      <span class="text-xs text-muted">Fills transparent areas when saving as JPG.</span>
    </div>
  );
}

export function SettingsPanel({ kind, settings: s, update }: { kind: Kind; settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <section aria-label="Settings" class="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4 sm:p-5">
      {kind === 'compress' && (
        <>
          <Slider label="Quality" value={s.quality} min={10} max={100} onInput={(v) => update({ quality: v })} />
          <Segmented
            label="Output format"
            value={s.compressFormat}
            onChange={(v) => update({ compressFormat: v })}
            options={[
              { value: 'same', label: 'Keep format' },
              { value: 'webp', label: 'WebP' },
              { value: 'avif', label: 'AVIF' },
            ]}
          />
          <NumberField label="Max dimension (px, optional)" value={s.maxDim} onInput={(v) => update({ maxDim: v })} />
          <p class="text-sm text-muted">Metadata such as GPS and camera details is always removed when an image is re-encoded.</p>
        </>
      )}
      {kind === 'convert' && (
        <>
          <Segmented
            label="Convert to"
            value={s.convertFormat}
            onChange={(v) => update({ convertFormat: v })}
            options={[
              { value: 'jpeg', label: 'JPG' },
              { value: 'png', label: 'PNG' },
              { value: 'webp', label: 'WebP' },
              { value: 'avif', label: 'AVIF' },
              { value: 'jxl', label: 'JXL' },
            ]}
          />
          {s.convertFormat !== 'png' && (
            <Slider
              label="Quality"
              value={s.qualities[s.convertFormat]}
              min={10}
              max={100}
              onInput={(v) => update({ qualities: { ...s.qualities, [s.convertFormat]: v } })}
            />
          )}
          {s.convertFormat === 'jpeg' && <ColourField value={s.background} onInput={(v) => update({ background: v })} />}
        </>
      )}
      {kind === 'resize' && (
        <>
          <Segmented
            label="Resize mode"
            value={s.resizeKind}
            onChange={(v) => update({ resizeKind: v })}
            options={[
              { value: 'fit', label: 'Fit inside box' },
              { value: 'cover', label: 'Fill and crop' },
              { value: 'percent', label: 'Scale by percent' },
              { value: 'width', label: 'Exact width' },
              { value: 'height', label: 'Exact height' },
              { value: 'aspect', label: 'Crop to ratio' },
            ]}
          />
          <div class="flex flex-wrap gap-4">
            {(s.resizeKind === 'fit' || s.resizeKind === 'cover' || s.resizeKind === 'width') && (
              <NumberField label="Width (px)" value={s.width} onInput={(v) => update({ width: v })} />
            )}
            {(s.resizeKind === 'fit' || s.resizeKind === 'cover' || s.resizeKind === 'height') && (
              <NumberField label="Height (px)" value={s.height} onInput={(v) => update({ height: v })} />
            )}
          </div>
          {s.resizeKind === 'percent' && (
            <Slider label="Scale" value={s.percent} min={5} max={200} onInput={(v) => update({ percent: v })} format={(v) => `${v}%`} />
          )}
          {s.resizeKind === 'aspect' && (
            <Segmented
              label="Ratio"
              value={s.ratio}
              onChange={(v) => update({ ratio: v })}
              options={(['1:1', '4:5', '16:9', '3:2'] as const).map((r) => ({ value: r, label: r }))}
            />
          )}
          <p class="text-sm text-muted">The output keeps each picture's own format.</p>
        </>
      )}
      {kind === 'heic' && (
        <>
          <Segmented
            label="Save as"
            value={s.heicFormat}
            onChange={(v) => update({ heicFormat: v })}
            options={[
              { value: 'jpeg', label: 'JPG' },
              { value: 'png', label: 'PNG' },
            ]}
          />
          {s.heicFormat === 'jpeg' && (
            <Slider label="JPG quality" value={s.heicQuality} min={50} max={100} onInput={(v) => update({ heicQuality: v })} />
          )}
          <p class="text-sm text-muted">Only the main picture of each HEIC file is converted, not Live Photo video or depth data.</p>
        </>
      )}
      {kind === 'exif' && (
        <>
          <Toggle label="Keep colour profile" checked={s.keepIcc} onChange={(v) => update({ keepIcc: v })} hint="Keeps colours accurate." />
          <Toggle
            label="Keep orientation"
            checked={s.keepOrientation}
            onChange={(v) => update({ keepOrientation: v })}
            hint="Keeps photos the right way up."
          />
          <p class="text-sm text-muted">Pixels are never re-encoded, so quality is unchanged.</p>
        </>
      )}
    </section>
  );
}
