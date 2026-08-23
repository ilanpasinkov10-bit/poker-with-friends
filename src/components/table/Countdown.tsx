'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatDuration, formatTime } from '@/lib/format';
import { Num } from '@/components/ui/Num';

/**
 * Live countdown to the planned end time. Rendered client-side only after
 * mount so the server and client never disagree on "now".
 */
export function Countdown({
  endAt,
  compact = false,
  onExpire,
}: {
  endAt: string;
  compact?: boolean;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = Date.parse(endAt);
  const remaining = now === null ? null : target - now;
  const expired = remaining !== null && remaining <= 0;

  useEffect(() => {
    if (expired) onExpire?.();
  }, [expired, onExpire]);

  if (compact) {
    return (
      <span className={cn('font-bold', expired ? 'text-loss' : 'text-ink')}>
        {remaining === null ? (
          <Num>{formatTime(endAt)}</Num>
        ) : expired ? (
          'הסתיים'
        ) : (
          <Num>{formatDuration(remaining)}</Num>
        )}
      </span>
    );
  }

  return (
    <div className="text-center">
      <p className="text-xs text-ink-faint">
        {expired ? 'הגיע זמן סיום המשחק' : 'נותרו'}
      </p>
      <p
        className={cn(
          'mt-1 text-4xl font-black tabular-nums tracking-tight',
          expired ? 'text-loss' : 'text-ink',
        )}
      >
        {remaining === null ? (
          <span className="text-ink-faint">--:--:--</span>
        ) : (
          <Num>{formatDuration(Math.max(0, remaining))}</Num>
        )}
      </p>
      <p className="mt-1 text-xs text-ink-faint">
        שעת סיום: <Num>{formatTime(endAt)}</Num>
      </p>
    </div>
  );
}
