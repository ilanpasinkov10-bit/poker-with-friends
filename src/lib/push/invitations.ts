import 'server-only';

import { siteUrl } from '@/lib/env';
import { notifyUsers } from './send';

/**
 * The one invitation notification, on the same rails as the friend ones.
 *
 * No second notification system: this builds a title and a body and hands them
 * to `notifyUsers` — the same per-user switch, the same subscription table, the
 * same pruning of dead endpoints, and the same swallowing of failures, so a
 * notification can never fail the invitation that triggered it.
 *
 * Only the invitation itself is pushed. An *answer* is not: the admin is
 * looking at the table, where the person either appears or does not, and a
 * buzz for every friend who said no would be both noise and unkind. This
 * mirrors the friend system, which announces a request and an acceptance and
 * stays silent about a decline.
 *
 * It is called from exactly one place — after the database has confirmed a new
 * invitation was written — so a repeated tap, which returns the invitation
 * that already existed, sends nothing. The `tag` collapses any two messages
 * about the same table for the same person into one line in the tray.
 */
export async function notifyTableInvitation({
  inviteeId,
  inviterName,
  tableId,
  tableName,
}: {
  inviteeId: string;
  inviterName: string;
  tableId: string;
  tableName: string;
}) {
  await notifyUsers({
    recipientIds: [inviteeId],
    title: '🃏 הזמנה לשולחן',
    body: `${inviterName} הזמין אותך לשולחן "${tableName}"`,
    kind: 'TABLE_INVITATION',
    // The home screen, where the invitation card is — not the table itself,
    // which they cannot see until they have accepted.
    url: siteUrl(),
    tag: `table-invitation-${tableId}`,
  });
}
