/**
 * Whether a seat at a table is still occupied.
 *
 * The source of truth is `table_players.left_at`: null while seated, a
 * timestamp once the player completed the leave flow. Nothing else — not a
 * chip submission, not an approved count, not a status value — decides this.
 *
 * The normalisation below exists because the naive `leftAt !== null` test
 * fails toward the wrong answer. If the column is ever absent from a response
 * — an unapplied migration, a stale PostgREST schema cache, a narrowed select
 * — the value arrives as `undefined`, and `undefined !== null` is true, which
 * would mark every seated player as having left. Anything that is not a real
 * timestamp therefore means "still playing".
 */

import { chipsToAgorot, type TableEconomics } from './chips';

/** Only a parseable timestamp counts. Everything else means still seated. */
export function normaliseLeftAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
}

export function hasLeftTable(value: unknown): boolean {
  return normaliseLeftAt(value) !== null;
}

export function isStillSeated(value: unknown): boolean {
  return !hasLeftTable(value);
}

/**
 * What a player walked away with.
 *
 * `leave_table` is a single transaction: it writes the declared count as both
 * the submitted and the approved chip count, and stamps `left_at`. A summary
 * therefore exists only when both halves are present — that is exactly the
 * definition of "the leave transaction completed successfully". A player who is
 * still seated, whose leave attempt failed, or whose count is merely submitted
 * and awaiting the admin's approval has no summary, and the card shows nothing.
 *
 * Nothing here is recalculated from the UI: the chips are the persisted
 * approved count, the money is the persisted ledger total, and the conversion
 * between them is the same `chipsToAgorot` the settlement is built on.
 */
export interface CashOutSummary {
  leftAt: string;
  /** The count the player submitted when leaving, as approved and stored. */
  finalChips: number;
  /** Cash value of those chips. */
  finalValueAgorot: number;
  /** Realised result: value out minus everything paid in. */
  profitLossAgorot: number;
}

export function summariseCashOut(
  player: {
    leftAt: unknown;
    approvedChips: number | null;
    totalPaidAgorot: number;
    hasFinancials: boolean;
  },
  economics: TableEconomics,
): CashOutSummary | null {
  const leftAt = normaliseLeftAt(player.leftAt);
  if (leftAt === null) return null;

  const chips = player.approvedChips;
  if (chips === null || !Number.isInteger(chips) || chips < 0) return null;

  // Without ledger rows the paid-in total is unknown rather than zero, and a
  // result computed against zero would be a fabrication.
  if (!player.hasFinancials) return null;

  const finalValueAgorot = chipsToAgorot(chips, economics);
  return {
    leftAt,
    finalChips: chips,
    finalValueAgorot,
    profitLossAgorot: finalValueAgorot - player.totalPaidAgorot,
  };
}

/**
 * How the pot splits between money still in play and money already taken off
 * the table.
 *
 * Only a completed leave moves money out. A pending count or a failed attempt
 * contributes nothing, so the active pot can never drift away from the chips
 * actually in front of the remaining players.
 */
export interface PotTotals {
  /** Everything paid in by everyone whose money is in this game. */
  potAgorot: number;
  /** Cash value of the stacks players took with them when they left. */
  cashedOutAgorot: number;
  /** What is still being played for. */
  activePotAgorot: number;
}

export function computePotTotals(
  participants: readonly { totalPaidAgorot: number; cashOut: CashOutSummary | null }[],
): PotTotals {
  const potAgorot = participants.reduce((sum, p) => sum + p.totalPaidAgorot, 0);
  const cashedOutAgorot = participants.reduce(
    (sum, p) => sum + (p.cashOut?.finalValueAgorot ?? 0),
    0,
  );
  return { potAgorot, cashedOutAgorot, activePotAgorot: potAgorot - cashedOutAgorot };
}
