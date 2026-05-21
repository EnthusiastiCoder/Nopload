import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';

/** CSS-only tooltip shown on hover and keyboard focus; the text also describes the trigger for screen readers. */
export function Tooltip({ text, children }: { text: string; children: ComponentChildren }) {
  const id = useId();
  return (
    <span class="group relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        class="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-64 -translate-x-1/2 rounded-md bg-fg px-2.5 py-1.5 text-xs text-bg opacity-0 shadow-lift transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
