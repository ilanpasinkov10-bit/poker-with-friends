'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'warn';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand/90 active:bg-brand/80 disabled:bg-brand/40',
  secondary: 'bg-surface-3 text-ink hover:bg-surface-3/80 border border-line',
  ghost: 'bg-transparent text-ink-muted hover:text-ink hover:bg-surface-2',
  success: 'bg-profit text-[#06231a] hover:bg-profit/90 font-bold',
  danger: 'bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25',
  warn: 'bg-warn/15 text-warn border border-warn/30 hover:bg-warn/25',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-[0.95rem] rounded-xl gap-2',
  lg: 'h-14 px-5 text-base rounded-2xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
