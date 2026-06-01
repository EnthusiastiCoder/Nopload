// Home page drop target: take images, then ask which tool to open.
// The hand-off of the queued files to the tool page is added by the home workstream (WS4).
import { useState } from 'preact/hooks';
import type { Tool } from '../tools/registry';
import { Dropzone } from './ui/Dropzone';
import { Icon } from './ui/Icon';

export default function HomeDrop({ tools }: { tools: Pick<Tool, 'slug' | 'name' | 'icon' | 'blurb'>[] }) {
  const [files, setFiles] = useState<File[]>([]);
  const n = files.length;
  return (
    <div class="space-y-4">
      <Dropzone onFiles={(f) => setFiles(f)} accept="image/*,.heic,.heif,.avif,.jxl" title="Drop images here" />
      {n > 0 && (
        <section class="rounded-xl border border-line bg-surface p-4 shadow-soft" aria-labelledby="chooser-title">
          <h2 id="chooser-title" class="mb-3 font-semibold">
            What do you want to do with {n} {n === 1 ? 'image' : 'images'}?
          </h2>
          <div class="grid gap-2 sm:grid-cols-2">
            {tools.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => location.assign(`/${t.slug}`)}
                class="flex min-h-11 items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:bg-surface-2"
              >
                <Icon name={t.icon} size={18} class="text-accent-600" />
                <span class="font-medium">{t.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
