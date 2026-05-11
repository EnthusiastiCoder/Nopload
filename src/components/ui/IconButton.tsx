import type { ButtonHTMLAttributes } from 'preact';
import { Icon } from './Icon';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: string;
  label: string;
  iconSize?: number;
  disabled?: boolean;
};

/** A square 44px touch target with an accessible name. */
export function IconButton({ icon, label, iconSize = 20, class: cls = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      class={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-fg transition-colors duration-[var(--duration-fast)] hover:bg-surface-2 disabled:opacity-40 ${cls}`}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
