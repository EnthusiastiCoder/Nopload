// Home page drop target: take images, ask which tool to open, then hand the files to that tool
// (lib/handoff.ts) so they arrive queued. Only tools that accept every dropped type are offered.
import { useState } from 'preact/hooks';
import { handOff } from '../lib/handoff';
import type { Tool } from '../tools/registry';
import { Dropzone } from './ui/Dropzone';
import { Icon } from './ui/Icon';

type Choice = Pick<Tool, 'slug' | 'name' | 'icon' | 'blurb' | 'accepts'>;

const EXT: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', jfif: 'jpeg', heif: 'heic', tif: 'tiff' };

/** The file's type in the registry's `accepts` vocabulary, from its MIME type or extension. */
function typeOf(f: File): string {
  const mime = /^image\/(?:x-)?([a-z0-9]+)/i.exec(f.type)?.[1]?.toLowerCase();
  const raw = mime ?? f.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT[raw] ?? raw;
}

export default function HomeDrop({ tools }: { tools: Choice[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const n = files.length;
  const types = new Set(files.map(typeOf));
  const fitting = tools.filter((t) => [...types].every((x) => t.accepts.includes(x)));
  const offered = fitting.length ? fitting : tools;
  return (
    <div class="space-y-4">
      <Dropzone onFiles={(f) => setFiles(f)} accept="image/*,.heic,.heif,.avif,.jxl" title="Drop images here" />
      {n > 0 && (
        <section class="rounded-xl border border-line bg-surface p-4 shadow-soft" aria-labelledby="chooser-title">
          <h2 id="chooser-title" class="mb-3 font-semibold">
            What do you want to do with {n} {n === 1 ? 'image' : 'images'}?
          </h2>
          <div class="grid gap-2 sm:grid-cols-2">
            {offered.map((t) => (
              <button
                key={t.slug}
                type="button"
                disabled={opening !== null}
                onClick={() => {
                  setOpening(t.slug);
                  void handOff(files, `/${t.slug}`).finally(() => setOpening(null));
                }}
                class="flex min-h-11 items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:bg-surface-2"
              >
                <Icon name={t.icon} size={18} class="text-accent-600" />
                <span class="font-medium">{t.name}</span>
                <span class="sr-only"> {n === 1 ? 'this image' : `these ${n} images`}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
