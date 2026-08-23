import { describe, expect, it } from 'vitest';
import {
  buyInDelta,
  canAddBuyIn,
  computeFinalResults,
  remainingBuyIns,
  validateChipCount,
  type PlayerLedgerTotals,
} from '@/lib/domain/chips';
import { shekelsToAgorot } from '@/lib/domain/money';

const STANDARD = { buyInAgorot: 5000, chipsPerBuyIn: 500 };

function player(
  id: string,
  buyIns: number,
  finalChips: number,
  economics = STANDARD,
): PlayerLedgerTotals {
  return {
    id,
    buyInCount: buyIns,
    totalPaidAgorot: buyIns * economics.buyInAgorot,
    chipsIssued: buyIns * economics.chipsPerBuyIn,
    finalChips,
  };
}

describe('money conversion', () => {
  it('converts shekels to agorot without floating point drift', () => {
    expect(shekelsToAgorot(50)).toBe(5000);
    expect(shekelsToAgorot(0.1)).toBe(10);
    expect(shekelsToAgorot(19.99)).toBe(1999);
  });
});

describe('buy-in economics', () => {
  it('adds 50₪ and 500 chips per default entry', () => {
    expect(buyInDelta(1, STANDARD)).toEqual({ amountAgorot: 5000, chips: 500 });
    expect(buyInDelta(6, STANDARD)).toEqual({ amountAgorot: 30_000, chips: 3000 });
  });

  it('caps investment at the configured maximum', () => {
    expect(buyInDelta(6, STANDARD).amountAgorot).toBe(shekelsToAgorot(300));
  });

  it('enforces the maximum number of entries', () => {
    expect(canAddBuyIn(5, 6)).toBe(true);
    expect(canAddBuyIn(6, 6)).toBe(false);
    expect(canAddBuyIn(7, 6)).toBe(false);
    expect(remainingBuyIns(4, 6)).toBe(2);
    expect(remainingBuyIns(9, 6)).toBe(0);
  });
});

describe('final cash value and profit/loss', () => {
  it('matches the worked example: 2 entries, 1,500 chips -> +50₪', () => {
    const [result] = computeFinalResults([player('a', 2, 1500)], STANDARD);
    expect(result!.finalValueAgorot).toBe(shekelsToAgorot(150));
    expect(result!.profitLossAgorot).toBe(shekelsToAgorot(50));
  });

  it('matches the worked loss example: 3 entries, 600 chips -> -90₪', () => {
    // The counted total must equal the issued total, so the missing chips are
    // held by a second player.
    const results = computeFinalResults([player('a', 3, 600), player('b', 3, 2400)], STANDARD);
    const a = results.find((r) => r.id === 'a')!;
    expect(a.finalValueAgorot).toBe(shekelsToAgorot(60));
    expect(a.profitLossAgorot).toBe(shekelsToAgorot(-90));
  });

  it('always partitions the pot exactly, even with awkward rounding', () => {
    // 700 chips per 50₪ entry makes almost every stack convert to a fraction
    // of an agora. Counted chips equal issued chips (4 entries x 700 = 2,800).
    const economics = { buyInAgorot: 5000, chipsPerBuyIn: 700 };
    const players = [
      player('a', 1, 233, economics),
      player('b', 2, 1801, economics),
      player('c', 1, 766, economics),
    ];
    const results = computeFinalResults(players, economics);

    const pot = players.reduce((sum, p) => sum + p.totalPaidAgorot, 0);
    expect(results.reduce((sum, r) => sum + r.finalValueAgorot, 0)).toBe(pot);
    expect(results.reduce((sum, r) => sum + r.profitLossAgorot, 0)).toBe(0);
    for (const r of results) expect(Number.isInteger(r.finalValueAgorot)).toBe(true);
  });

  it('produces zero profit for everyone when nobody moved chips', () => {
    const results = computeFinalResults([player('a', 2, 1000), player('b', 1, 500)], STANDARD);
    for (const r of results) expect(r.profitLossAgorot).toBe(0);
  });

  it('is deterministic regardless of input order', () => {
    const economics = { buyInAgorot: 5000, chipsPerBuyIn: 700 };
    const players = [
      player('a', 1, 233, economics),
      player('b', 2, 1801, economics),
      player('c', 1, 766, economics),
    ];
    const forward = computeFinalResults(players, economics);
    const backward = computeFinalResults([...players].reverse(), economics);
    for (const row of forward) {
      const other = backward.find((r) => r.id === row.id)!;
      expect(other.finalValueAgorot).toBe(row.finalValueAgorot);
    }
  });

  it('rejects nonsensical table economics', () => {
    expect(() => computeFinalResults([player('a', 1, 100)], { buyInAgorot: 0, chipsPerBuyIn: 500 })).toThrow();
    expect(() => computeFinalResults([player('a', 1, 100)], { buyInAgorot: 5000, chipsPerBuyIn: 0 })).toThrow();
  });
});

describe('chip count validation', () => {
  it('reports a balanced count', () => {
    const check = validateChipCount([
      { chipsIssued: 5000, finalChips: 4000 },
      { chipsIssued: 5000, finalChips: 6000 },
    ]);
    expect(check.verdict).toBe('BALANCED');
    expect(check.difference).toBe(0);
  });

  it('detects missing chips', () => {
    const check = validateChipCount([{ chipsIssued: 10_000, finalChips: 9900 }]);
    expect(check.verdict).toBe('MISSING');
    expect(check.difference).toBe(-100);
  });

  it('detects surplus chips', () => {
    const check = validateChipCount([{ chipsIssued: 10_000, finalChips: 10_100 }]);
    expect(check.verdict).toBe('SURPLUS');
    expect(check.difference).toBe(100);
  });
});
