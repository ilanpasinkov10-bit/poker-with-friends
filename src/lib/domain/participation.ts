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
