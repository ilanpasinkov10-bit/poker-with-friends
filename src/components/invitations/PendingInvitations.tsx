'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { respondToInvitationAction } from '@/lib/actions/invitations';
import { relativeDayLabel, type PendingInvitationView } from '@/lib/domain/invitations';
import { formatDate, formatMoney, formatTime } from '@/lib/format';

/**
 * "הוזמנת למשחק" — the invitations waiting on the home screen.
 *
 * The rows are read by the server and passed in; this component exists for the
 * two buttons and for the refresh below. It renders nothing at all when there
 * is nothing waiting, so the home screen gains no heading, no spacing and no
 * empty state on the days — most of them — when nobody has been invited to
 * anything.
 *
 * An answered row disappears immediately rather than waiting for the server, so
 * a slow network cannot leave a button that has already been pressed looking
 * untouched. The refresh that follows is what makes the rest of the screen
 * agree.
 */
export function PendingInvitations({
  invitations,
  today,
}: {
  invitations: PendingInvitationView[];
  /** Today in Israel, decided on the server so every viewer agrees. */
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = invitations.filter((invitation) => !answered.has(invitation.id));
  if (visible.length === 0) return null;

  const respond = (invitation: PendingInvitationView, accept: boolean) => {
    setBusy(invitation.id);
    startTransition(async () => {
      const result = await respondToInvitationAction(invitation.id, accept);
      setBusy(null);
      if (!result.ok) {
        toast.error(result.message);
        // Answered on another device, or the game ended while this card sat
        // here. Either way the server knows better than this list does.
        router.refresh();
        return;
      }
      setAnswered((previous) => new Set(previous).add(invitation.id));
      if (accept && result.data.tableId) {
        router.push(`/table/${result.data.tableId}`);
        return;
      }
      toast.success('ההזמנה נדחתה');
      router.refresh();
    });
  };

  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink">
        <span aria-hidden>🎲</span> הוזמנת למשחק
      </h2>
      <ul className="grid gap-2">
        {visible.map((invitation) => {
          const day = relativeDayLabel(invitation.gameDate, today) ?? formatDate(invitation.gameDate);
          return (
            <li
              key={invitation.id}
              className="card-grad rounded-2xl border border-brand/30 bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar name={invitation.inviterName} src={invitation.inviterAvatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-ink">{invitation.tableName}</p>
                  <p className="truncate text-sm text-ink-muted">
                    {invitation.inviterName} הזמין אותך
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {day} · <Num>{formatTime(invitation.plannedStartAt)}</Num> · כניסה{' '}
                    <Num>{formatMoney(invitation.buyInAgorot)}</Num>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  loading={busy === invitation.id}
                  onClick={() => respond(invitation, true)}
                  aria-label={`הצטרפות לשולחן ${invitation.tableName}`}
                >
                  הצטרפות
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  disabled={busy === invitation.id}
                  onClick={() => respond(invitation, false)}
                  aria-label={`דחיית ההזמנה לשולחן ${invitation.tableName}`}
                >
                  דחייה
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
