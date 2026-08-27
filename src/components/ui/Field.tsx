import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * `min-w-0` matters as much as `w-full` here. A control placed in a grid or
 * flex track is a track item, and those default to `min-width: auto` — they
 * refuse to shrink below their content's intrinsic minimum, so `width: 100%`
 * alone does not stop a wide control from pushing its column out. That is what
 * clipped the time values on narrow phones.
 */
const CONTROL =
  'w-full min-w-0 max-w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-ink ' +
  'placeholder:text-ink-faint ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50';

/**
 * Date and time fields are drawn by the browser, not by us: the segments, the
 * separators and the picker glyph are all native, and their width is whatever
 * the *browser's* locale asks for. An English-locale phone renders a 12-hour
 * clock ("08:30 PM"), which is markedly wider than "20:00" and is what
 * overflowed the two-column row.
 *
 * `lang` asks for the Israeli formatting the rest of the app uses. It is only
 * a hint: every engine measured here takes the format from its own locale
 * settings and ignores the attribute, so the layout cannot assume the narrow
 * 24-hour form and must survive the wide 12-hour one. The trimmed padding buys
 * the native widget a little more room without shrinking the tap target.
 *
 * Sizing these controls is the harder half, and it is handled in globals.css
 * rather than here: Safari sizes them to their own widget and ignores
 * `width: 100%` until `appearance` is reset. Chromium does honour the width —
 * a time field's content there needs 99px and a date field's 120px — which is
 * why this looked correct in testing and was still broken on an iPhone.
 */
const NATIVE_PICKER = 'px-3';

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
    <div className="min-w-0 space-y-1.5">
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
  const native = rest.type === 'date' || rest.type === 'time';
  return (
    <input
      {...rest}
      dir={ltr ? 'ltr' : undefined}
      lang={native ? 'he-IL' : rest.lang}
      className={cn(CONTROL, ltr && 'ltr-num text-start', native && NATIVE_PICKER, className)}
    />
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
              className="mt-1 size-4 shrink-0 accent-brand"
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
            'absolute top-0.5 size-5 rounded-full bg-on-brand transition-all',
            // Logical offsets: "off" rests at the start edge (right in RTL),
            // "on" slides to the end edge.
            checked ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </span>
    </button>
  );
}
