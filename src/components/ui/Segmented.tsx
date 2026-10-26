import { useId } from 'preact/hooks';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** A radio group styled as a segmented control (arrow keys move between options natively). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset class="flex flex-col">
      <legend class="mb-2 text-sm font-medium">{label}</legend>
      <div class="inline-flex rounded-md border border-line bg-surface-2 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            class={`relative flex min-h-9 pointer-coarse:min-h-11 flex-1 cursor-pointer items-center justify-center rounded-sm px-3 text-sm font-medium transition-colors duration-[var(--duration-fast)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-ring)] ${
              value === o.value ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              // Transparent and covering the whole segment (not sr-only), so the radio itself takes
              // the pointer: a click lands on the input, never on a label that intercepts it.
              class="absolute inset-0 m-0 cursor-pointer appearance-none rounded-sm opacity-0"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
