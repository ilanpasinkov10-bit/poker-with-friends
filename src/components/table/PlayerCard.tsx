'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { formatChips, formatMoney } from '@/lib/format';
import { buyInsWord } from '@/lib/labels';
import type { PlayerView } from '@/lib/data/table';

export function PlayerCard({
  player,
  showMoney,
  isMe,
  maxBuyIns,
  actions,
  footer,
  onOpenProfile,
}: {
  player: PlayerView;
  showMoney: boolean;
  isMe: boolean;
  maxBuyIns: number;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  onOpenProfile?: (userId: string) => void;
}) {
  const maxedOut = player.buyInCount >= maxBuyIns;

  return (
    <li
      className={cn(
        'rounded-2xl border bg-surface p-3.5',
        isMe ? 'border-brand/40 bg-brand-soft/20' : 'border-line-soft',
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={player.displayName} src={player.avatarUrl} ring={isMe} />

        <ProfileTrigger player={player} onOpenProfile={onOpenProfile}>
          <div className="flex items-center gap-2">
            <p className="truncate font-bold text-ink">{player.displayName}</p>
            {player.isGuest ? (
              <Badge tone="neutral" className="px-2 py-0.5 text-[0.65rem]">
                אורח
              </Badge>
            ) : null}
            {player.isAdmin ? (
              <Badge tone="brand" className="px-2 py-0.5 text-[0.65rem]">
                מנהל שולחן
              </Badge>
            ) : null}
            {isMe ? <span className="text-xs text-brand-ink">(אני)</span> : null}
          </div>

          {showMoney ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-faint">
              <span>
                {buyInsWord(player.buyInCount)}
              </span>
              <span aria-hidden>·</span>
              <span>
                <Num>{formatMoney(player.totalPaidAgorot)}</Num> השקעה
              </span>
              <span aria-hidden>·</span>
              <span>
                <Num>{formatChips(player.chipsIssued)}</Num> ז׳יטונים
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-faint">הנתונים הכספיים מוצגים למנהל השולחן בלבד</p>
          )}

          {showMoney && maxedOut ? (
            <p className="mt-1 text-[0.7rem] font-semibold text-warn">הגיע למקסימום הכניסות</p>
          ) : null}
        </ProfileTrigger>

        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>

      {footer ? <div className="mt-3 border-t border-line-soft pt-3">{footer}</div> : null}
    </li>
  );
}

/**
 * The name block opens the player's profile when a handler is supplied and the
 * player has an identity to look up. Falls back to plain markup otherwise, so
 * the card never renders a button that would do nothing.
 */
function ProfileTrigger({
  player,
  onOpenProfile,
  children,
}: {
  player: PlayerView;
  onOpenProfile?: (userId: string) => void;
  children: React.ReactNode;
}) {
  if (!onOpenProfile || !player.userId) {
    return <div className="min-w-0 flex-1">{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpenProfile(player.userId!)}
      aria-label={`הצג את הפרופיל של ${player.displayName}`}
      className="min-w-0 flex-1 rounded-lg text-start focus-visible:outline-2 focus-visible:outline-brand"
    >
      {children}
    </button>
  );
}
