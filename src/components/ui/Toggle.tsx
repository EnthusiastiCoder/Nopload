import { useId } from 'preact/hooks';

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div class="flex items-start justify-between gap-4">
      <label for={id} class="flex flex-col text-sm">
        <span class="font-medium">{label}</span>
        {hint && <span class="text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        class="inline-flex h-11 w-12 shrink-0 items-center rounded-full"
      >
        <span
          class={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-[var(--duration-base)] ${checked ? 'bg-accent-600' : 'bg-line'}`}
        >
          <span
            class={`inline-block h-5 w-5 rounded-full bg-white shadow-soft transition-transform duration-[var(--duration-base)] ${checked ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </span>
      </button>
    </div>
  );
}
