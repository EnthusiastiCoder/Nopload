// Modal on the native <dialog>: focus trap, Esc to close and inert background for free.
import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { IconButton } from './IconButton';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click closes; Esc is handled natively by <dialog>.
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      class={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-xl border border-line bg-surface p-0 text-fg shadow-lift backdrop:bg-black/40 backdrop:backdrop-blur-sm`}
    >
      <div class="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <h2 id={titleId} class="text-base font-semibold">
          {title}
        </h2>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </div>
      <div class="max-h-[70dvh] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}
