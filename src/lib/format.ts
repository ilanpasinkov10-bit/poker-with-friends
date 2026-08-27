import { AGOROT_PER_SHEKEL } from '@/lib/domain/money';

export const TIME_ZONE = 'Asia/Jerusalem';
const LOCALE = 'he-IL';

const numberFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1000 -> "1,000" */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** 10000 -> "10,000 ז׳יטונים" */
export function formatChips(chips: number): string {
  return formatNumber(chips);
}

/**
 * Money is displayed in whole shekels when it divides evenly (the normal case
 * for poker nights) and with agorot only when a rounding remainder exists.
 */
export function formatMoney(agorot: number): string {
  const abs = Math.abs(agorot);
  const shekels = abs / AGOROT_PER_SHEKEL;
  const body =
    abs % AGOROT_PER_SHEKEL === 0 ? numberFormatter.format(shekels) : decimalFormatter.format(shekels);
  return `${agorot < 0 ? '-' : ''}${body}₪`;
}

/** Adds an explicit + for positive results (profit columns). */
export function formatSignedMoney(agorot: number): string {
  if (agorot > 0) return `+${formatMoney(agorot)}`;
  return formatMoney(agorot);
}

function parts(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, ...options }).formatToParts(date);
}

function part(date: Date, options: Intl.DateTimeFormatOptions, type: Intl.DateTimeFormatPartTypes) {
  return parts(date, options).find((p) => p.type === type)?.value ?? '';
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Israeli date format: 23.08.2026 */
export function formatDate(value: string | Date): string {
  const date = toDate(value);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${part(date, opts, 'day')}.${part(date, opts, 'month')}.${part(date, opts, 'year')}`;
}

/** 24-hour time in Israel: 21:30 */
export function formatTime(value: string | Date): string {
  const date = toDate(value);
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  return `${part(date, opts, 'hour')}:${part(date, opts, 'minute')}`;
}

/** 23.08.2026, 21:30 */
export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

/** Milliseconds -> "01:42:36" (or "42:36" under an hour). Always LTR-safe. */
export function formatDuration(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function initialsOf(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2);
  return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`;
}
