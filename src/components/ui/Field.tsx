import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-ink placeholder:text-ink-faint ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-loss">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  ltr?: boolean;
}

export function TextInput({ className, ltr, ...rest }: TextInputProps) {
  return (
    <input
      {...rest}
      dir={ltr ? 'ltr' : undefined}
      className={cn(CONTROL, ltr && 'ltr-num text-start', className)}
    />
  );
}

export function SelectInput({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(CONTROL, 'appearance-none bg-left-2', className)}>
      {children}
    </select>
  );
}

/** Large radio-style option list — easy to hit on a phone. */
export function OptionGroup<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; description?: string }[];
}) {
  return (
    <div className="grid gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
              active ? 'border-brand bg-brand-soft/60' : 'border-line bg-surface-2',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              className="mt-1 size-4 accent-[#7c6cf6]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{option.label}</span>
              {option.description ? (
                <span className="block text-xs text-ink-faint">{option.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3 text-start"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description ? <span className="block text-xs text-ink-faint">{description}</span> : null}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white transition-all',
            // Logical offsets: "off" rests at the start edge (right in RTL),
            // "on" slides to the end edge.
            checked ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </span>
    </button>
  );
}
