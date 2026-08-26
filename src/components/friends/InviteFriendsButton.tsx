'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { joinUrl } from '@/lib/domain/join-link';
import { sortFriends, type FriendSummary } from '@/lib/domain/friends';
import { listFriendsAction } from '@/lib/actions/friends';

/**
 * "הזמן חברים" — the admin's friends, and the table's existing join link.
 *
 * This is deliberately not an in-app invitation. It reuses the join URL that
 * the share button, the QR code and a pasted code all resolve to, so there is
 * still exactly one way into a table, with one set of approval rules. Picking
 * a friend here opens the phone's own share sheet with that link and the
 * friend's name in the message; where the share sheet is unavailable, the link
 * is copied instead.
 *
 * What a *real* in-app invitation would need is written up in the PR: a
 * table_invitations table, a notification type, and an accept path that joins
 * the table directly rather than going through /join. Building that now would
 * be a second way into a table before there is any evidence it is wanted.
 */
export function InviteFriendsButton({
  tableName,
  joinCode,
}: {
  tableName: string;
  joinCode: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);

  // Resolved on the client, where the origin is known — the same way every
  // other share in this app builds its address.
  const [shareUrl] = useState(() =>
    joinUrl(typeof window === 'undefined' ? null : window.location.origin, joinCode),
  );

  useEffect(() => {
    if (!open || friends !== null) return;
    let cancelled = false;
    void listFriendsAction().then((result) => {
      if (cancelled) return;
      setFriends(result.ok ? sortFriends(result.data) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, friends]);

  const invite = async (friend: FriendSummary) => {
    const text = `${friend.displayName}, מזמין אותך לשולחן "${tableName}"`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: tableName, text, url: shareUrl });
        return;
      } catch {
        // The share sheet was dismissed. Nothing to report — and nothing to
        // fall back to, because the player has already seen their options.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      toast.success(`ההזמנה ל${friend.displayName} הועתקה`);
    } catch {
      toast.error('לא הצלחנו להעתיק את ההזמנה');
    }
  };

  return (
    <>
      <Button block variant="secondary" onClick={() => setOpen(true)}>
        הזמן חברים
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="הזמן חברים">
        {friends === null ? <LoadingBlock /> : null}

        {friends !== null && friends.length === 0 ? (
          <EmptyState
            emoji="🤝"
            title="עוד אין לכם חברים באפליקציה"
            description="אפשר להוסיף חברים ממסך הפרופיל, או פשוט לשתף את קוד השולחן."
          />
        ) : null}

        {friends && friends.length > 0 ? (
          <>
            <p className="mb-3 text-xs text-ink-faint">
              בחרו חבר כדי לשלוח לו את קישור ההצטרפות לשולחן.
            </p>
            <ul className="grid gap-2">
              {friends.map((friend) => (
                <li
                  key={friend.userId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line-soft bg-surface p-3"
                >
                  <Avatar name={friend.displayName} src={friend.avatarUrl} />
                  <p className="min-w-0 flex-1 basis-32 font-semibold break-words text-ink">
                    {friend.displayName}
                  </p>
                  <Button
                    size="sm"
                    className="ms-auto shrink-0"
                    onClick={() => void invite(friend)}
                    aria-label={`שליחת הזמנה ל${friend.displayName}`}
                  >
                    שליחת קישור
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Modal>
    </>
  );
}
