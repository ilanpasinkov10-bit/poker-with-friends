/**
 * What a share card says about a finished game.
 *
 * Every number here is read from `game_results` — the frozen rows written once
 * by `finalize_game`. Nothing is recomputed: the profit on the card is the
 * profit the settlement screen shows, because it is literally the same column.
 * A card made months later says exactly what it said on the night, including
 * the names, because `display_name` is snapshotted into those rows too.
 *
 * Pure: no React, no canvas, no Supabase, no clock of its own.
 */

import type { GameResultRow, PokerTableRow } from '@/types/database';

export interface ShareRow {
  /** The name as it was when the game was finalised. */
  name: string;
  /** 1-based finishing position, by net result. */
  rank: number;
  netAgorot: number;
  buyInCount: number;
  paidAgorot: number;
}

export interface ShareAward {
  name: string;
  /** For the rebuy king: how many entries they took. */
  count?: number;
  netAgorot?: number;
}

export interface ShareCardModel {
  rows: ShareRow[];
  playerCount: number;
  potAgorot: number;
  totalBuyIns: number;
  /** Milliseconds of play, or null when the game has no usable timestamps. */
  durationMs: number | null;
  /** The night the game was played, as an ISO date string. */
  playedOn: string;
  /** Only when somebody actually finished ahead. */
  winner: ShareAward | null;
  /** Only when somebody took more than one entry. */
  rebuyKing: ShareAward | null;
}

/**
 * Ordering, and the rules for breaking ties.
 *
 * Ties are settled by a chain that always ends in the name, so the same game
 * produces the same card every time it is opened, on any device. Money first,
 * then who spent less getting there, then alphabetically — Hebrew collation,
 * which is what the rest of the app sorts by.
 */
function compareRows(a: GameResultRow, b: GameResultRow): number {
  if (a.profit_loss_agorot !== b.profit_loss_agorot) {
    return b.profit_loss_agorot - a.profit_loss_agorot;
  }
  if (a.total_paid_agorot !== b.total_paid_agorot) {
    return a.total_paid_agorot - b.total_paid_agorot;
  }
  return a.display_name.localeCompare(b.display_name, 'he');
}

/** Most entries wins; a tie goes to whoever put more money in, then the name. */
function compareRebuys(a: GameResultRow, b: GameResultRow): number {
  if (a.buy_in_count !== b.buy_in_count) return b.buy_in_count - a.buy_in_count;
  if (a.total_paid_agorot !== b.total_paid_agorot) {
    return b.total_paid_agorot - a.total_paid_agorot;
  }
  return a.display_name.localeCompare(b.display_name, 'he');
}

export function buildShareCard(
  table: Pick<PokerTableRow, 'game_date' | 'started_at' | 'completed_at' | 'created_at'>,
  results: readonly GameResultRow[],
): ShareCardModel | null {
  if (results.length === 0) return null;

  const sorted = [...results].sort(compareRows);
  const rows: ShareRow[] = sorted.map((result, index) => ({
    name: result.display_name,
    rank: index + 1,
    netAgorot: result.profit_loss_agorot,
    buyInCount: result.buy_in_count,
    paidAgorot: result.total_paid_agorot,
  }));

  const best = sorted[0]!;
  const mostEntries = [...results].sort(compareRebuys)[0]!;

  return {
    rows,
    playerCount: results.length,
    // The pot is what everybody paid in, which is the same sum the results
    // screen shows under the table.
    potAgorot: results.reduce((sum, r) => sum + r.total_paid_agorot, 0),
    totalBuyIns: results.reduce((sum, r) => sum + r.buy_in_count, 0),
    durationMs: gameLengthMs(table),
    playedOn: table.game_date,
    // No award for finishing least badly. A night where everyone lost has no
    // winner, and saying otherwise would be a lie on a card people share.
    winner:
      best.profit_loss_agorot > 0
        ? { name: best.display_name, netAgorot: best.profit_loss_agorot }
        : null,
    // One entry each is how the game starts; it is not an achievement.
    rebuyKing:
      mostEntries.buy_in_count > 1
        ? { name: mostEntries.display_name, count: mostEntries.buy_in_count }
        : null,
  };
}

/**
 * How long the game ran.
 *
 * From the real timestamps the lifecycle already writes: the moment the
 * manager started play, to the moment the results were frozen. A game with no
 * start recorded gets null rather than a made-up number.
 */
export function gameLengthMs(
  table: Pick<PokerTableRow, 'started_at' | 'completed_at'>,
): number | null {
  if (!table.started_at || !table.completed_at) return null;
  const ms = Date.parse(table.completed_at) - Date.parse(table.started_at);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}

/**
 * A length of play, said the way a person would say it.
 *
 * Not a countdown: "4:32 שעות", never "04:32:11", and never a decimal number
 * of hours.
 */
export function formatGameLength(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'פחות מדקה';
  if (minutes === 1) return 'דקה אחת';
  if (minutes < 60) return `${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}:${String(rest).padStart(2, '0')} שעות`;
}

/** 🥇🥈🥉 for the podium, nothing for the rest. */
export function medalFor(rank: number): string | null {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
}
