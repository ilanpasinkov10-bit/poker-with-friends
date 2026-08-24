import { describe, expect, it } from 'vitest';
import {
  chipsToAgorot,
  computeFinalResults,
  type PlayerLedgerTotals,
  type TableEconomics,
} from '@/lib/domain/chips';
import {
  computePotTotals,
  summariseCashOut,
  type CashOutSummary,
} from '@/lib/domain/participation';
import { computeSettlement, verifySettlement } from '@/lib/domain/settlement';

/**
 * What a player who left an ACTIVE table walked away with.
 *
 * The rule these tests pin down is that the summary is *derived*, never
 * entered: the chips are the approved count `leave_table` persisted, the money
 * paid in is the ledger total, and the conversion between them is the one
 * `computeFinalResults` uses. Nothing in the UI is allowed to compute it, so
 * the same numbers appear in the leave dialog, on the card, in the active pot
 * and in the final settlement.
 */

const ECONOMICS: TableEconomics = { buyInAgorot: 5_000, chipsPerBuyIn: 500 };

/** Shape of the fields `loadTableView` feeds to `summariseCashOut`. */
interface Seat {
  id: string;
  leftAt: unknown;
  approvedChips: number | null;
  submittedChips: number | null;
  totalPaidAgorot: number;
  hasFinancials: boolean;
}

function seat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: 'seat-lior',
    leftAt: null,
    approvedChips: null,
    submittedChips: null,
    totalPaidAgorot: 3 * ECONOMICS.buyInAgorot,
    hasFinancials: true,
    ...overrides,
  };
}

/** A completed leave: `left_at` stamped and the count written and approved. */
function leftSeat(overrides: Partial<Seat> = {}): Seat {
  return seat({
    leftAt: '2026-08-23T20:55:00.000Z',
    submittedChips: 1_200,
    approvedChips: 1_200,
    ...overrides,
  });
}

function withSummary(s: Seat): Seat & { cashOut: CashOutSummary | null } {
  return { ...s, cashOut: summariseCashOut(s, ECONOMICS) };
}

// ---------------------------------------------------------------------------
// 1. Active player -> no "עזב עם"
// ---------------------------------------------------------------------------
describe('a player who is still at the table', () => {
  it('has no cash-out summary', () => {
    expect(summariseCashOut(seat(), ECONOMICS)).toBeNull();
  });

  it('has none even after submitting a chip count during counting', () => {
    // The counting phase writes a count for everyone. That is not leaving.
    expect(
      summariseCashOut(seat({ submittedChips: 1_200, approvedChips: 1_200 }), ECONOMICS),
    ).toBeNull();
  });

  it('has none when the left_at column is missing from the response', () => {
    // `undefined` arrives when a migration is unapplied or the schema cache is
    // stale. It must not turn every seated player into a leaver with a result.
    expect(summariseCashOut(seat({ leftAt: undefined }), ECONOMICS)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Successful leaving player -> final chips visible
// ---------------------------------------------------------------------------
describe('a player whose leave completed', () => {
  it('exposes the chip count they submitted when leaving', () => {
    const summary = summariseCashOut(leftSeat(), ECONOMICS);
    expect(summary).not.toBeNull();
    expect(summary!.finalChips).toBe(1_200);
    expect(summary!.leftAt).toBe('2026-08-23T20:55:00.000Z');
  });

  it('reports zero chips as a real count, not as "no summary"', () => {
    const summary = summariseCashOut(
      leftSeat({ submittedChips: 0, approvedChips: 0 }),
      ECONOMICS,
    );
    expect(summary).not.toBeNull();
    expect(summary!.finalChips).toBe(0);
    expect(summary!.finalValueAgorot).toBe(0);
    expect(summary!.profitLossAgorot).toBe(-3 * ECONOMICS.buyInAgorot);
  });
});

// ---------------------------------------------------------------------------
// 3. Cash value matches the leave transaction
// ---------------------------------------------------------------------------
describe('the cash value', () => {
  it('is the persisted approved count run through the shared conversion', () => {
    const summary = summariseCashOut(leftSeat(), ECONOMICS)!;
    // 1,200 chips at 5,000 agorot per 500 chips = 12,000 agorot = 120₪.
    expect(summary.finalValueAgorot).toBe(12_000);
    expect(summary.finalValueAgorot).toBe(chipsToAgorot(1_200, ECONOMICS));
  });

  it('uses the approved count, never the raw submission', () => {
    // If the two ever diverge, the approved value is the accounting one.
    const summary = summariseCashOut(
      leftSeat({ submittedChips: 9_999, approvedChips: 1_200 }),
      ECONOMICS,
    )!;
    expect(summary.finalChips).toBe(1_200);
    expect(summary.finalValueAgorot).toBe(chipsToAgorot(1_200, ECONOMICS));
  });

  it('floors to whole agorot, the same first step the settlement takes', () => {
    const odd: TableEconomics = { buyInAgorot: 5_000, chipsPerBuyIn: 700 };
    // 1,000 * 5,000 / 700 = 7,142.857… -> 7,142 agorot.
    expect(chipsToAgorot(1_000, odd)).toBe(7_142);
    expect(summariseCashOut(leftSeat({ approvedChips: 1_000 }), odd)!.finalValueAgorot).toBe(7_142);
  });
});

// ---------------------------------------------------------------------------
// 4. Profit/loss matches the accounting model
// ---------------------------------------------------------------------------
describe('the realised result', () => {
  it('is cash out minus everything paid in', () => {
    // The example from the spec: 3 entries, 150₪ in, 1,200 chips out.
    const summary = summariseCashOut(leftSeat(), ECONOMICS)!;
    expect(summary.profitLossAgorot).toBe(12_000 - 15_000);
    expect(summary.profitLossAgorot).toBe(-3_000); // -30₪
  });

  it('is positive for a winner', () => {
    const summary = summariseCashOut(
      leftSeat({ submittedChips: 2_000, approvedChips: 2_000 }),
      ECONOMICS,
    )!;
    expect(summary.finalValueAgorot).toBe(20_000); // 200₪
    expect(summary.profitLossAgorot).toBe(5_000); // +50₪
  });

  it('is exactly zero for a player who broke even', () => {
    const summary = summariseCashOut(
      leftSeat({ submittedChips: 1_500, approvedChips: 1_500 }),
      ECONOMICS,
    )!;
    expect(summary.profitLossAgorot).toBe(0);
  });

  it('is withheld when the paid-in total is not visible to the viewer', () => {
    // Under PRIVATE visibility RLS returns no ledger rows for other players.
    // A result computed against a missing total would be a fabrication.
    expect(summariseCashOut(leftSeat({ hasFinancials: false }), ECONOMICS)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5 & 6. Guests and registered users are treated identically
// ---------------------------------------------------------------------------
describe('who the leaver is', () => {
  it('makes no difference to the summary', () => {
    // A guest's row carries the same columns; nothing in the derivation looks
    // at the account type, so both produce byte-identical summaries.
    const guest = summariseCashOut(leftSeat({ id: 'seat-guest' }), ECONOMICS);
    const registered = summariseCashOut(leftSeat({ id: 'seat-registered' }), ECONOMICS);
    expect(guest).toEqual(registered);
    expect(guest).toEqual({
      leftAt: '2026-08-23T20:55:00.000Z',
      finalChips: 1_200,
      finalValueAgorot: 12_000,
      profitLossAgorot: -3_000,
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Failed leave -> no leave summary
// ---------------------------------------------------------------------------
describe('a leave that did not complete', () => {
  it('shows nothing when the server rejected it and wrote neither half', () => {
    // LEAVE_TABLE_NOT_ACTIVE, LEAVE_UNAUTHORIZED and friends roll back the
    // whole transaction, so the row is untouched.
    expect(summariseCashOut(seat(), ECONOMICS)).toBeNull();
  });

  it('shows nothing for a count still awaiting the admin approval', () => {
    expect(
      summariseCashOut(leftSeat({ submittedChips: 1_200, approvedChips: null }), ECONOMICS),
    ).toBeNull();
  });

  it('shows nothing for a nonsensical stored count', () => {
    for (const chips of [-1, 1.5, Number.NaN]) {
      expect(summariseCashOut(leftSeat({ approvedChips: chips }), ECONOMICS)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 8. A refresh preserves the same values
// ---------------------------------------------------------------------------
describe('re-deriving after a realtime refresh', () => {
  it('produces identical values from the same persisted row', () => {
    const row = leftSeat();
    const first = summariseCashOut(row, ECONOMICS);
    const second = summariseCashOut({ ...row }, ECONOMICS);
    expect(second).toEqual(first);
  });

  it('depends on nothing but the persisted row and the table economics', () => {
    // Realtime re-runs the loader on the server. If the summary depended on
    // when it ran, the numbers would drift between refreshes.
    const row = leftSeat();
    const values = Array.from({ length: 5 }, () => summariseCashOut(row, ECONOMICS));
    for (const value of values) expect(value).toEqual(values[0]);
  });
});

// ---------------------------------------------------------------------------
// 9. The active pot drops by exactly the displayed cash-out
// ---------------------------------------------------------------------------
describe('the active pot', () => {
  const seated = [
    withSummary(seat({ id: 'seat-a', totalPaidAgorot: 4 * ECONOMICS.buyInAgorot })),
    withSummary(seat({ id: 'seat-b', totalPaidAgorot: 3 * ECONOMICS.buyInAgorot })),
  ];

  it('equals the full pot while nobody has left', () => {
    const pot = computePotTotals(seated);
    expect(pot.potAgorot).toBe(35_000);
    expect(pot.cashedOutAgorot).toBe(0);
    expect(pot.activePotAgorot).toBe(35_000);
  });

  it('drops by exactly the amount shown on the leaver card', () => {
    const leaver = withSummary(leftSeat({ id: 'seat-lior' }));
    const before = computePotTotals(seated);
    const after = computePotTotals([...seated, leaver]);

    // Their entries joined the pot and their stack came out of it.
    expect(after.potAgorot).toBe(before.potAgorot + 15_000);
    expect(before.potAgorot + 15_000 - after.activePotAgorot).toBe(
      leaver.cashOut!.finalValueAgorot,
    );
    expect(after.cashedOutAgorot).toBe(leaver.cashOut!.finalValueAgorot);
  });

  it('ignores a player whose leave has not completed', () => {
    const pending = withSummary(
      leftSeat({ id: 'seat-pending', submittedChips: 1_200, approvedChips: null }),
    );
    const pot = computePotTotals([...seated, pending]);
    expect(pot.cashedOutAgorot).toBe(0);
    expect(pot.activePotAgorot).toBe(pot.potAgorot);
  });
});

// ---------------------------------------------------------------------------
// 10. The final settlement still matches the same numbers
// ---------------------------------------------------------------------------
describe('the final settlement', () => {
  // Two players leave mid-game, three play to the end. The counted chips equal
  // the issued chips, which is what finalization requires.
  const LEDGER: PlayerLedgerTotals[] = [
    { id: 'seat-lior', buyInCount: 3, totalPaidAgorot: 15_000, chipsIssued: 1_500, finalChips: 1_200 },
    { id: 'seat-noam', buyInCount: 2, totalPaidAgorot: 10_000, chipsIssued: 1_000, finalChips: 2_000 },
    { id: 'seat-ilan', buyInCount: 4, totalPaidAgorot: 20_000, chipsIssued: 2_000, finalChips: 800 },
    { id: 'seat-shay', buyInCount: 3, totalPaidAgorot: 15_000, chipsIssued: 1_500, finalChips: 2_500 },
    { id: 'seat-michal', buyInCount: 2, totalPaidAgorot: 10_000, chipsIssued: 1_000, finalChips: 500 },
  ];

  const results = computeFinalResults(LEDGER, ECONOMICS);
  const byId = new Map(results.map((r) => [r.id, r]));

  it('credits each leaver exactly what their card showed', () => {
    for (const id of ['seat-lior', 'seat-noam']) {
      const row = LEDGER.find((l) => l.id === id)!;
      const summary = summariseCashOut(
        leftSeat({
          id,
          submittedChips: row.finalChips,
          approvedChips: row.finalChips,
          totalPaidAgorot: row.totalPaidAgorot,
        }),
        ECONOMICS,
      )!;
      expect(byId.get(id)!.finalValueAgorot).toBe(summary.finalValueAgorot);
      expect(byId.get(id)!.profitLossAgorot).toBe(summary.profitLossAgorot);
    }
  });

  it('still balances to zero with leavers in the game', () => {
    expect(results.reduce((sum, r) => sum + r.profitLossAgorot, 0)).toBe(0);
    const transfers = computeSettlement(
      results.map((r) => ({ id: r.id, amountAgorot: r.profitLossAgorot })),
    );
    expect(
      verifySettlement(
        results.map((r) => ({ id: r.id, amountAgorot: r.profitLossAgorot })),
        transfers,
      ),
    ).toBe(true);
  });

  it('leaves the settlement able to differ by at most one agora on odd economics', () => {
    // When chips do not divide evenly the settlement hands the few leftover
    // agorot to the largest remainders, which no single player can know while
    // the game is still running. That is the only permitted divergence.
    const odd: TableEconomics = { buyInAgorot: 5_000, chipsPerBuyIn: 700 };
    for (const row of computeFinalResults(LEDGER, odd)) {
      const floor = chipsToAgorot(row.finalChips, odd);
      expect(row.finalValueAgorot - floor).toBeGreaterThanOrEqual(0);
      expect(row.finalValueAgorot - floor).toBeLessThanOrEqual(1);
    }
  });
});
