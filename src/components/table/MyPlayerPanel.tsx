'use client';

import { useTransition } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { formatChips, formatMoney } from '@/lib/format';
import { buyInsWord } from '@/lib/labels';
import { canRequestRebuy, isGameOpenForBuyIns } from '@/lib/domain/permissions';
import { cancelRebuyRequestAction, requestRebuyAction } from '@/lib/actions/buyins';
import type { TableViewModel } from '@/lib/data/table';

/** The player's own card — their money, their chips, their one action. */
export function MyPlayerPanel({ model }: { model: TableViewModel }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const { table, viewer } = model;
  const player = viewer.player;
  if (!player) return null;

  const hasPendingRequest = viewer.myPendingRequestId !== null;
  const gameOpen = isGameOpenForBuyIns(table.status);
  const atMax = player.buyInCount >= table.max_buy_ins;
  const mayRequest = canRequestRebuy(
    { userId: viewer.userId, isTableAdmin: viewer.isAdmin },
    {
      tablePlayerId: player.id,
      ownerUserId: player.userId,
      status: player.status,
      buyInCount: player.buyInCount,
    },
    { status: table.status, maxBuyIns: table.max_buy_ins },
    hasPendingRequest,
  );

  const request = () =>
    startTransition(async () => {
      const result = await requestRebuyAction(table.id, player.id);
      if (!result.ok) toast.error(result.message);
      else toast.success('הבקשה נשלחה למנהל השולחן');
    });

  const cancel = () =>
    startTransition(async () => {
      if (!viewer.myPendingRequestId) return;
      const result = await cancelRebuyRequestAction(table.id, viewer.myPendingRequestId);
      if (!result.ok) toast.error(result.message);
      else toast.success('הבקשה בוטלה');
    });

  return (
    <Card className="card-grad">
      <div className="flex items-center gap-3">
        <Avatar name={player.displayName} src={player.avatarUrl} size="lg" ring />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-lg font-black text-ink">{player.displayName}</p>
            {viewer.isAnonymous ? <Badge tone="neutral">אורח</Badge> : null}
          </div>
          {player.status === 'PENDING' ? (
            <Badge tone="warn" className="mt-1">
              ממתין לאישור מנהל השולחן
            </Badge>
          ) : (
            <p className="text-xs text-ink-faint">
              {buyInsWord(player.buyInCount)} מתוך <Num>{table.max_buy_ins}</Num>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Cell label="כניסות" value={<Num>{player.buyInCount}</Num>} />
        <Cell label="השקעה" value={<Num>{formatMoney(player.totalPaidAgorot)}</Num>} />
        <Cell label="ז׳יטונים" value={<Num>{formatChips(player.chipsIssued)}</Num>} />
      </div>

      {player.status === 'ACTIVE' && gameOpen ? (
        <div className="mt-4">
          {hasPendingRequest ? (
            <div className="rounded-xl border border-warn/30 bg-warn-soft p-3 text-center">
              <p className="text-sm font-semibold text-warn">הבקשה שלך ממתינה לאישור</p>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="mt-2 text-xs font-semibold text-ink-muted underline disabled:opacity-50"
              >
                ביטול הבקשה
              </button>
            </div>
          ) : atMax ? (
            <p className="rounded-xl border border-line bg-surface-2 p-3 text-center text-sm font-semibold text-warn">
              הגעת למספר הכניסות המקסימלי
            </p>
          ) : mayRequest ? (
            <Button size="lg" block loading={pending} onClick={request}>
              בקש כניסה נוספת
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5">
      <p className="text-[0.65rem] text-ink-faint">{label}</p>
      <p className="mt-0.5 text-base font-bold text-ink">{value}</p>
    </div>
  );
}
