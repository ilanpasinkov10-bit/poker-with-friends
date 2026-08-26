'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import type { ReactNode } from 'react';

/**
 * One person, and whatever you can do about them.
 *
 * Every list in the Friends area — friends, incoming requests, sent requests,
 * search results — is the same row with different buttons, so they share this
 * rather than drifting apart three ways.
 *
 * The layout is the one the table's request cards settled on: `flex-wrap` with
 * a basis on the name column, so the buttons sit beside the name where there
 * is room and drop onto a line of their own where there is not. On a 320px
 * phone a Hebrew name plus "אשר" and "דחה" does not fit on one line, and
 * wrapping is the alternative to truncating somebody's name.
 */
export function FriendRow({
  name,
  avatarUrl,
  detail,
  onOpenProfile,
  actions,
}: {
  name: string;
  avatarUrl: string | null;
  detail?: ReactNode;
  onOpenProfile?: () => void;
  actions?: ReactNode;
}) {
  const identity = (
    <>
      <p className="font-semibold break-words text-ink">{name}</p>
      {detail ? <p className="mt-0.5 text-xs text-ink-faint">{detail}</p> : null}
    </>
  );

  return (
    <Card as="li" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Avatar name={name} src={avatarUrl} />

      {onOpenProfile ? (
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label={`הצג את הפרופיל של ${name}`}
          className="min-w-0 flex-1 basis-32 rounded-lg text-start focus-visible:outline-2 focus-visible:outline-brand"
        >
          {identity}
        </button>
      ) : (
        <div className="min-w-0 flex-1 basis-32">{identity}</div>
      )}

      {actions ? (
        // `ms-auto` so a wrapped button row sits at the end of its line rather
        // than drifting under the avatar.
        <div className="ms-auto flex shrink-0 items-center gap-1.5">{actions}</div>
      ) : null}
    </Card>
  );
}
