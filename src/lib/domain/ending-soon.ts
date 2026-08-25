/**
 * When the "one hour to go" reminder is due.
 *
 * Every other notification is sent by the action that caused it. This one has
 * no action behind it, so something has to notice that a game is approaching
 * its planned finish. That "something" is the app itself: an active table
 * almost always has at least one open client — the admin approving rebuys, if
 * nobody else — and an open client can check cheaply as the end draws near.
 *
 * The window lives here rather than in the checker so that the client deciding
 * *whether to ask* and the server deciding *whether to send* cannot disagree.
 * A client that stopped watching early would silently drop the reminder; one
 * that asked outside the window would just be refused.
 */

/** Send once the finish is this close. */
export const REMINDER_OPENS_MINUTES = 75;

/**
 * Stop sending this close to the end. A reminder that lands with four minutes
 * left is noise — everyone can see the countdown by then.
 */
export const REMINDER_CLOSES_MINUTES = 5;

/**
 * Clients start watching a little before the window opens, so the first check
 * inside it happens promptly rather than up to an interval late.
 */
export const WATCH_OPENS_MINUTES = 95;

/** How often a watching client asks. Deliberately slow: this is not urgent. */
export const CHECK_INTERVAL_MS = 120_000;

export interface ReminderState {
  status: string;
  plannedEndAt: string;
  /** Set once the reminder has gone out. Null means it has not. */
  endingSoonNotifiedAt: string | null;
}

/**
 * Whether the reminder should go out right now.
 *
 * This is the guard, not the authority — the database claim is, and it is what
 * makes the send exactly-once under concurrency. Several players' phones can
 * reach this at the same moment and all agree it is due; only one of them will
 * win the claim.
 */
export function isReminderDue(table: ReminderState, now: number = Date.now()): boolean {
  if (table.status !== 'ACTIVE') return false;
  if (table.endingSoonNotifiedAt !== null) return false;

  const remainingMs = Date.parse(table.plannedEndAt) - now;
  if (!Number.isFinite(remainingMs)) return false;

  return (
    remainingMs > REMINDER_CLOSES_MINUTES * 60_000 &&
    remainingMs <= REMINDER_OPENS_MINUTES * 60_000
  );
}

/**
 * Whether an open client should be checking at all.
 *
 * Deliberately wider than the send window and false the rest of the time, so a
 * table with hours left costs nothing: no timer, no requests.
 */
export function shouldWatchForReminder(table: ReminderState, now: number = Date.now()): boolean {
  if (table.status !== 'ACTIVE') return false;
  if (table.endingSoonNotifiedAt !== null) return false;

  const remainingMs = Date.parse(table.plannedEndAt) - now;
  if (!Number.isFinite(remainingMs)) return false;

  return (
    remainingMs > REMINDER_CLOSES_MINUTES * 60_000 &&
    remainingMs <= WATCH_OPENS_MINUTES * 60_000
  );
}
