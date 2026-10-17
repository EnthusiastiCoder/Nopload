// "Next: compress these / remove background / strip EXIF": sends a tool's outputs to another tool
// without a re-drop (see lib/handoff.ts). The current tool is left out of the list.
import { useState } from 'preact/hooks';
import { handOff } from '../lib/handoff';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

export type NextTarget = 'compress-image' | 'remove-background' | 'remove-exif';

const TARGETS: { slug: NextTarget; one: string; many: string; icon: string }[] = [
  { slug: 'compress-image', one: 'Next: compress it', many: 'Next: compress these', icon: 'zap' },
  { slug: 'remove-background', one: 'Next: remove background', many: 'Next: remove backgrounds', icon: 'eraser' },
  { slug: 'remove-exif', one: 'Next: strip EXIF', many: 'Next: strip EXIF', icon: 'lock' },
];

export interface NextStepsProps {
  /** The tool this is shown on; it is not offered as a next step. */
  current: NextTarget | string;
  /** Produces the files to hand over (called on click, so it can render the latest edit). */
  getFiles: () => Promise<{ name: string; blob: Blob }[]>;
  count: number;
  disabled?: boolean;
  /** Restrict the offered targets (e.g. EXIF stripping only takes JPEG, PNG and WebP). */
  only?: NextTarget[];
}

export function NextSteps({ current, getFiles, count, disabled, only }: NextStepsProps) {
  const [busy, setBusy] = useState<NextTarget | null>(null);
  const targets = TARGETS.filter((t) => t.slug !== current && (!only || only.includes(t.slug)));
  if (!targets.length) return null;
  const go = async (to: NextTarget) => {
    setBusy(to);
    try {
      const files = await getFiles();
      if (files.length) await handOff(files, `/${to}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <nav aria-label="Next steps" class="flex flex-wrap gap-2">
      {targets.map((t) => (
        <Button
          key={t.slug}
          variant="secondary"
          size="sm"
          disabled={disabled || busy !== null || count === 0}
          onClick={() => void go(t.slug)}
        >
          <Icon name={t.icon} size={16} /> {busy === t.slug ? 'Opening...' : count === 1 ? t.one : t.many}
        </Button>
      ))}
    </nav>
  );
}
