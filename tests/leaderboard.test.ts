import { describe, expect, it } from 'vitest';
import { isLeaderboardPeriod, LEADERBOARD_PERIODS } from '@/lib/domain/leaderboard';
import { formatMoney, formatSignedMoney } from '@/lib/format';

describe('leaderboard period filter', () => {
  it('accepts only the supported periods', () => {
    expect(isLeaderboardPeriod('ALL')).toBe(true);
    expect(isLeaderboardPeriod('MONTH')).toBe(true);
    expect(isLeaderboardPeriod('YEAR')).toBe(true);
  });

  it('rejects anything else, so a crafted query string cannot reach the RPC', () => {
    for (const bad of [undefined, '', 'all', 'WEEK', 'ALL; drop table', "' or 1=1"]) {
      expect(isLeaderboardPeriod(bad as string | undefined)).toBe(false);
    }
  });

  it('offers exactly the three Hebrew tabs', () => {
    expect(LEADERBOARD_PERIODS.map((p) => p.label)).toEqual(['הכל', 'החודש', 'השנה']);
  });
});

describe('leaderboard money rendering', () => {
  it('distinguishes positive, negative and zero', () => {
    expect(formatSignedMoney(425_000)).toBe('+4,250₪');
    expect(formatSignedMoney(-25_000)).toBe('-250₪');
    // Zero renders without a sign, so it reads as "even" rather than a gain.
    expect(formatMoney(0)).toBe('0₪');
    expect(formatSignedMoney(0)).toBe('0₪');
  });

  it('always uses the shekel sign', () => {
    for (const value of [425_000, -25_000, 0, 1]) {
      expect(formatSignedMoney(value)).toContain('₪');
    }
  });
});
