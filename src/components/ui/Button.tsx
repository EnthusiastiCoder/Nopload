import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-600 text-white shadow-soft hover:bg-accent-700 active:bg-accent-800 disabled:opacity-50',
  secondary: 'bg-surface text-fg border border-line shadow-soft hover:bg-surface-2 disabled:opacity-50',
  ghost: 'text-fg hover:bg-surface-2 disabled:opacity-50',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-9 pointer-coarse:min-h-11 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'min-h-13 px-6 text-base gap-2.5',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return `inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap select-none transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> & {
  variant?: Variant;
  size?: Size;
  children?: ComponentChildren;
  disabled?: boolean;
  type?: 'button' | 'submit';
};

export function Button({ variant = 'primary', size = 'md', class: cls, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} class={buttonClass(variant, size, String(cls ?? ''))} {...rest}>
      {children}
    </button>
  );
}
