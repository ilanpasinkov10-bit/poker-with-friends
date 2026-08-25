'use client';

import { useTransition } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { formatTime } from '@/lib/format';
import { buyInsWord } from '@/lib/labels';
import type { PendingRequestView, PlayerView } from '@/lib/data/table';
import { resolveJoinRequestAction } from '@/lib/actions/players';
import { resolveRebuyRequestAction } from '@/lib/actions/buyins';

/** Players waiting for the admin to let them into the table. */
export function PendingJoinRequests({
  tableId,
  players,
}: {
  tableId: string;
  players: PlayerView[];
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  if (players.length === 0) return null;

  const resolve = (playerId: string, approve: boolean) =>
    startTransition(async () => {
      const result = await resolveJoinRequestAction(tableId, playerId, approve);
      if (!result.ok) toast.error(result.message);
      else toast.success(approve ? 'השחקן צורף לשולחן' : 'הבקשה נדחתה');
    });

  return (
    <section>
      <SectionTitle>בקשות הצטרפות</SectionTitle>
      <ul className="grid gap-2">
        {players.map((player) => (
          <Card as="li" key={player.id} className="flex items-center gap-3 border-warn/30">
            <Avatar name={player.displayName} src={player.avatarUrl} />
            <p className="min-w-0 flex-1 text-sm font-semibold text-ink">
              <span className="truncate">{player.displayName}</span> רוצה להצטרף לשולחן
            </p>
            <Actions
              disabled={pending}
              onApprove={() => resolve(player.id, true)}
              onReject={() => resolve(player.id, false)}
            />
          </Card>
        ))}
      </ul>
    </section>
  );
}

/** Rebuy requests awaiting approval. Approving twice is a no-op server-side. */
export function PendingRebuyRequests({
  tableId,
  requests,
  maxBuyIns,
}: {
  tableId: string;
  requests: PendingRequestView[];
  maxBuyIns: number;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  if (requests.length === 0) return null;

  const resolve = (requestId: string, approve: boolean) =>
    startTransition(async () => {
      const result = await resolveRebuyRequestAction(tableId, requestId, approve);
      if (!result.ok) toast.error(result.message);
      else toast.success(approve ? 'הכניסה אושרה' : 'הבקשה נדחתה');
    });

  return (
    <section>
      <SectionTitle>בקשות לכניסה נוספת</SectionTitle>
      <ul className="grid gap-2">
        {requests.map((request) => (
          <Card as="li" key={request.id} className="flex items-center gap-3 border-brand/40">
            <Avatar name={request.displayName} src={request.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {request.displayName} מבקש כניסה נוספת
              </p>
              <p className="text-[0.7rem] text-ink-faint">
                {buyInsWord(request.buyInCount)} מתוך <Num>{maxBuyIns}</Num> ·{' '}
                <Num>{formatTime(request.requestedAt)}</Num>
              </p>
            </div>
            <Actions
              disabled={pending}
              onApprove={() => resolve(request.id, true)}
              onReject={() => resolve(request.id, false)}
            />
          </Card>
        ))}
      </ul>
    </section>
  );
}

function Actions({
  disabled,
  onApprove,
  onReject,
}: {
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className="h-10 rounded-xl border border-loss/30 bg-loss/10 px-3 text-sm font-bold text-loss disabled:opacity-50"
      >
        דחה
      </button>
      <button
        type="button"
        onClick={onApprove}
        disabled={disabled}
        className="h-10 rounded-xl bg-profit px-4 text-sm font-bold text-on-profit disabled:opacity-50"
      >
        אשר
      </button>
    </div>
  );
}
