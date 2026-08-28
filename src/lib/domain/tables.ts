/**
 * Turning the rows of the tables list into what the list shows.
 *
 * The query returns every table the viewer may see, with its seats attached.
 * Which of them the viewer *runs*, and how many people are actually sitting at
 * each, depends on who is looking — so it is decided here rather than by the
 * query. That is what lets the query start before the session check has come
 * back.
 *
 * Pure: no React, no Supabase, no clock.
 */

import type { PlayerStatus, PokerTableRow } from '@/types/database';

/**
 * A table row with its seats attached, as the query returns it.
 *
 * `hidden_tables` comes back filtered by RLS to the caller's own rows, so a
 * non-empty array means *this* person has taken *this* table off their list.
 * It rides along with the tables in the same request rather than costing a
 * second one.
 */
export type TableWithSeats = PokerTableRow & {
  table_players: { status: PlayerStatus }[];
  hidden_tables?: { hidden_at: string }[];
};

export interface MyTableSummary {
  table: PokerTableRow;
  role: 'ADMIN' | 'PLAYER';
  playerCount: number;
}

export function summariseMyTables(
  rows: readonly TableWithSeats[],
  userId: string,
): MyTableSummary[] {
  return rows
    // A game this person has hidden is not on their list — not filtered out of
    // it afterwards, simply not part of it. Nothing about the game itself
    // changes, and every other player's list is untouched.
    .filter((row) => (row.hidden_tables?.length ?? 0) === 0)
    .map(({ table_players: seats, hidden_tables, ...table }) => {
      // Both embedded arrays are the query's business; what the card gets is a
      // plain table row. Named here only so the rest is not.
      void hidden_tables;
      return {
        table: table as PokerTableRow,
        role: table.owner_id === userId ? ('ADMIN' as const) : ('PLAYER' as const),
        // Only the people actually seated count. A pending join request or a
        // removed player is not somebody at the table.
        playerCount: (seats ?? []).filter((seat) => seat.status === 'ACTIVE').length,
      };
    });
}
