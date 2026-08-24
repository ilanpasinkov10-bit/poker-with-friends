import type { PlayerStatus, TableStatus } from '@/types/database';

/**
 * Pure authorization rules, shared by the UI so that controls appear only when
 * the action would actually succeed.
 *
 * These are a *mirror*, not the enforcement point: every rule here is enforced
 * again inside the SECURITY DEFINER database functions, under a row lock. If
 * the two ever disagree, the database wins.
 */

export interface ActorContext {
  userId: string;
  /** Owner of the table — the only source of admin rights. */
  isTableAdmin: boolean;
}

export interface PlayerContext {
  tablePlayerId: string;
  ownerUserId: string | null;
  status: PlayerStatus;
  buyInCount: number;
}

export interface TableContext {
  status: TableStatus;
  maxBuyIns: number;
}

export const isGameOpenForBuyIns = (status: TableStatus): boolean =>
  status === 'WAITING' || status === 'ACTIVE';

export function canRequestRebuy(
  actor: ActorContext,
  player: PlayerContext,
  table: TableContext,
  hasPendingRequest: boolean,
): boolean {
  if (player.ownerUserId !== actor.userId) return false;
  if (player.status !== 'ACTIVE') return false;
  if (!isGameOpenForBuyIns(table.status)) return false;
  if (hasPendingRequest) return false;
  return player.buyInCount < table.maxBuyIns;
}

/**
 * A player may never approve their own request, even when that player happens
 * to also be the table admin sitting in the game.
 */
export function canApproveRebuy(
  actor: ActorContext,
  requester: PlayerContext,
  table: TableContext,
): boolean {
  if (!actor.isTableAdmin) return false;
  if (!isGameOpenForBuyIns(table.status)) return false;
  return requester.buyInCount < table.maxBuyIns;
}

export function canAdminAddBuyIn(
  actor: ActorContext,
  player: PlayerContext,
  table: TableContext,
): boolean {
  if (!actor.isTableAdmin) return false;
  if (player.status !== 'ACTIVE') return false;
  if (!isGameOpenForBuyIns(table.status)) return false;
  return player.buyInCount < table.maxBuyIns;
}

const ALLOWED_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  WAITING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COUNTING', 'CANCELLED'],
  // COMPLETED is reachable only through finalize_game(), never a plain status set.
  COUNTING: ['ACTIVE'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(actor: ActorContext, from: TableStatus, to: TableStatus): boolean {
  if (!actor.isTableAdmin) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface FinalizeReadiness {
  ready: boolean;
  reason: 'NOT_ADMIN' | 'WRONG_STATUS' | 'NO_PLAYERS' | 'MISSING_COUNTS' | 'AWAITING_APPROVAL' | 'CHIP_MISMATCH' | null;
}

export function finalizeReadiness(
  actor: ActorContext,
  table: TableContext,
  players: readonly { chipsIssued: number; submittedChips: number | null; approvedChips: number | null }[],
): FinalizeReadiness {
  if (!actor.isTableAdmin) return { ready: false, reason: 'NOT_ADMIN' };
  if (table.status !== 'COUNTING') return { ready: false, reason: 'WRONG_STATUS' };
  if (players.length === 0) return { ready: false, reason: 'NO_PLAYERS' };

  if (players.some((p) => p.approvedChips === null && p.submittedChips === null)) {
    return { ready: false, reason: 'MISSING_COUNTS' };
  }
  if (players.some((p) => p.approvedChips === null)) {
    return { ready: false, reason: 'AWAITING_APPROVAL' };
  }

  const issued = players.reduce((sum, p) => sum + p.chipsIssued, 0);
  const counted = players.reduce((sum, p) => sum + (p.approvedChips ?? 0), 0);
  if (issued !== counted) return { ready: false, reason: 'CHIP_MISMATCH' };

  return { ready: true, reason: null };
}

export const FINALIZE_BLOCKED_MESSAGE: Record<NonNullable<FinalizeReadiness['reason']>, string> = {
  NOT_ADMIN: 'רק מנהל השולחן יכול לסיים את המשחק',
  WRONG_STATUS: 'צריך לעבור לשלב ספירת הז׳יטונים',
  NO_PLAYERS: 'אין שחקנים בשולחן',
  MISSING_COUNTS: 'לא ניתן לסיים את המשחק לפני שכל השחקנים הזינו ספירה',
  AWAITING_APPROVAL: 'צריך לאשר את כל הספירות שהוזנו',
  CHIP_MISMATCH: 'יש חוסר התאמה בספירת הז׳יטונים',
};
