import { assertSafeAgorot } from './money';

export interface TableEconomics {
  /** Cost of one entry, in agorot. */
  buyInAgorot: number;
  /** Chips handed out per entry. */
  chipsPerBuyIn: number;
}

export interface PlayerLedgerTotals {
  id: string;
  buyInCount: number;
  totalPaidAgorot: number;
  chipsIssued: number;
  finalChips: number;
}

export interface PlayerFinalResult extends PlayerLedgerTotals {
  finalValueAgorot: number;
  profitLossAgorot: number;
}

/**
 * Converts each player's final chip stack back into money.
 *
 * The naive `round(chips / chipsPerBuyIn * buyIn)` per player can lose or
 * invent agorot, which would make the settlement fail to balance. Instead we
 * use the largest-remainder method: everyone gets the floor of their exact
 * value, and the leftover agorot go to the players with the largest fractional
 * remainders. Because the counted chips equal the issued chips (enforced
 * before finalization) the exact values sum to exactly the pot, so the result
 * is a partition of the pot and the profit/loss column sums to exactly zero.
 *
 * This mirrors `public.compute_final_rows` in the database, which is the
 * authority at finalization time.
 */
export function computeFinalResults(
  players: readonly PlayerLedgerTotals[],
  economics: TableEconomics,
): PlayerFinalResult[] {
  const { buyInAgorot, chipsPerBuyIn } = economics;
  if (!Number.isInteger(buyInAgorot) || buyInAgorot <= 0) {
    throw new Error('buyInAgorot must be a positive integer');
  }
  if (!Number.isInteger(chipsPerBuyIn) || chipsPerBuyIn <= 0) {
    throw new Error('chipsPerBuyIn must be a positive integer');
  }

  const scored = players.map((p) => {
    const exact = p.finalChips * buyInAgorot;
    return {
      player: p,
      floorValue: Math.floor(exact / chipsPerBuyIn),
      remainder: exact % chipsPerBuyIn,
    };
  });

  const totalPot = players.reduce((sum, p) => sum + p.totalPaidAgorot, 0);
  const floorSum = scored.reduce((sum, s) => sum + s.floorValue, 0);
  const distribute = Math.min(Math.max(totalPot - floorSum, 0), scored.length);

  // Same deterministic ordering as the SQL implementation: remainder desc, id asc.
  const order = [...scored].sort(
    (a, b) => b.remainder - a.remainder || (a.player.id < b.player.id ? -1 : 1),
  );
  const bonus = new Set(order.slice(0, distribute).map((s) => s.player.id));

  return scored.map(({ player, floorValue }) => {
    const finalValueAgorot = floorValue + (bonus.has(player.id) ? 1 : 0);
    return {
      ...player,
      finalValueAgorot: assertSafeAgorot(finalValueAgorot, 'finalValueAgorot'),
      profitLossAgorot: finalValueAgorot - player.totalPaidAgorot,
    };
  });
}

export type ChipCountVerdict = 'BALANCED' | 'MISSING' | 'SURPLUS';

export interface ChipCountValidation {
  verdict: ChipCountVerdict;
  totalIssued: number;
  totalCounted: number;
  /** counted - issued. Negative means chips are missing from the count. */
  difference: number;
}

export function validateChipCount(
  players: readonly Pick<PlayerLedgerTotals, 'chipsIssued' | 'finalChips'>[],
): ChipCountValidation {
  const totalIssued = players.reduce((sum, p) => sum + p.chipsIssued, 0);
  const totalCounted = players.reduce((sum, p) => sum + p.finalChips, 0);
  const difference = totalCounted - totalIssued;
  return {
    verdict: difference === 0 ? 'BALANCED' : difference < 0 ? 'MISSING' : 'SURPLUS',
    totalIssued,
    totalCounted,
    difference,
  };
}

/** How many more entries this player may still take. */
export function remainingBuyIns(buyInCount: number, maxBuyIns: number): number {
  return Math.max(0, maxBuyIns - buyInCount);
}

export function canAddBuyIn(buyInCount: number, maxBuyIns: number): boolean {
  return buyInCount < maxBuyIns;
}

/** Money and chips added by taking `count` more entries. */
export function buyInDelta(count: number, economics: TableEconomics) {
  return {
    amountAgorot: count * economics.buyInAgorot,
    chips: count * economics.chipsPerBuyIn,
  };
}
