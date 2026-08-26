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

/**
 * One layout for both request cards.
 *
 * A request is a name, what they are asking for, and two buttons — and on a
 * 320px phone those three do not fit on one line. Wrapping is what gives:
 * `flex-wrap` with a basis on the middle column keeps the avatar, the name and
 * the buttons on one row wherever there is room, and drops the buttons onto a
 * row of their own where there is not, rather than truncating a Hebrew name to
 * three letters or pushing the approve button past the edge of the screen.
 *
 * `basis-40` is the wrap threshold, not a device width: below roughly ten
 * characters of legible text the row has stopped being worth keeping together.
 */
const REQUEST_CARD = 'flex flex-wrap items-center gap-x-3 gap-y-2';
const REQUEST_BODY = 'min-w-0 flex-1 basis-40';

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
          <Card as="li" key={player.id} className={REQUEST_CARD + ' border-warn/30'}>
            <Avatar name={player.displayName} src={player.avatarUrl} />
            <p className={REQUEST_BODY + ' text-sm font-semibold text-ink'}>
              {player.displayName} רוצה להצטרף לשולחן
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
          <Card as="li" key={request.id} className={REQUEST_CARD + ' border-brand/40'}>
            <Avatar name={request.displayName} src={request.avatarUrl} />
            <div className={REQUEST_BODY}>
              <p className="text-sm font-semibold break-words text-ink">
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
    // `ms-auto` so that when the buttons wrap onto their own row they sit at
    // the end of it — the far side from the avatar — instead of drifting under
    // the name.
    <div className="ms-auto flex shrink-0 gap-1.5">
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
