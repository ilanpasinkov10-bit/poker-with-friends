import { describe, expect, it } from 'vitest';
import {
  canHideTable,
  GROUP_ORDER,
  GROUP_TITLE,
  groupTables,
  sortKey,
} from '@/lib/domain/table-groups';
import { filterTables, EMPTY_FILTER } from '@/lib/domain/table-filters';
import { summariseMyTables, type TableWithSeats } from '@/lib/domain/tables';
import type { PokerTableRow, TableStatus } from '@/types/database';

let seq = 0;
function table(over: Partial<PokerTableRow> = {}): PokerTableRow {
  seq += 1;
  return {
    id: `t${String(seq).padStart(3, '0')}`,
    group_id: null,
    owner_id: 'me',
    name: `שולחן ${seq}`,
    join_code: 'A7K92',
    game_date: '2026-08-28',
    planned_start_at: '2026-08-28T18:00:00.000Z',
    planned_end_at: '2026-08-28T23:00:00.000Z',
    buy_in_agorot: 5000,
    chips_per_buy_in: 500,
    max_buy_ins: 6,
    join_mode: 'AUTO_JOIN',
    player_visibility: 'OPEN',
    counting_mode: 'ADMIN_COUNT',
    status: 'WAITING',
    started_at: null,
    counting_started_at: null,
    completed_at: null,
    ending_soon_notified_at: null,
    blind_levels: [],
    blind_status: 'DISABLED',
    blind_level_index: 0,
    blind_level_started_at: null,
    blind_paused_at: null,
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-28T18:00:00.000Z',
    ...over,
  };
}
const item = (over: Partial<PokerTableRow> = {}) => ({ table: table(over) });

describe('the sections, and their order', () => {
  it('runs through the game the way the game runs', () => {
    expect(GROUP_ORDER).toEqual(['WAITING', 'ACTIVE', 'COUNTING', 'COMPLETED', 'CANCELLED']);
    expect(GROUP_ORDER.map((s) => GROUP_TITLE[s])).toEqual([
      'ממתין להתחלה',
      'שולחנות פעילים',
      'ספירת ז׳יטונים',
      'משחקים שהסתיימו',
      'משחקים שבוטלו',
    ]);
  });

  it('uses the lifecycle statuses themselves, not a second vocabulary', () => {
    const enumValues: TableStatus[] = ['WAITING', 'ACTIVE', 'COUNTING', 'COMPLETED', 'CANCELLED'];
    expect([...GROUP_ORDER].sort()).toEqual([...enumValues].sort());
  });

  it('puts each status in exactly its own section', () => {
    const groups = groupTables([
      item({ status: 'CANCELLED' }),
      item({ status: 'COMPLETED' }),
      item({ status: 'COUNTING' }),
      item({ status: 'ACTIVE' }),
      item({ status: 'WAITING' }),
    ]);
    expect(groups.map((g) => g.status)).toEqual(GROUP_ORDER);
    expect(groups.every((g) => g.items.length === 1)).toBe(true);
    expect(groups.every((g) => g.items.every((i) => i.table.status === g.status))).toBe(true);
  });
});

describe('sections with nothing in them', () => {
  it('are not rendered at all', () => {
    // Two waiting, no active, one counting, three completed, no cancelled.
    const groups = groupTables([
      item({ status: 'WAITING' }),
      item({ status: 'WAITING' }),
      item({ status: 'COUNTING' }),
      item({ status: 'COMPLETED' }),
      item({ status: 'COMPLETED' }),
      item({ status: 'COMPLETED' }),
    ]);
    expect(groups.map((g) => [g.title, g.items.length])).toEqual([
      ['ממתין להתחלה', 2],
      ['ספירת ז׳יטונים', 1],
      ['משחקים שהסתיימו', 3],
    ]);
  });

  it('leaves nothing at all when there is nothing at all', () => {
    expect(groupTables([])).toEqual([]);
  });

  it('shows one section when only one status is present', () => {
    const groups = groupTables([item({ status: 'COMPLETED' }), item({ status: 'COMPLETED' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBe('משחקים שהסתיימו');
  });
});

describe('the order inside a section', () => {
  it('sorts waiting games by when they are due to start, newest first', () => {
    const groups = groupTables([
      item({ status: 'WAITING', planned_start_at: '2026-08-28T21:00:00Z' }),
      item({ status: 'WAITING', planned_start_at: '2026-08-29T15:00:00Z' }),
      item({ status: 'WAITING', planned_start_at: '2026-08-29T13:30:00Z' }),
    ]);
    expect(groups[0]!.items.map((i) => i.table.planned_start_at)).toEqual([
      '2026-08-29T15:00:00Z',
      '2026-08-29T13:30:00Z',
      '2026-08-28T21:00:00Z',
    ]);
  });

  it('sorts active games by when play actually began', () => {
    // Not by what they were scheduled for: a game that started late is still
    // the one that started most recently.
    const early = item({ status: 'ACTIVE', planned_start_at: '2026-08-28T18:00:00Z', started_at: '2026-08-28T22:00:00Z' });
    const late = item({ status: 'ACTIVE', planned_start_at: '2026-08-28T20:00:00Z', started_at: '2026-08-28T20:05:00Z' });
    expect(groupTables([late, early])[0]!.items[0]).toBe(early);
  });

  it('sorts counting games by when counting began', () => {
    const a = item({ status: 'COUNTING', counting_started_at: '2026-08-28T23:00:00Z' });
    const b = item({ status: 'COUNTING', counting_started_at: '2026-08-29T01:00:00Z' });
    expect(groupTables([a, b])[0]!.items[0]).toBe(b);
  });

  it('sorts finished games by when they were finished', () => {
    const a = item({ status: 'COMPLETED', completed_at: '2026-08-28T23:30:00Z' });
    const b = item({ status: 'COMPLETED', completed_at: '2026-08-29T02:00:00Z' });
    expect(groupTables([a, b])[0]!.items[0]).toBe(b);
  });

  it('sorts cancelled games by when they were last touched', () => {
    // There is no cancelled_at, and this does not invent one: cancelling is
    // the last write a cancelled table gets.
    const a = item({ status: 'CANCELLED', updated_at: '2026-08-28T19:00:00Z' });
    const b = item({ status: 'CANCELLED', updated_at: '2026-08-29T09:00:00Z' });
    expect(groupTables([a, b])[0]!.items[0]).toBe(b);
  });

  it('falls back to something sensible when the timestamp is missing', () => {
    const withStart = table({ status: 'ACTIVE', started_at: null, planned_start_at: '2026-08-28T18:00:00Z' });
    expect(sortKey(withStart)).toBe(Date.parse('2026-08-28T18:00:00Z'));
    const nothing = table({ status: 'COMPLETED', completed_at: null, planned_start_at: '', created_at: '' });
    expect(sortKey(nothing)).toBe(0);
  });

  it('is stable when two games share a timestamp', () => {
    const rows = [
      item({ status: 'COMPLETED', completed_at: '2026-08-29T02:00:00Z' }),
      item({ status: 'COMPLETED', completed_at: '2026-08-29T02:00:00Z' }),
    ];
    const once = groupTables(rows)[0]!.items.map((i) => i.table.id);
    const twice = groupTables([...rows].reverse())[0]!.items.map((i) => i.table.id);
    expect(once).toEqual(twice);
  });
});

describe('search and filters still come first', () => {
  const today = '2026-08-28';
  const rows = [
    item({ status: 'WAITING', name: 'חמישי בערב' }),
    item({ status: 'ACTIVE', name: 'חמישי בערב' }),
    item({ status: 'COMPLETED', name: 'שבת' }),
    item({ status: 'CANCELLED', name: 'שבת' }),
  ];
  const withFields = rows.map((r) => ({
    ...r, name: r.table.name, status: r.table.status, gameDate: r.table.game_date,
  }));

  it('groups only what the search left behind', () => {
    const matched = filterTables(withFields, { ...EMPTY_FILTER, query: 'חמישי' }, today);
    const groups = groupTables(matched);
    expect(groups.map((g) => g.status)).toEqual(['WAITING', 'ACTIVE']);
  });

  it('groups only what the status filter left behind', () => {
    const matched = filterTables(withFields, { ...EMPTY_FILTER, status: 'COMPLETED' }, today);
    const groups = groupTables(matched);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBe('משחקים שהסתיימו');
  });

  it('shows no sections at all when the filter matches nothing', () => {
    const matched = filterTables(withFields, { ...EMPTY_FILTER, query: 'אין כזה' }, today);
    expect(groupTables(matched)).toEqual([]);
  });
});

describe('which games may be taken off a list', () => {
  it('allows a game that is over', () => {
    expect(canHideTable('COMPLETED')).toBe(true);
    expect(canHideTable('CANCELLED')).toBe(true);
  });

  it('refuses one that is still going', () => {
    // There may still be something for this person to do about it.
    expect(canHideTable('WAITING')).toBe(false);
    expect(canHideTable('ACTIVE')).toBe(false);
    expect(canHideTable('COUNTING')).toBe(false);
  });
});

describe('a table this person has hidden', () => {
  const seats = [{ status: 'ACTIVE' as const }];
  const row = (over: Partial<TableWithSeats> = {}): TableWithSeats =>
    ({ ...table({ status: 'COMPLETED' }), table_players: seats, hidden_tables: [], ...over });

  it('is not on their list', () => {
    const rows = [row(), row({ hidden_tables: [{ hidden_at: '2026-08-29T10:00:00Z' }] }), row()];
    expect(summariseMyTables(rows, 'me')).toHaveLength(2);
  });

  it('is still on every other player\'s list, because the rows are their own', () => {
    // RLS returns only the caller's hidden rows, so another participant's copy
    // of the same table simply has an empty array.
    const asOther = [row({ hidden_tables: [] })];
    expect(summariseMyTables(asOther, 'someone-else')).toHaveLength(1);
  });

  it('leaves the card it hands out as a plain table row', () => {
    const [only] = summariseMyTables([row()], 'me');
    expect('hidden_tables' in only!.table).toBe(false);
    expect('table_players' in only!.table).toBe(false);
  });

  it('is unaffected by a query that did not ask about hiding', () => {
    const legacy = { ...table({ status: 'COMPLETED' }), table_players: seats } as TableWithSeats;
    expect(summariseMyTables([legacy], 'me')).toHaveLength(1);
  });
});
