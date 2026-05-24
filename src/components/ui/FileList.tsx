// Batch queue: thumbnail, name, size before -> after, status and per-file actions.
import { formatBytes } from '../../lib/files';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

export type FileStatus = 'queued' | 'processing' | 'done' | 'error' | 'cancelled';

export interface FileItem {
  id: string;
  name: string;
  inBytes: number;
  outBytes?: number;
  status: FileStatus;
  /** Object URL of a thumbnail. */
  thumb?: string;
  /** 0..1 while processing. */
  progress?: number;
  error?: string;
  note?: string;
}

const STATUS_LABEL: Record<FileStatus, string> = {
  queued: 'Queued',
  processing: 'Working',
  done: 'Done',
  error: 'Failed',
  cancelled: 'Cancelled',
};

function Saved({ inBytes, outBytes }: { inBytes: number; outBytes: number }) {
  const pct = inBytes > 0 ? Math.round((1 - outBytes / inBytes) * 100) : 0;
  if (pct <= 0) return null;
  return <span class="rounded-full bg-mint-500/15 px-2 py-0.5 text-xs font-semibold text-mint-600 dark:text-mint-400">-{pct}%</span>;
}

export function FileList({
  items,
  onRemove,
  onDownload,
  onOpen,
}: {
  items: FileItem[];
  onRemove?: (id: string) => void;
  onDownload?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  return (
    <ul
      data-testid="file-list"
      role="list"
      class="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface"
    >
      {items.map((f) => (
        <li key={f.id} role="listitem" data-status={f.status} class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <div class="checkerboard h-12 w-12 shrink-0 overflow-hidden rounded-md border border-line">
            {f.thumb ? <img src={f.thumb} alt="" class="h-full w-full object-cover" loading="lazy" decoding="async" /> : null}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium" title={f.name}>
              {onOpen ? (
                <button type="button" class="truncate hover:underline" onClick={() => onOpen(f.id)}>
                  {f.name}
                </button>
              ) : (
                f.name
              )}
            </p>
            <p class="flex flex-wrap items-center gap-x-2 text-xs text-muted tabular-nums">
              <span>{formatBytes(f.inBytes)}</span>
              {f.outBytes !== undefined && (
                <>
                  <Icon name="arrow" size={12} />
                  <span class="text-fg">{formatBytes(f.outBytes)}</span>
                  <Saved inBytes={f.inBytes} outBytes={f.outBytes} />
                </>
              )}
              {f.note && <span>{f.note}</span>}
              {f.error && <span class="text-red-600 dark:text-red-400">{f.error}</span>}
            </p>
            {f.status === 'processing' && (
              <div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  class={`h-full bg-accent-500 transition-[width] duration-[var(--duration-base)] ${f.progress === undefined ? 'w-1/3 animate-pulse' : ''}`}
                  style={f.progress === undefined ? undefined : { width: `${Math.round(f.progress * 100)}%` }}
                />
              </div>
            )}
          </div>
          <span
            class={`hidden text-xs font-medium sm:inline ${
              f.status === 'done'
                ? 'text-mint-600 dark:text-mint-400'
                : f.status === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-muted'
            }`}
          >
            {STATUS_LABEL[f.status]}
          </span>
          {onDownload && f.status === 'done' && (
            <IconButton icon="download" label={`Download ${f.name}`} onClick={() => onDownload(f.id)} />
          )}
          {onRemove && <IconButton icon="x" label={`Remove ${f.name}`} onClick={() => onRemove(f.id)} />}
        </li>
      ))}
    </ul>
  );
}
