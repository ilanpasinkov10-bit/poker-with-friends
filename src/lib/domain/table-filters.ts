/**
 * Finding one table among many.
 *
 * All of this is pure and works on the rows the page has already loaded. The
 * list is one query capped at a hundred tables and it is fully in memory by the
 * time anything renders, so filtering it is an array operation, not a database
 * question: a round trip per keystroke would be slower, would need a loading
 * state, and would answer nothing the client does not already know.
 *
 * Dates are compared as the plain `YYYY-MM-DD` strings the `game_date` column
 * stores. That is deliberate — turning them into `Date` objects would move a
 * game played at 23:00 into the next day for anyone east of UTC, and "היום"
 * has to mean the day the player means.
 */

import type { TableStatus } from '@/types/database';

export const STATUS_FILTERS = [
  'ALL',
  'WAITING',
  'ACTIVE',
  'COUNTING',
  'COMPLETED',
  'CANCELLED',
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const DATE_FILTERS = ['ALL', 'TODAY', 'LAST_7', 'LAST_30', 'RANGE'] as const;
export type DateFilter = (typeof DATE_FILTERS)[number];

export interface TableFilter {
  /** Free text matched against the table's name. */
  query: string;
  status: StatusFilter;
  date: DateFilter;
  /** Inclusive bounds, `YYYY-MM-DD`. Only read when `date` is `RANGE`. */
  from: string;
  to: string;
}

export const EMPTY_FILTER: TableFilter = {
  query: '',
  status: 'ALL',
  date: 'ALL',
  from: '',
  to: '',
};

/** The shape this module needs; the page's rows are a superset of it. */
export interface FilterableTable {
  name: string;
  status: TableStatus;
  /** `YYYY-MM-DD`. */
  gameDate: string;
}

/** Today, in the viewer's own timezone, as `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `days` before `date`, staying in `YYYY-MM-DD`. */
export function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  // UTC arithmetic on a date-only value: no timezone is involved either side,
  // so no hour can push the result onto a neighbouring day.
  const shifted = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * The inclusive window a date filter selects, or null for "all dates".
 *
 * "7 ימים אחרונים" counts today as one of the seven, which is what someone
 * looking for last Tuesday's game expects.
 */
export function dateWindow(
  filter: TableFilter,
  today: string,
): { from: string; to: string } | null {
  switch (filter.date) {
    case 'ALL':
      return null;
    case 'TODAY':
      return { from: today, to: today };
    case 'LAST_7':
      return { from: shiftDays(today, -6), to: today };
    case 'LAST_30':
      return { from: shiftDays(today, -29), to: today };
    case 'RANGE': {
      // A half-filled range is treated as open on the missing side rather than
      // as no filter at all — someone who has typed only "מתאריך" means it.
      if (!filter.from && !filter.to) return null;
      const from = filter.from || '0000-01-01';
      const to = filter.to || '9999-12-31';
      // Entered backwards? Take what they meant, not what they typed.
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}

/**
 * Case-insensitive, partial, and unbothered by stray spaces.
 *
 * Hebrew has no case, so `toLowerCase` does nothing to a Hebrew name and
 * everything to a Latin one — which is exactly the behaviour wanted from a
 * single field that has to handle both.
 */
export function matchesQuery(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return name.toLowerCase().includes(needle);
}

export function matchesFilter(
  table: FilterableTable,
  filter: TableFilter,
  today: string,
): boolean {
  if (!matchesQuery(table.name, filter.query)) return false;
  if (filter.status !== 'ALL' && table.status !== filter.status) return false;

  const window = dateWindow(filter, today);
  if (window && (table.gameDate < window.from || table.gameDate > window.to)) return false;

  return true;
}

export function filterTables<T extends FilterableTable>(
  tables: readonly T[],
  filter: TableFilter,
  today: string,
): T[] {
  return tables.filter((table) => matchesFilter(table, filter, today));
}

/** How many filters are narrowing the list, for the badge on the filter button. */
export function activeFilterCount(filter: TableFilter): number {
  let count = 0;
  if (filter.query.trim()) count += 1;
  if (filter.status !== 'ALL') count += 1;
  if (filter.date !== 'ALL' && dateWindow(filter, localToday()) !== null) count += 1;
  return count;
}

export function isFiltering(filter: TableFilter): boolean {
  return activeFilterCount(filter) > 0;
}
