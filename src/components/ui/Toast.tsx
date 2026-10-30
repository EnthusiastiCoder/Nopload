// A tiny global toast store. Any island can call `toast(...)`; the Toaster in the
// shell island renders them (islands share module instances within one build).
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from './Icon';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: ComponentChildren;
  action?: { label: string; onClick: () => void };
  /** ms; 0 keeps it until dismissed. */
  duration: number;
}

let nextId = 1;
let items: ToastItem[] = [];
const listeners = new Set<(t: ToastItem[]) => void>();
const publish = () => {
  for (const l of listeners) l(items);
};

export function dismissToast(id: number): void {
  items = items.filter((t) => t.id !== id);
  publish();
}

export function toast(
  message: ComponentChildren,
  opts: { kind?: ToastKind; action?: ToastItem['action']; duration?: number } = {},
): number {
  const item: ToastItem = {
    id: nextId++,
    kind: opts.kind ?? 'info',
    message,
    action: opts.action,
    duration: opts.duration ?? (opts.action ? 0 : 5000),
  };
  items = [...items, item];
  publish();
  if (item.duration > 0) setTimeout(() => dismissToast(item.id), item.duration);
  return item.id;
}

const ICON: Record<ToastKind, string> = { info: 'info', success: 'check', error: 'alert' };
const TONE: Record<ToastKind, string> = { info: 'text-accent-500', success: 'text-mint-500', error: 'text-red-500' };

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <div
      class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      role="region"
      aria-label="Notifications"
    >
      <div aria-live="polite" class="contents">
        {list.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-lift"
          >
            <Icon name={ICON[t.kind]} class={TONE[t.kind]} />
            <div class="flex-1">{t.message}</div>
            {t.action && (
              <button
                type="button"
                class="-my-2.5 min-h-11 rounded-md px-2 font-semibold text-accent-600 hover:bg-surface-2 dark:text-accent-300"
                onClick={() => {
                  t.action!.onClick();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              class="-m-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2"
              onClick={() => dismissToast(t.id)}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
