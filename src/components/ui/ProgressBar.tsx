/** Determinate when `value` (0..1) is given, otherwise indeterminate. */
export function ProgressBar({ value, label, class: cls = '' }: { value?: number; label: string; class?: string }) {
  const pct = value === undefined ? undefined : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      class={`relative h-2 w-full overflow-hidden rounded-full bg-surface-2 ${cls}`}
    >
      <div
        class={`h-full rounded-full bg-accent-500 transition-[width] duration-[var(--duration-base)] ${pct === undefined ? 'w-1/3 animate-pulse' : ''}`}
        style={pct === undefined ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
