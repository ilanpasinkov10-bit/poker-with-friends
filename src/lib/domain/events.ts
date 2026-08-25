/**
 * What happened at a table, and what to say about it.
 *
 * One vocabulary drives three things that must not drift apart: the Hebrew
 * push notification, the sound the open app plays, and the line in the live
 * pot's recent-activity list. Keeping them in one pure module means a wording
 * change lands everywhere at once, and means all of it is testable without a
 * browser, a push service or a database.
 *
 * Money is in agorot and chips are whole chips, exactly as everywhere else —
 * these builders format, they never convert. The cash value of a leaver's
 * stack is computed once by `summariseCashOut` and passed in.
 */

import { formatChips, formatMoney } from '@/lib/format';

export const TABLE_EVENT_KINDS = [
  'PLAYER_JOINED',
  'PLAYER_LEFT',
  'BUY_IN',
  'GAME_STARTED',
  'ENDING_SOON',
  'GAME_ENDED',
] as const;

export type TableEventKind = (typeof TABLE_EVENT_KINDS)[number];

export type TableEvent =
  | { kind: 'PLAYER_JOINED'; at: string; playerName: string }
  | {
      kind: 'PLAYER_LEFT';
      at: string;
      playerName: string;
      /** The approved count the leave transaction stored. */
      finalChips: number;
      /** Its cash value, from the same conversion the settlement uses. */
      finalValueAgorot: number;
    }
  | {
      kind: 'BUY_IN';
      at: string;
      playerName: string;
      amountAgorot: number;
      chips: number;
    }
  | { kind: 'GAME_STARTED'; at: string; tableName: string }
  | { kind: 'ENDING_SOON'; at: string; tableName: string }
  | { kind: 'GAME_ENDED'; at: string; tableName: string };

export interface NotificationCopy {
  title: string;
  body: string;
}

/**
 * The Hebrew a player sees on their lock screen.
 *
 * The title carries the table name so a player in two games can tell them
 * apart at a glance; the body is the sentence from the spec.
 */
export function notificationCopy(event: TableEvent, tableName: string): NotificationCopy {
  return { title: tableName, body: eventSentence(event) };
}

/** The same sentence, used in the notification body and the activity list. */
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
    case 'GAME_STARTED':
      return 'המשחק התחיל — בהצלחה!';
    case 'ENDING_SOON':
      return 'שעה אחרונה למשחק — זה הזמן להתארגן לספירה';
    case 'GAME_ENDED':
      return 'המשחק הסתיים — ההתחשבנות מוכנה';
  }
}

/** A short label for the activity list, where the sentence would be too long. */
export const EVENT_ICON: Record<TableEventKind, string> = {
  PLAYER_JOINED: '🪑',
  PLAYER_LEFT: '👋',
  BUY_IN: '🪙',
  GAME_STARTED: '🃏',
  ENDING_SOON: '⏳',
  GAME_ENDED: '🏁',
};

/**
 * Newest first, and capped.
 *
 * Ties are broken by kind so the order is stable between renders — two events
 * can share a timestamp when a join and its opening buy-in land in the same
 * transaction, and a list that reshuffles on every realtime refresh reads as
 * broken.
 */
export function sortEvents(events: readonly TableEvent[], limit = 8): TableEvent[] {
  return [...events]
    .sort((a, b) => {
      const byTime = Date.parse(b.at) - Date.parse(a.at);
      if (byTime !== 0) return byTime;
      return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
    })
    .slice(0, limit);
}
