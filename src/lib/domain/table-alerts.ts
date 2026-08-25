/**
 * Deciding what to announce when the table changes under the player's eyes.
 *
 * Realtime already rebuilds the whole screen from the server on every change,
 * so the events that just happened are exactly the ones that appeared in the
 * activity feed since the last render. Diffing the feed — rather than
 * comparing player counts and totals — means the announcement carries the same
 * names and figures the feed shows, and a toast can never describe something
 * the list beside it does not.
 *
 * Pure, so every rule below is testable without a browser, an audio device or
 * a timer.
 */

import type { TableEvent } from './events';

export interface AlertSnapshot {
  status: string;
  /** The activity feed as the server just built it. Newest first. */
  events: readonly TableEvent[];
}

/**
 * The events to announce, oldest first so a burst is heard in the order it
 * happened.
 *
 * Two things are deliberately silent.
 *
 * The first render announces nothing. Opening a table that already has six
 * players and twenty entries would otherwise fire every toast and every sound
 * at once.
 *
 * Nothing is announced to the person who caused it. They are already looking
 * at the confirmation their own action produced — the admin who cancelled an
 * entry sees "הכניסה בוטלה" — and a second toast saying the same thing is the
 * duplicate this is meant to avoid. The same rule covers the subject: nobody
 * needs telling that they themselves joined or left.
 */
export function alertsForChange(
  before: AlertSnapshot | null,
  after: AlertSnapshot,
  viewerUserId: string | null,
): TableEvent[] {
  if (!before) return [];

  const known = new Set(before.events.map((event) => event.id));
  const fresh = after.events.filter((event) => !known.has(event.id));

  // Dealing beginning is a change of state rather than a feed entry, so it has
  // no row to derive an id from and is synthesised here.
  if (before.status !== 'ACTIVE' && after.status === 'ACTIVE') {
    fresh.push({
      id: 'game-started',
      kind: 'GAME_STARTED',
      at: new Date().toISOString(),
      tableName: '',
    });
  }

  return fresh
    .filter((event) => !concernsViewer(event, viewerUserId))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function concernsViewer(event: TableEvent, viewerUserId: string | null): boolean {
  if (!viewerUserId) return false;
  return event.actorUserId === viewerUserId || event.subjectUserId === viewerUserId;
}
