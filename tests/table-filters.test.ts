import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  dateWindow,
  EMPTY_FILTER,
  filterTables,
  matchesQuery,
  shiftDays,
  type FilterableTable,
  type TableFilter,
} from '@/lib/domain/table-filters';

const TODAY = '2026-08-26';

const table = (over: Partial<FilterableTable>): FilterableTable => ({
  name: 'פוקר של יום חמישי',
  status: 'COMPLETED',
  gameDate: '2026-08-20',
  ...over,
});

const TABLES: FilterableTable[] = [
  table({ name: 'פוקר של יום חמישי', status: 'ACTIVE', gameDate: TODAY }),
  table({ name: 'ערב פוקר בתל אביב', status: 'COMPLETED', gameDate: '2026-08-24' }),
  table({ name: 'Home Game', status: 'COMPLETED', gameDate: '2026-08-10' }),
  table({ name: 'טורניר החברים', status: 'CANCELLED', gameDate: '2026-07-01' }),
  table({ name: 'פוקר בשבת', status: 'COUNTING', gameDate: '2026-08-25' }),
  table({ name: 'משחק חדש', status: 'WAITING', gameDate: '2026-09-02' }),
];

const filter = (over: Partial<TableFilter>): TableFilter => ({ ...EMPTY_FILTER, ...over });
const names = (f: Partial<TableFilter>) =>
  filterTables(TABLES, filter(f), TODAY).map((t) => t.name);

describe('searching by name', () => {
  it('matches a full Hebrew name', () => {
    expect(names({ query: 'פוקר של יום חמישי' })).toEqual(['פוקר של יום חמישי']);
  });

  it('matches part of a Hebrew name', () => {
    expect(names({ query: 'פוקר' })).toEqual([
      'פוקר של יום חמישי',
      'ערב פוקר בתל אביב',
      'פוקר בשבת',
    ]);
  });

  it('ignores case for Latin names', () => {
    expect(names({ query: 'home' })).toEqual(['Home Game']);
    expect(names({ query: 'HOME GAME' })).toEqual(['Home Game']);
  });

  it('ignores surrounding whitespace', () => {
    expect(names({ query: '   שבת  ' })).toEqual(['פוקר בשבת']);
  });

  it('returns everything for an empty query', () => {
    expect(names({ query: '   ' })).toHaveLength(TABLES.length);
    expect(matchesQuery('כל שם', '')).toBe(true);
  });

  it('returns nothing when nothing matches', () => {
    expect(names({ query: 'בלאקג׳ק' })).toEqual([]);
  });
});

describe('filtering by status', () => {
  it.each([
    ['ACTIVE', ['פוקר של יום חמישי']],
    ['COMPLETED', ['ערב פוקר בתל אביב', 'Home Game']],
    ['CANCELLED', ['טורניר החברים']],
    ['COUNTING', ['פוקר בשבת']],
    ['WAITING', ['משחק חדש']],
  ] as const)('shows only %s tables', (status, expected) => {
    expect(names({ status })).toEqual(expected);
  });

  it('shows everything for הכל', () => {
    expect(names({ status: 'ALL' })).toHaveLength(TABLES.length);
  });
});

describe('filtering by date', () => {
  it('counts today as one of the last seven days', () => {
    expect(dateWindow(filter({ date: 'LAST_7' }), TODAY)).toEqual({
      from: '2026-08-20',
      to: TODAY,
    });
  });

  it('finds today only', () => {
    expect(names({ date: 'TODAY' })).toEqual(['פוקר של יום חמישי']);
  });

  it('finds the last 7 days', () => {
    expect(names({ date: 'LAST_7' })).toEqual([
      'פוקר של יום חמישי',
      'ערב פוקר בתל אביב',
      'פוקר בשבת',
    ]);
  });

  it('finds the last 30 days', () => {
    expect(names({ date: 'LAST_30' })).toEqual([
      'פוקר של יום חמישי',
      'ערב פוקר בתל אביב',
      'Home Game',
      'פוקר בשבת',
    ]);
  });

  it('excludes a game dated in the future from every rolling window', () => {
    for (const date of ['TODAY', 'LAST_7', 'LAST_30'] as const) {
      expect(names({ date })).not.toContain('משחק חדש');
    }
  });

  it('crosses a month boundary correctly', () => {
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDays('2024-03-01', -1)).toBe('2024-02-29'); // a leap year
  });

  describe('a custom range', () => {
    it('includes both ends', () => {
      expect(names({ date: 'RANGE', from: '2026-08-24', to: '2026-08-25' })).toEqual([
        'ערב פוקר בתל אביב',
        'פוקר בשבת',
      ]);
    });

    it('treats a missing end as open', () => {
      expect(names({ date: 'RANGE', from: '2026-08-25', to: '' })).toEqual([
        'פוקר של יום חמישי',
        'פוקר בשבת',
        'משחק חדש',
      ]);
      expect(names({ date: 'RANGE', from: '', to: '2026-07-31' })).toEqual(['טורניר החברים']);
    });

    it('reads a backwards range the way it was meant', () => {
      expect(names({ date: 'RANGE', from: '2026-08-25', to: '2026-08-24' })).toEqual(
        names({ date: 'RANGE', from: '2026-08-24', to: '2026-08-25' }),
      );
    });

    it('filters nothing until a bound is given', () => {
      expect(names({ date: 'RANGE' })).toHaveLength(TABLES.length);
    });
  });
});

describe('filters together', () => {
  it('combines name, status and date', () => {
    expect(
      names({ query: 'פוקר', status: 'COMPLETED', date: 'LAST_7' }),
    ).toEqual(['ערב פוקר בתל אביב']);
  });

  it('returns nothing when the combination excludes everything', () => {
    expect(names({ query: 'פוקר', status: 'CANCELLED' })).toEqual([]);
  });

  it('is unfiltered by default', () => {
    expect(names({})).toHaveLength(TABLES.length);
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
  });

  it('counts what is actually narrowing the list', () => {
    expect(activeFilterCount(filter({ query: 'פוקר' }))).toBe(1);
    expect(activeFilterCount(filter({ query: 'פוקר', status: 'ACTIVE' }))).toBe(2);
    expect(
      activeFilterCount(filter({ query: 'פוקר', status: 'ACTIVE', date: 'TODAY' })),
    ).toBe(3);
    // An empty custom range narrows nothing, so it does not count.
    expect(activeFilterCount(filter({ date: 'RANGE' }))).toBe(0);
    expect(activeFilterCount(filter({ query: '   ' }))).toBe(0);
  });

  it('leaves the original list untouched', () => {
    const before = [...TABLES];
    filterTables(TABLES, filter({ query: 'פוקר' }), TODAY);
    expect(TABLES).toEqual(before);
  });
});
