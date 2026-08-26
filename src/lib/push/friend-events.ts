import 'server-only';

import { siteUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { notifyUsers } from './send';

/**
 * The two friend notifications, on the same rails as the table ones.
 *
 * There is no second notification system here: this builds a title and a body
 * and hands them to `notifyUsers`, which is the same code path a buy-in takes
 * — same per-user switch, same subscription table, same pruning of dead
 * endpoints, same swallowing of failures so a notification can never fail the
 * action that triggered it.
 *
 * Only two moments are worth a phone buzzing, and each is sent once:
 *
 *   · A request arrives. The recipient has something to do about it.
 *   · A request is accepted. The sender asked and is owed the answer.
 *
 * A *decline* deliberately sends nothing. Being turned down is not news
 * anybody needs pushed to their lock screen, and staying quiet is also what
 * keeps the refusal private.
 *
 * Duplicates are prevented at two levels. Each helper is called from exactly
 * one place — the action that performed the state transition, and only when
 * the database reports that the transition actually happened — so a repeated
 * tap that the database refuses sends nothing. And the `tag` collapses any
 * two messages about the same pair in the tray.
 */

async function nameOf(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  return data?.display_name ?? null;
}

/** "{name} שלח לך בקשת חברות" */
export async function notifyFriendRequest(senderId: string, recipientId: string) {
  const name = await nameOf(senderId);
  if (!name) return;

  await notifyUsers({
    recipientIds: [recipientId],
    title: 'בקשת חברות',
    body: `${name} שלח לך בקשת חברות`,
    kind: 'FRIEND_REQUEST',
    url: `${siteUrl()}/profile/friends`,
    // One pending request per pair can exist, so one line in the tray per pair
    // is exactly right.
    tag: `friend-request-${senderId}`,
  });
}

/** "{name} אישר/ה את בקשת החברות" */
export async function notifyFriendAccepted(accepterId: string, senderId: string) {
  const name = await nameOf(accepterId);
  if (!name) return;

  await notifyUsers({
    recipientIds: [senderId],
    title: 'בקשת חברות',
    body: `${name} אישר/ה את בקשת החברות`,
    kind: 'FRIEND_ACCEPTED',
    url: `${siteUrl()}/profile/friends`,
    tag: `friend-accepted-${accepterId}`,
  });
}
