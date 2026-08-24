import { describe, expect, it } from 'vitest';
import {
  formatChips,
  formatDate,
  formatDuration,
  formatMoney,
  formatSignedMoney,
  formatTime,
  initialsOf,
} from '@/lib/format';
import { jerusalemToUtc, addHoursToTime } from '@/lib/timezone';

describe('Israeli formatting', () => {
  it('formats money in shekels with the ₪ sign', () => {
    expect(formatMoney(5000)).toBe('50₪');
    expect(formatMoney(100_000)).toBe('1,000₪');
    expect(formatMoney(-9000)).toBe('-90₪');
    expect(formatMoney(0)).toBe('0₪');
  });

  it('shows agorot only when the amount is not a whole shekel', () => {
    expect(formatMoney(5001)).toBe('50.01₪');
  });

  it('adds an explicit plus for gains', () => {
    expect(formatSignedMoney(5000)).toBe('+50₪');
    expect(formatSignedMoney(-5000)).toBe('-50₪');
    expect(formatSignedMoney(0)).toBe('0₪');
  });

  it('groups chip counts', () => {
    expect(formatChips(10_000)).toBe('10,000');
  });

  it('uses Israeli date formatting', () => {
    // 23.08.2026 at 21:30 Israel time (UTC+3 in August).
    expect(formatDate('2026-08-23T18:30:00Z')).toBe('23.08.2026');
  });

  it('uses 24-hour time in Israel', () => {
    expect(formatTime('2026-08-23T18:30:00Z')).toBe('21:30');
    // Winter: Israel is UTC+2.
    expect(formatTime('2026-01-15T19:30:00Z')).toBe('21:30');
  });

  it('formats countdowns as HH:MM:SS', () => {
    expect(formatDuration(6156 * 1000)).toBe('01:42:36');
    expect(formatDuration(125 * 1000)).toBe('02:05');
    expect(formatDuration(-5000)).toBe('00:00');
  });

  it('derives initials for the default avatar', () => {
    expect(initialsOf('אילן')).toBe('אי');
    expect(initialsOf('שי לוי')).toBe('של');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('Israel timezone handling', () => {
  it('interprets wall-clock input as Israel local time (summer, UTC+3)', () => {
    expect(jerusalemToUtc('2026-08-23', '21:30').toISOString()).toBe('2026-08-23T18:30:00.000Z');
  });

  it('interprets wall-clock input as Israel local time (winter, UTC+2)', () => {
    expect(jerusalemToUtc('2026-01-15', '21:30').toISOString()).toBe('2026-01-15T19:30:00.000Z');
  });

  it('adds hours with wrap-around past midnight', () => {
    expect(addHoursToTime('22:30', 4)).toBe('02:30');
    expect(addHoursToTime('20:00', 4)).toBe('00:00');
  });
});
