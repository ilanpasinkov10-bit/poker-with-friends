'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { respondToInvitationAction } from '@/lib/actions/invitations';
import { formatDate, formatMoney } from '@/lib/format';
import type { PendingInvitationView } from '@/lib/domain/invitations';

/**
 * "הזמינו אותך לשולחן" — the invitations waiting on the home screen.
 *
 * The rows are rendered by the server and passed in; this component exists
 * only for the two buttons. It opens no socket and starts no polling: an
 * invitation is a rare event announced by a push notification, and the card is
 * re-read on the next visit to this screen — which is the visit the
 * notification leads to. A permanent connection per person, kept open all day
 * for something that happens twice a week, would be the wrong trade.
 *
 * An answered row disappears immediately rather than waiting for the refresh,
 * so a slow network cannot leave a button that has already been pressed
 * looking untouched.
 */
export function PendingInvitations({ invitations }: { invitations: PendingInvitationView[] }) {
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
        // The invitation may have been answered elsewhere, or the game may
        // have ended. Either way the server knows better than this list does.
        router.refresh();
        return;
      }
      setAnswered((previous) => new Set(previous).add(invitation.id));
      if (accept && result.data.tableId) {
        toast.success(`הצטרפת לשולחן "${invitation.tableName}"`);
        router.push(`/table/${result.data.tableId}`);
        return;
      }
      toast.success('ההזמנה נדחתה');
      router.refresh();
    });
  };

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-bold text-ink">הזמינו אותך לשולחן</h2>
      <ul className="grid gap-2">
        {visible.map((invitation) => (
          <li
            key={invitation.id}
            className="rounded-2xl border border-brand/30 bg-surface p-4"
          >
            <div className="flex items-center gap-3">
              <Avatar name={invitation.inviterName} src={invitation.inviterAvatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{invitation.tableName}</p>
                <p className="text-xs text-ink-faint">
                  {invitation.inviterName} · {formatDate(invitation.gameDate)} · כניסה{' '}
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
                הצטרף
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                disabled={busy === invitation.id}
                onClick={() => respond(invitation, false)}
                aria-label={`דחיית ההזמנה לשולחן ${invitation.tableName}`}
              >
                דחה
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
