import { describe, expect, it } from 'vitest';
import {
  buildProfitSeries,
  computeLifetimeStats,
  computeRecords,
  summariseByGroup,
  type CompletedGameRecord,
} from '@/lib/domain/stats';

const game = (
  overrides: Partial<CompletedGameRecord> & { playedAt: string; profitLossAgorot: number },
): CompletedGameRecord => ({
  tableId: overrides.tableId ?? `t-${overrides.playedAt}`,
  tableName: overrides.tableName ?? 'שולחן',
  groupId: overrides.groupId ?? null,
  groupName: overrides.groupName ?? null,
  buyInCount: overrides.buyInCount ?? 2,
  totalPaidAgorot: overrides.totalPaidAgorot ?? 10_000,
  chipsIssued: overrides.chipsIssued ?? 1000,
  finalChips: overrides.finalChips ?? 1000,
  finalValueAgorot: overrides.finalValueAgorot ?? 10_000,
  playerCount: overrides.playerCount ?? 4,
  potAgorot: overrides.potAgorot ?? 40_000,
  ...overrides,
});

const HISTORY: CompletedGameRecord[] = [
  game({ playedAt: '2026-01-01T20:00:00Z', profitLossAgorot: 5000, tableName: 'חמישי' }),
  game({ playedAt: '2026-01-08T20:00:00Z', profitLossAgorot: -3000, tableName: 'חמישי' }),
  game({ playedAt: '2026-01-15T20:00:00Z', profitLossAgorot: 10_000, tableName: 'חמישי' }),
];

describe('lifetime statistics', () => {
  it('returns a zeroed summary with no games', () => {
    const stats = computeLifetimeStats([]);
    expect(stats.gamesPlayed).toBe(0);
    expect(stats.netAgorot).toBe(0);
    expect(stats.winRatePercent).toBe(0);
  });

  it('aggregates results across games', () => {
    const stats = computeLifetimeStats(HISTORY);
    expect(stats.gamesPlayed).toBe(3);
    expect(stats.netAgorot).toBe(12_000);
    expect(stats.winningGames).toBe(2);
    expect(stats.winRatePercent).toBe(67);
    expect(stats.averageResultAgorot).toBe(4000);
    expect(stats.biggestWinAgorot).toBe(10_000);
    expect(stats.biggestLossAgorot).toBe(-3000);
    expect(stats.totalBuyIns).toBe(6);
  });

  it('tracks the current and longest winning streaks', () => {
    const stats = computeLifetimeStats(HISTORY);
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestWinStreak).toBe(1);

    const streaky = computeLifetimeStats([
      game({ playedAt: '2026-02-01T20:00:00Z', profitLossAgorot: 1000 }),
      game({ playedAt: '2026-02-02T20:00:00Z', profitLossAgorot: 1000 }),
      game({ playedAt: '2026-02-03T20:00:00Z', profitLossAgorot: 1000 }),
    ]);
    expect(streaky.longestWinStreak).toBe(3);
    expect(streaky.currentStreak).toBe(3);
  });

  it('reports a negative current streak after consecutive losses', () => {
    const stats = computeLifetimeStats([
      game({ playedAt: '2026-03-01T20:00:00Z', profitLossAgorot: 5000 }),
      game({ playedAt: '2026-03-02T20:00:00Z', profitLossAgorot: -1000 }),
      game({ playedAt: '2026-03-03T20:00:00Z', profitLossAgorot: -2000 }),
    ]);
    expect(stats.currentStreak).toBe(-2);
  });

  it('orders by play time, not input order', () => {
    const shuffled = [HISTORY[2]!, HISTORY[0]!, HISTORY[1]!];
    expect(computeLifetimeStats(shuffled).currentStreak).toBe(1);
  });
});

describe('profit series', () => {
  it('accumulates the running balance in play order', () => {
    const series = buildProfitSeries(HISTORY);
    expect(series.map((p) => p.resultAgorot)).toEqual([5000, -3000, 10_000]);
    expect(series.map((p) => p.cumulativeAgorot)).toEqual([5000, 2000, 12_000]);
  });
});

describe('records', () => {
  it('derives every record from real games', () => {
    const records = computeRecords(HISTORY);
    const byKey = Object.fromEntries(records.map((r) => [r.key, r]));
    expect(byKey.biggest_win!.valueAgorot).toBe(10_000);
    expect(byKey.biggest_loss!.valueAgorot).toBe(-3000);
    expect(byKey.biggest_pot!.valueAgorot).toBe(40_000);
    expect(byKey.most_buyins!.valueNumber).toBe(2);
  });

  it('leaves records empty when there is nothing to show', () => {
    const records = computeRecords([]);
    expect(records.every((r) => r.gameLabel === null)).toBe(true);
  });

  it('does not report a biggest win when every game lost money', () => {
    const records = computeRecords([
      game({ playedAt: '2026-04-01T20:00:00Z', profitLossAgorot: -500 }),
    ]);
    const win = records.find((r) => r.key === 'biggest_win')!;
    expect(win.valueAgorot).toBeUndefined();
  });
});

describe('grouping by recurring table', () => {
  it('rolls games up per group and keeps first/last participation', () => {
    const groups = summariseByGroup([
      game({
        playedAt: '2026-01-01T20:00:00Z',
        profitLossAgorot: 1000,
        groupId: 'g1',
        groupName: 'החבר׳ה',
        tableName: 'משחק ראשון',
      }),
      game({
        playedAt: '2026-01-08T20:00:00Z',
        profitLossAgorot: -400,
        groupId: 'g1',
        groupName: 'החבר׳ה',
        tableName: 'משחק שני',
      }),
      game({ playedAt: '2026-01-09T20:00:00Z', profitLossAgorot: 700, tableId: 'solo', tableName: 'חד פעמי' }),
    ]);

    const recurring = groups.find((g) => g.key === 'g1')!;
    expect(recurring.name).toBe('החבר׳ה');
    expect(recurring.gamesPlayed).toBe(2);
    expect(recurring.netAgorot).toBe(600);
    expect(recurring.firstPlayedAt).toBe('2026-01-01T20:00:00Z');
    expect(recurring.lastPlayedAt).toBe('2026-01-08T20:00:00Z');

    expect(groups.find((g) => g.key === 'table:solo')!.gamesPlayed).toBe(1);
  });
});
