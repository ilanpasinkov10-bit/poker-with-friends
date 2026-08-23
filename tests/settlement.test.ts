import { describe, expect, it } from 'vitest';
import { computeSettlement, verifySettlement, type PlayerBalance } from '@/lib/domain/settlement';
import { computeFinalResults } from '@/lib/domain/chips';

const ils = (amount: number) => amount * 100;

describe('settlement algorithm', () => {
  it('solves the worked example with three transfers', () => {
    const balances: PlayerBalance[] = [
      { id: 'ilan', amountAgorot: ils(100) },
      { id: 'shay', amountAgorot: ils(50) },
      { id: 'daniel', amountAgorot: ils(-80) },
      { id: 'roy', amountAgorot: ils(-70) },
    ];

    const transfers = computeSettlement(balances);
    expect(verifySettlement(balances, transfers)).toBe(true);
    expect(transfers).toEqual([
      { from: 'daniel', to: 'ilan', amountAgorot: ils(80) },
      { from: 'roy', to: 'ilan', amountAgorot: ils(20) },
      { from: 'roy', to: 'shay', amountAgorot: ils(50) },
    ]);
  });

  it('returns no transfers when everyone broke even', () => {
    expect(computeSettlement([{ id: 'a', amountAgorot: 0 }, { id: 'b', amountAgorot: 0 }])).toEqual([]);
  });

  it('needs at most n-1 transfers', () => {
    const balances: PlayerBalance[] = [
      { id: 'a', amountAgorot: ils(37) },
      { id: 'b', amountAgorot: ils(-12) },
      { id: 'c', amountAgorot: ils(-5) },
      { id: 'd', amountAgorot: ils(90) },
      { id: 'e', amountAgorot: ils(-110) },
    ];
    const transfers = computeSettlement(balances);
    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
    expect(verifySettlement(balances, transfers)).toBe(true);
  });

  it('handles a single creditor covering many debtors', () => {
    const balances: PlayerBalance[] = [
      { id: 'winner', amountAgorot: ils(300) },
      { id: 'a', amountAgorot: ils(-100) },
      { id: 'b', amountAgorot: ils(-100) },
      { id: 'c', amountAgorot: ils(-100) },
    ];
    const transfers = computeSettlement(balances);
    expect(transfers).toHaveLength(3);
    expect(transfers.every((t) => t.to === 'winner')).toBe(true);
    expect(verifySettlement(balances, transfers)).toBe(true);
  });

  it('refuses balances that do not sum to zero', () => {
    expect(() =>
      computeSettlement([
        { id: 'a', amountAgorot: ils(10) },
        { id: 'b', amountAgorot: ils(-5) },
      ]),
    ).toThrow(/sum to zero/);
  });

  it('refuses non-integer balances', () => {
    expect(() =>
      computeSettlement([
        { id: 'a', amountAgorot: 10.5 },
        { id: 'b', amountAgorot: -10.5 },
      ]),
    ).toThrow(/integer agorot/);
  });

  it('rejects a tampered transfer plan', () => {
    const balances: PlayerBalance[] = [
      { id: 'a', amountAgorot: ils(50) },
      { id: 'b', amountAgorot: ils(-50) },
    ];
    const good = computeSettlement(balances);
    expect(verifySettlement(balances, good)).toBe(true);

    // Same shape, wrong amount — exactly what the database check must catch.
    expect(verifySettlement(balances, [{ from: 'b', to: 'a', amountAgorot: ils(40) }])).toBe(false);
    // A payer who was never at the table.
    expect(verifySettlement(balances, [{ from: 'ghost', to: 'a', amountAgorot: ils(50) }])).toBe(false);
    // Negative amounts.
    expect(verifySettlement(balances, [{ from: 'a', to: 'b', amountAgorot: -ils(50) }])).toBe(false);
  });

  it('settles a full game end to end', () => {
    const economics = { buyInAgorot: 5000, chipsPerBuyIn: 500 };
    const results = computeFinalResults(
      [
        { id: 'ilan', buyInCount: 2, totalPaidAgorot: 10_000, chipsIssued: 1000, finalChips: 1500 },
        { id: 'shay', buyInCount: 2, totalPaidAgorot: 10_000, chipsIssued: 1000, finalChips: 1400 },
        { id: 'daniel', buyInCount: 3, totalPaidAgorot: 15_000, chipsIssued: 1500, finalChips: 600 },
      ],
      economics,
    );

    const balances = results.map((r) => ({ id: r.id, amountAgorot: r.profitLossAgorot }));
    expect(balances.reduce((sum, b) => sum + b.amountAgorot, 0)).toBe(0);

    const transfers = computeSettlement(balances);
    expect(verifySettlement(balances, transfers)).toBe(true);
    expect(transfers.every((t) => t.amountAgorot > 0)).toBe(true);
  });
});
