/**
 * What happened at a table, and what to say about it.
 *
 * One vocabulary drives four things that must not drift apart: the Hebrew push
 * notification, the in-app toast, the sound the open app plays, and the line in
 * the activity feed. Keeping them here means a wording change lands everywhere
 * at once, and all of it is testable without a browser, a push service or a
 * database.
 *
 * Money is in agorot and chips are whole chips, exactly as everywhere else —
 * these builders format, they never convert.
 */

import { formatChips, formatMoney } from '@/lib/format';
import type { SoundName } from '@/lib/sound/engine';

export const TABLE_EVENT_KINDS = [
  'PLAYER_JOINED',
  'PLAYER_LEFT',
  'BUY_IN',
  'BUY_IN_REVERSED',
  'GAME_STARTED',
  'ENDING_SOON',
  'GAME_ENDED',
] as const;

export type TableEventKind = (typeof TABLE_EVENT_KINDS)[number];

/**
 * Fields every event carries.
 *
 * `id` is what makes an event the *same* event across renders. The feed is
 * rebuilt from scratch on every realtime refresh, so without a stable identity
 * there would be no way to tell a new arrival from one already shown, and a
 * toast would repeat on every refresh for as long as the event stayed in the
 * list. It is derived from the row the event came from, so it is stable by
 * construction rather than by luck.
 *
 * `actorUserId` is who performed the action and `subjectUserId` who it is
 * about. Both exist so the app can stay quiet towards the person already
 * looking at their own confirmation.
 */
interface EventBase {
  id: string;
  at: string;
  actorUserId?: string | null;
  subjectUserId?: string | null;
}

export type TableEvent =
  | (EventBase & { kind: 'PLAYER_JOINED'; playerName: string })
  | (EventBase & {
      kind: 'PLAYER_LEFT';
      playerName: string;
      /** The approved count the leave transaction stored. */
      finalChips: number;
      /** Its cash value, from the same conversion the settlement uses. */
      finalValueAgorot: number;
    })
  | (EventBase & {
      kind: 'BUY_IN';
      playerName: string;
      amountAgorot: number;
      chips: number;
    })
  | (EventBase & {
      kind: 'BUY_IN_REVERSED';
      playerName: string;
      /** What went back to the player. Always positive. */
      refundedAgorot: number;
      /** Chips taken off their stack. Always positive. */
      refundedChips: number;
    })
  | (EventBase & { kind: 'GAME_STARTED'; tableName: string })
  | (EventBase & { kind: 'ENDING_SOON'; tableName: string })
  | (EventBase & { kind: 'GAME_ENDED'; tableName: string });

export interface NotificationCopy {
  title: string;
  body: string;
}

/**
 * The Hebrew a player sees on their lock screen.
 *
 * The title carries the table name so a player in two games can tell them
 * apart at a glance; the body is the full sentence.
 */
export function notificationCopy(event: TableEvent, tableName: string): NotificationCopy {
  return { title: tableName, body: eventSentence(event) };
}

/** The full sentence, for the notification body and the activity feed. */
export function eventSentence(event: TableEvent): string {
  switch (event.kind) {
    case 'PLAYER_JOINED':
      return `${event.playerName} הצטרף לשולחן`;
    case 'PLAYER_LEFT':
      return (
        `${event.playerName} עזב את השולחן עם ${formatChips(event.finalChips)} ז׳יטונים ` +
        `(${formatMoney(event.finalValueAgorot)})`
      );
    case 'BUY_IN':
      return (
        `${event.playerName} נכנס בעוד כניסה של ${formatMoney(event.amountAgorot)} ` +
        `וקיבל ${formatChips(event.chips)} ז׳יטונים`
      );
    case 'BUY_IN_REVERSED':
      return (
        `המנהל ביטל את הכניסה האחרונה של ${event.playerName} ` +
        `והחזיר ${formatMoney(event.refundedAgorot)}`
      );
    case 'GAME_STARTED':
      return 'המשחק התחיל — בהצלחה!';
    case 'ENDING_SOON':
      return 'שעה אחרונה למשחק — זה הזמן להתארגן לספירה';
    case 'GAME_ENDED':
      return 'המשחק הסתיים — ההתחשבנות מוכנה';
  }
}

/**
 * The shorter form, for a toast.
 *
 * A toast is glanceable and disappears in a few seconds; the feed line is a
 * record that stays. So the toast drops the chip counts and keeps the money,
 * which is what someone looking up from their cards actually wants to know.
 */
export function eventToast(event: TableEvent): string {
  switch (event.kind) {
    case 'PLAYER_JOINED':
      return `${event.playerName} הצטרף לשולחן`;
    case 'PLAYER_LEFT':
      return `${event.playerName} עזב עם ${formatMoney(event.finalValueAgorot)}`;
    case 'BUY_IN':
      return `${event.playerName} נכנס בעוד ${formatMoney(event.amountAgorot)}`;
    case 'BUY_IN_REVERSED':
      return `המנהל ביטל את הכניסה האחרונה של ${event.playerName}`;
    case 'GAME_STARTED':
      return 'המשחק התחיל';
    case 'ENDING_SOON':
      return 'שעה אחרונה למשחק';
    case 'GAME_ENDED':
      return 'המשחק הסתיים';
  }
}

export const EVENT_ICON: Record<TableEventKind, string> = {
  PLAYER_JOINED: '🪑',
  PLAYER_LEFT: '👋',
  BUY_IN: '🪙',
  BUY_IN_REVERSED: '↩️',
  GAME_STARTED: '🃏',
  ENDING_SOON: '⏳',
  GAME_ENDED: '🏁',
};

/**
 * The cue each event plays, where it has one.
 *
 * A cancelled entry borrows the departure sound rather than the chip rattle:
 * both are money coming off the table, and reusing the rattle would make an
 * undo sound exactly like the thing it undoes. The three events with no cue
 * are the ones that arrive as a notification rather than as movement at the
 * table.
 */
export const EVENT_SOUND: Record<TableEventKind, SoundName | null> = {
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  BUY_IN: 'BUY_IN',
  BUY_IN_REVERSED: 'PLAYER_LEFT',
  GAME_STARTED: 'GAME_STARTED',
  ENDING_SOON: null,
  GAME_ENDED: null,
};

/**
 * Newest first, and capped.
 *
 * Ties are broken by kind and then by id so the order is stable between
 * renders — two events can share a timestamp when a join and its opening
 * buy-in land in the same transaction, and a list that reshuffles on every
 * realtime refresh reads as broken.
 */
export function sortEvents(events: readonly TableEvent[], limit?: number): TableEvent[] {
  const ordered = [...events].sort((a, b) => {
    const byTime = Date.parse(b.at) - Date.parse(a.at);
    if (byTime !== 0) return byTime;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return limit === undefined ? ordered : ordered.slice(0, limit);
}
