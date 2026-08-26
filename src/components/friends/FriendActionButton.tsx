'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  isActionable,
  PROFILE_RELATIONSHIP_LABEL,
  relationshipTone,
  type Relationship,
} from '@/lib/domain/friends';
import {
  fetchRelationshipAction,
  respondToFriendRequestAction,
  sendFriendRequestAction,
} from '@/lib/actions/friends';

/**
 * The relationship action on somebody else's profile.
 *
 * The relationship is fetched when the sheet opens rather than passed in,
 * because the sheet is opened from half a dozen places — a table's player
 * list, the leaderboard, the friends list itself — and threading a friendship
 * through all of them would mean each caller having to know about friendships.
 *
 * Nothing is rendered at all until the answer arrives, and nothing is rendered
 * for yourself or for a guest: an account you cannot befriend should not show
 * a button that will only ever fail.
 */
export function FriendActionButton({
  userId,
  isSelf,
  isGuest,
}: {
  userId: string;
  isSelf: boolean;
  isGuest: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [pending, startTransition] = useTransition();

  const eligible = !isSelf && !isGuest;

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    void fetchRelationshipAction(userId).then((result) => {
      if (!cancelled && result.ok) setRelationship(result.data.relationship);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, eligible]);

  if (!eligible || relationship === null) return null;

  const act = () =>
    startTransition(async () => {
      const result =
        relationship === 'INCOMING'
          ? await respondToFriendRequestAction(userId, true)
          : await sendFriendRequestAction(userId);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setRelationship(result.data.relationship);
      toast.success(
        result.data.relationship === 'FRIENDS' ? 'נוספתם כחברים' : 'בקשת החברות נשלחה',
      );
      router.refresh();
    });

  return (
    <Button
      block
      variant={relationshipTone(relationship)}
      loading={pending}
      // "בקשה נשלחה" and "חברים" are statements, not offers. Withdrawing a
      // request and removing a friend both live on the Friends screen, behind
      // their own deliberate actions.
      disabled={!isActionable(relationship)}
      onClick={act}
    >
      {PROFILE_RELATIONSHIP_LABEL[relationship]}
    </Button>
  );
}
