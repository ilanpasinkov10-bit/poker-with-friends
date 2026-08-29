'use client';

import { useEffect, useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { joinUrl } from '@/lib/domain/join-link';
import { INVITE_STATE_LABEL, type FriendInviteView } from '@/lib/domain/invitations';
import {
  inviteFriendToTableAction,
  listFriendsForTableAction,
} from '@/lib/actions/invitations';

/**
 * "הזמן חברים" — a real invitation for the people on the app, and the join
 * link for everybody else.
 *
 * Inviting a friend writes a row the other person will see on their home
 * screen and, if they have notifications on, on their phone. Accepting it
 * joins through the same function a pasted code goes through, so there is
 * still exactly one way a seat is created, with one set of rules.
 *
 * The link has not gone anywhere: "הזמן באמצעות קישור" is the same share sheet
 * this button used to be, and is still the only way to reach somebody who has
 * not installed the app or has no account.
 *
 * The list is fetched when the sheet is opened rather than with the table.
 * Almost every visit to a table does not open it, and the friends list plus
 * the invitations for this table are two queries that would otherwise be paid
 * for on every load of the screen.
 */
export function InviteFriendsButton({
  tableId,
  tableName,
  joinCode,
  seatedUserIds,
}: {
  tableId: string;
  tableName: string;
  joinCode: string;
  /** Whoever already has a seat, so the sheet says "הצטרף" rather than "הזמן". */
  seatedUserIds: string[];
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendInviteView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Resolved on the client, where the origin is known — the same way every
  // other share in this app builds its address.
  const [shareUrl] = useState(() =>
    joinUrl(typeof window === 'undefined' ? null : window.location.origin, joinCode),
  );

  const seatedKey = seatedUserIds.join(',');

  useEffect(() => {
    if (!open || friends !== null) return;
    let cancelled = false;
    void listFriendsForTableAction(tableId, seatedKey ? seatedKey.split(',') : []).then(
      (result) => {
        if (cancelled) return;
        setFriends(result.ok ? result.data : []);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, friends, tableId, seatedKey]);

  const invite = (friend: FriendInviteView) => {
    setBusy(friend.userId);
    startTransition(async () => {
      const result = await inviteFriendToTableAction(tableId, friend.userId);
      setBusy(null);
      if (!result.ok) {
        toast.error(result.message);
        // Whatever the refusal was — they joined a moment ago, they already
        // said no — the server's answer is newer than this list. Re-read it.
        setFriends(null);
        return;
      }
      setFriends((previous) =>
        (previous ?? []).map((row) =>
          row.userId === friend.userId ? { ...row, state: 'INVITED' } : row,
        ),
      );
      toast.success(
        result.data.alreadyInvited
          ? `${friend.displayName} כבר הוזמן/ה`
          : `ההזמנה נשלחה ל${friend.displayName}`,
      );
    });
  };

  /** The old behaviour, kept: send the join link through the phone. */
  const shareLink = async () => {
    const text = `מזמין אותך לשולחן "${tableName}"`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: tableName, text, url: shareUrl });
      } catch {
        // The share sheet was dismissed. Nothing to report.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      toast.success('ההזמנה הועתקה');
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
              ההזמנה תופיע אצל החבר במסך הבית, והוא יוכל להצטרף בלחיצה אחת.
            </p>
            <InviteFriendList friends={friends} busyUserId={busy} onInvite={invite} />
          </>
        ) : null}

        {/* Still the only way to reach somebody who is not on the app. */}
        <div className="mt-4 border-t border-line-soft pt-4">
          <Button block variant="secondary" onClick={() => void shareLink()}>
            הזמן באמצעות קישור
          </Button>
        </div>
      </Modal>
    </>
  );
}

/**
 * The list itself, separated from the fetching so every state it can be in —
 * invited, joined, declined — can be rendered side by side in the gallery
 * without a backend to put a person in each of them.
 */
export function InviteFriendList({
  friends,
  busyUserId,
  onInvite,
}: {
  friends: FriendInviteView[];
  busyUserId: string | null;
  onInvite: (friend: FriendInviteView) => void;
}) {
  return (
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
          {friend.state === 'CAN_INVITE' ? (
            <Button
              size="sm"
              className="ms-auto shrink-0"
              loading={busyUserId === friend.userId}
              onClick={() => onInvite(friend)}
              aria-label={`הזמנת ${friend.displayName} לשולחן`}
            >
              {INVITE_STATE_LABEL.CAN_INVITE}
            </Button>
          ) : (
            <span
              className="ms-auto shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink-faint"
              aria-label={`${friend.displayName}: ${INVITE_STATE_LABEL[friend.state]}`}
            >
              {INVITE_STATE_LABEL[friend.state]}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
