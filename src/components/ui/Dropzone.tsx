// Drop target: click or Enter/Space to browse, drag files anywhere on the window,
// or paste an image with Ctrl/Cmd+V. Announces the file count in an aria-live region.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon';

export interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** Same syntax as <input accept>, e.g. "image/*,.heic". */
  accept?: string;
  multiple?: boolean;
  /** Show a full-window overlay while files are dragged over the page and accept drops anywhere. */
  windowDrop?: boolean;
  /** Listen for pasted images on the document. */
  paste?: boolean;
  /** Allow picking a whole folder (webkitdirectory) via a secondary button. */
  folder?: boolean;
  title?: ComponentChildren;
  hint?: ComponentChildren;
  compact?: boolean;
  onReject?: (files: File[]) => void;
}

function matches(file: File, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...(e.dataTransfer.types ?? [])].includes('Files');

export function Dropzone({
  onFiles,
  accept,
  multiple = true,
  windowDrop = true,
  paste = true,
  folder = false,
  title = 'Drop images here',
  hint = 'or click to choose files, or paste with Ctrl+V',
  compact = false,
  onReject,
}: DropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [announce, setAnnounce] = useState('');
  const depth = useRef(0);
  // The file inputs render only after hydration, so their presence means every listener is live.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cb = useRef({ onFiles, onReject, accept, multiple });
  cb.current = { onFiles, onReject, accept, multiple };

  const take = (list: FileList | File[] | null | undefined) => {
    const all = [...(list ?? [])];
    if (!all.length) return;
    const { accept: acc, multiple: many } = cb.current;
    let ok = all.filter((f) => matches(f, acc));
    const bad = all.filter((f) => !matches(f, acc));
    if (!many) ok = ok.slice(0, 1);
    if (bad.length) cb.current.onReject?.(bad);
    if (!ok.length) return;
    // Re-set the text so the same count is announced again.
    setAnnounce('');
    requestAnimationFrame(() => setAnnounce(`${ok.length} ${ok.length === 1 ? 'file' : 'files'} added`));
    cb.current.onFiles(ok);
  };

  useEffect(() => {
    if (!paste) return;
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      let files = [...(dt?.files ?? [])];
      if (!files.length && dt)
        files = [...dt.items]
          .filter((i) => i.kind === 'file')
          .map((i) => i.getAsFile())
          .filter((f): f is File => !!f);
      if (!files.length) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'file') return;
      e.preventDefault();
      take(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [paste]);

  useEffect(() => {
    if (!windowDrop) return;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      take(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, [windowDrop]);

  const localDrop = (e: DragEvent) => {
    if (windowDrop) return; // the window handler takes it
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer?.files);
  };

  return (
    <div class="relative">
      <div
        data-testid="dropzone"
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!windowDrop) setOver(true);
        }}
        onDragLeave={() => !windowDrop && setOver(false)}
        onDrop={localDrop}
        class={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-[border-color,background-color,box-shadow] duration-[var(--duration-base)] ${
          compact ? 'px-4 py-6' : 'px-6 py-14 sm:py-20'
        } ${over ? 'border-accent-500 bg-accent-50 shadow-glow dark:bg-accent-900/30' : 'border-line bg-surface hover:border-accent-400 hover:bg-surface-2'}`}
      >
        <span class="flex h-14 w-14 items-center justify-center rounded-full bg-accent-100 text-accent-700 transition-transform duration-[var(--duration-base)] group-hover:-translate-y-0.5 dark:bg-accent-900/50 dark:text-accent-200">
          <Icon name="upload" size={26} />
        </span>
        <span class="text-lg font-semibold">{title}</span>
        <span class="text-sm text-muted">{hint}</span>
        {folder && (
          <button
            type="button"
            class="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-accent-700 hover:bg-accent-50 dark:text-accent-200 dark:hover:bg-accent-900/40"
            onClick={(e) => {
              e.stopPropagation();
              folderInput.current?.click();
            }}
          >
            <Icon name="folder" size={16} /> Choose a folder
          </button>
        )}
      </div>
      {mounted && (
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          class="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const el = e.currentTarget;
            take(el.files);
            el.value = '';
          }}
        />
      )}
      {mounted && folder && (
        <input
          ref={folderInput}
          type="file"
          class="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(e) => {
            const el = e.currentTarget;
            take(el.files);
            el.value = '';
          }}
        />
      )}
      <p aria-live="polite" class="sr-only">
        {announce}
      </p>
      {windowDrop && over && (
        <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent-600/15 backdrop-blur-[2px]">
          <div class="rounded-xl border-2 border-dashed border-accent-500 bg-surface px-10 py-8 text-lg font-semibold shadow-lift">
            Drop to add images
          </div>
        </div>
      )}
    </div>
  );
}
