import { describe, expect, it } from 'vitest';
import { summariseMyTables, type TableWithSeats } from '@/lib/domain/tables';
import type { PokerTableRow } from '@/types/database';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const table = (over: Partial<TableWithSeats> = {}): TableWithSeats =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    group_id: null,
    owner_id: ME,
    name: 'חמישי בערב',
    join_code: 'A7K92',
    game_date: '2026-08-26',
    planned_start_at: '2026-08-26T18:00:00Z',
    planned_end_at: '2026-08-26T23:00:00Z',
    buy_in_agorot: 5000,
    chips_per_buy_in: 500,
    max_buy_ins: 6,
    join_mode: 'AUTO_JOIN',
    player_visibility: 'OPEN',
    counting_mode: 'ADMIN_COUNT',
    status: 'ACTIVE',
    started_at: null,
    counting_started_at: null,
    completed_at: null,
    ending_soon_notified_at: null,
    created_at: '2026-08-26T15:00:00Z',
    updated_at: '2026-08-26T15:00:00Z',
    table_players: [],
    ...over,
  }) as TableWithSeats;

describe('shaping the tables list for whoever is looking', () => {
  it('calls the owner the admin and everyone else a player', () => {
    expect(summariseMyTables([table()], ME)[0]!.role).toBe('ADMIN');
    expect(summariseMyTables([table()], THEM)[0]!.role).toBe('PLAYER');
  });

  it('counts only the people actually seated', () => {
    // A pending request has not joined yet and a removed player has left; a
    // card that counted them would promise a fuller table than there is.
    const rows = [
      table({
        table_players: [
          { status: 'ACTIVE' },
          { status: 'ACTIVE' },
          { status: 'PENDING' },
          { status: 'REJECTED' },
          { status: 'REMOVED' },
        ],
      }),
    ];
    expect(summariseMyTables(rows, ME)[0]!.playerCount).toBe(2);
  });

  it('reads a table with no seats as empty rather than failing', () => {
    expect(summariseMyTables([table({ table_players: [] })], ME)[0]!.playerCount).toBe(0);
  });

  it('does not leave the embedded seats on the table row it hands out', () => {
    // The row goes on to the card component, which expects a plain table.
    const summary = summariseMyTables([table()], ME)[0]!;
    expect('table_players' in (summary.table as PokerTableRow)).toBe(false);
  });
});
