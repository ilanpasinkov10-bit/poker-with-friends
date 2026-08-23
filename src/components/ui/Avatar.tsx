import { cn } from '@/lib/cn';
import { initialsOf } from '@/lib/format';

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-24 text-2xl',
} as const;

/** Falls back to Hebrew initials when the player has no uploaded photo. */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
  ring,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-surface-3 font-bold text-brand-ink',
        ring && 'ring-2 ring-brand/40',
        SIZES[size],
        className,
      )}
      aria-hidden={false}
      title={name}
    >
      {src ? (
        // Avatars come from Supabase Storage in arbitrary sizes; a plain img
        // keeps this usable before the Supabase host is configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" loading="lazy" />
      ) : (
        <span>{initialsOf(name)}</span>
      )}
    </span>
  );
}
