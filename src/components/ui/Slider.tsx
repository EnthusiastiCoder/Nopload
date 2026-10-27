import { useId } from 'preact/hooks';

export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onInput,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onInput: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between text-sm">
        <label for={id} class="font-medium">
          {label}
        </label>
        <output for={id} class="tabular-nums text-muted">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onInput(Number((e.target as HTMLInputElement).value))}
        class="h-2 pointer-coarse:h-11 w-full cursor-pointer accent-[var(--color-accent-600)]"
      />
    </div>
  );
}
