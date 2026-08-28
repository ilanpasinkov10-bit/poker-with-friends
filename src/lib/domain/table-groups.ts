/**
 * "השולחנות שלי", in the order a poker night actually happens.
 *
 * One list of tables comes back from one query; this decides which section
 * each belongs to and how the section is ordered. A section with nothing in it
 * is not a section — five headings over an empty screen say less than one
 * empty state does.
 *
 * The statuses are the lifecycle's own — the `table_status` enum from
 * migration 0001 — not a second vocabulary invented for this screen. Each of
 * the five maps to exactly one section, so a table can never fall between two
 * of them or appear in both.
 *
 * Pure: no React, no Supabase, no clock.
 */

import type { PokerTableRow, TableStatus } from '@/types/database';

/** Top to bottom, the way a game moves through its life. */
export const GROUP_ORDER: readonly TableStatus[] = [
  'WAITING',
  'ACTIVE',
  'COUNTING',
  'COMPLETED',
  'CANCELLED',
] as const;

export const GROUP_TITLE: Record<TableStatus, string> = {
  WAITING: 'ממתין להתחלה',
  ACTIVE: 'שולחנות פעילים',
  COUNTING: 'ספירת ז׳יטונים',
  COMPLETED: 'משחקים שהסתיימו',
  CANCELLED: 'משחקים שבוטלו',
};

export interface TableGroup<T> {
  status: TableStatus;
  title: string;
  items: T[];
}

/**
 * When a table last did the thing its section is about.
 *
 * Each status is sorted by the moment that matters for *it*, because
 * "recent" means a different column in each case. A game that finished at
 * midnight belongs above one that finished at eight, whatever either was
 * scheduled for.
 *
 *   WAITING    planned_start_at — nothing has happened yet, so the only real
 *              fact about it is when it is meant to; and it is what the card
 *              itself shows and what the query already orders by.
 *   ACTIVE     started_at — when play actually began.
 *   COUNTING   counting_started_at — when counting began.
 *   COMPLETED  completed_at — when the results were frozen.
 *   CANCELLED  updated_at. There is no cancelled_at column and this does not
 *              invent one: cancelling is the last write a cancelled table
 *              receives, so its updated_at is the moment it was called off.
 *
 * Every one falls back through what is definitely set, so a row with a missing
 * timestamp sorts somewhere sensible instead of vanishing to the end.
 */
export function sortKey(table: PokerTableRow): number {
  const at = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  };
  const fallback = at(table.planned_start_at) ?? at(table.created_at) ?? 0;

  switch (table.status) {
    case 'WAITING':
      return fallback;
    case 'ACTIVE':
      return at(table.started_at) ?? fallback;
    case 'COUNTING':
      return at(table.counting_started_at) ?? at(table.started_at) ?? fallback;
    case 'COMPLETED':
      return at(table.completed_at) ?? fallback;
    case 'CANCELLED':
      return at(table.updated_at) ?? fallback;
    default:
      return fallback;
  }
}

/**
 * Splits a list into its sections, newest first inside each, dropping any
 * section that ends up empty.
 *
 * Takes whatever the caller has already filtered, so search and the status and
 * date filters run first and the grouping simply describes what survived.
 */
export function groupTables<T extends { table: PokerTableRow }>(
  items: readonly T[],
): TableGroup<T>[] {
  const byStatus = new Map<TableStatus, T[]>();
  for (const item of items) {
    const list = byStatus.get(item.table.status);
    if (list) list.push(item);
    else byStatus.set(item.table.status, [item]);
  }

  const groups: TableGroup<T>[] = [];
  for (const status of GROUP_ORDER) {
    const found = byStatus.get(status);
    if (!found || found.length === 0) continue;
    groups.push({
      status,
      title: GROUP_TITLE[status],
      items: [...found].sort((a, b) => {
        const difference = sortKey(b.table) - sortKey(a.table);
        // A stable tie-break, so two games scheduled for the same minute do not
        // swap places between renders.
        return difference !== 0 ? difference : a.table.id.localeCompare(b.table.id);
      }),
    });
  }
  return groups;
}

/** Whether a game is over, and may therefore be taken off one person's list. */
export function canHideTable(status: TableStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}
