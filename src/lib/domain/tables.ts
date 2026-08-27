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

/** A table row with its seats attached, as the query returns it. */
export type TableWithSeats = PokerTableRow & {
  table_players: { status: PlayerStatus }[];
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
  return rows.map(({ table_players: seats, ...table }) => ({
    table: table as PokerTableRow,
    role: table.owner_id === userId ? ('ADMIN' as const) : ('PLAYER' as const),
    // Only the people actually seated count. A pending join request or a
    // removed player is not somebody at the table.
    playerCount: (seats ?? []).filter((seat) => seat.status === 'ACTIVE').length,
  }));
}
