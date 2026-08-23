import { TIME_ZONE } from '@/lib/format';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Offset of Asia/Jerusalem from UTC, in minutes, at the given instant. */
function offsetMinutesAt(instant: Date): number {
  const parts = partsFormatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * Interprets a wall-clock date and time as Israel local time and returns the
 * matching UTC instant. Users pick "21:30 on 23.08.2026" and mean Israel time;
 * the database stores the correct absolute timestamp.
 *
 * Two passes settle the DST-transition case, where the offset that applies
 * depends on the very instant we are solving for.
 */
export function jerusalemToUtc(dateIso: string, timeHHmm: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = timeHHmm.split(':').map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    throw new Error('jerusalemToUtc: invalid date or time');
  }

  const naive = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0, 0);
  let result = naive - offsetMinutesAt(new Date(naive)) * 60_000;
  result = naive - offsetMinutesAt(new Date(result)) * 60_000;
  return new Date(result);
}

/** Today's date in Israel, as YYYY-MM-DD. */
export function todayInJerusalem(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

/** Current wall-clock time in Israel, rounded up to the next half hour. */
export function nextHalfHourInJerusalem(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '20');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const rounded = minute <= 30 ? 30 : 0;
  const nextHour = minute <= 30 ? hour : (hour + 1) % 24;
  return `${String(nextHour).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
}

export function addHoursToTime(timeHHmm: string, hours: number): string {
  const [h, m] = timeHHmm.split(':').map(Number);
  const total = ((h ?? 0) + hours) % 24;
  return `${String(total).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`;
}
