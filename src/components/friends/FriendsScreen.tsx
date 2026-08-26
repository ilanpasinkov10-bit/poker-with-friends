'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AppBar } from '@/components/layout/AppBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { PageShell } from '@/components/layout/PageShell';
import { PublicProfileSheet } from '@/components/profile/PublicProfileSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextInput } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import {
  RELATIONSHIP_LABEL,
  isActionable,
  relationshipTone,
  sortFriends,
  sortRequests,
} from '@/lib/domain/friends';
import type { FriendRequestSummary, FriendSummary } from '@/lib/domain/friends';
import {
  cancelFriendRequestAction,
  removeFriendAction,
  respondToFriendRequestAction,
  searchUsersAction,
  sendFriendRequestAction,
  type UserSearchHit,
} from '@/lib/actions/friends';
import { FriendRow } from './FriendRow';

/**
 * The Friends area: who you know, who is waiting, and how to find somebody.
 *
 * Three sub-sections behind one segmented control rather than three routes.
 * They are small, they are read together, and switching between them should
 * not cost a navigation — the whole point of the screen is to accept a
 * request and then go back to looking at the list.
 *
 * Every action re-renders from the server afterwards, so the three lists can
 * never disagree with each other about a relationship that has just changed.
 */

type Tab = 'FRIENDS' | 'REQUESTS' | 'SEARCH';

const TABS: { id: Tab; label: string }[] = [
  { id: 'FRIENDS', label: 'החברים שלי' },
  { id: 'REQUESTS', label: 'בקשות חברות' },
  { id: 'SEARCH', label: 'חיפוש חברים' },
];

export function FriendsScreen({
  friends,
  incoming,
  outgoing,
}: {
  friends: FriendSummary[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
}) {
  const [tab, setTab] = useState<Tab>(incoming.length > 0 ? 'REQUESTS' : 'FRIENDS');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  return (
    <>
      <AppBar title="חברים" subtitle="החברים שלי, בקשות וחיפוש" backHref="/profile" />

      <PageShell belowAppBar withNav>
        <nav aria-label="ניווט חברים" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex min-w-max gap-1.5">
            {TABS.map((entry) => {
              const active = entry.id === tab;
              const badge = entry.id === 'REQUESTS' ? incoming.length : 0;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setTab(entry.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
                      active
                        ? 'bg-brand text-on-brand'
                        : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
                    )}
                  >
                    {entry.label}
                    {badge > 0 ? (
                      <span
                        className={cn(
                          'grid size-5 place-items-center rounded-full text-[0.65rem] font-black',
                          active ? 'bg-on-brand text-brand' : 'bg-brand text-on-brand',
                        )}
                      >
                        <Num>{badge}</Num>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-5">
          {tab === 'FRIENDS' ? (
            <FriendsList friends={friends} onOpenProfile={setProfileUserId} />
          ) : null}
          {tab === 'REQUESTS' ? (
            <RequestsList
              incoming={incoming}
              outgoing={outgoing}
              onOpenProfile={setProfileUserId}
            />
          ) : null}
          {tab === 'SEARCH' ? <SearchPanel onOpenProfile={setProfileUserId} /> : null}
        </div>
      </PageShell>

      <BottomNav />

      <PublicProfileSheet
        userId={profileUserId}
        open={profileUserId !== null}
        onClose={() => setProfileUserId(null)}
      />
    </>
  );
}

function FriendsList({
  friends,
  onOpenProfile,
}: {
  friends: FriendSummary[];
  onOpenProfile: (userId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<FriendSummary | null>(null);

  // A directory has to be scannable, so it is alphabetical rather than in
  // whatever order the rows came back.
  const ordered = sortFriends(friends);

  if (friends.length === 0) {
    return (
      <EmptyState
        emoji="🤝"
        title="עוד אין לכם חברים באפליקציה"
        description="חפשו שחקנים בלשונית ״חיפוש חברים״ ושלחו בקשת חברות."
      />
    );
  }

  const confirmRemove = () => {
    if (!removing) return;
    startTransition(async () => {
      const result = await removeFriendAction(removing.userId);
      if (!result.ok) toast.error(result.message);
      else toast.success(`${removing.displayName} הוסר מרשימת החברים`);
      setRemoving(null);
      router.refresh();
    });
  };

  return (
    <>
      <ul className="grid gap-2">
        {ordered.map((friend) => (
          <FriendRow
            key={friend.userId}
            name={friend.displayName}
            avatarUrl={friend.avatarUrl}
            onOpenProfile={() => onOpenProfile(friend.userId)}
            actions={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRemoving(friend)}
                aria-label={`הסרת ${friend.displayName} מרשימת החברים`}
              >
                הסרה
              </Button>
            }
          />
        ))}
      </ul>

      {/* Removing a friend is quiet and irreversible from the app's side, so
          it asks first — and says plainly that the games they played together
          are not going anywhere. */}
      <ConfirmDialog
        open={removing !== null}
        title="להסיר מרשימת החברים?"
        message={
          removing
            ? `${removing.displayName} יוסר מרשימת החברים שלכם. היסטוריית המשחקים המשותפת נשמרת ואינה משתנה.`
            : ''
        }
        confirmLabel="הסרה"
        tone="danger"
        loading={pending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

function RequestsList({
  incoming,
  outgoing,
  onOpenProfile,
}: {
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
  onOpenProfile: (userId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // A request list is a queue: newest first.
  const waiting = sortRequests(incoming);
  const sent = sortRequests(outgoing);

  const respond = (request: FriendRequestSummary, accept: boolean) =>
    startTransition(async () => {
      const result = await respondToFriendRequestAction(request.userId, accept);
      if (!result.ok) toast.error(result.message);
      else toast.success(accept ? `${request.displayName} נוסף לחברים` : 'הבקשה נדחתה');
      router.refresh();
    });

  const cancel = (request: FriendRequestSummary) =>
    startTransition(async () => {
      const result = await cancelFriendRequestAction(request.userId);
      if (!result.ok) toast.error(result.message);
      else toast.success('הבקשה בוטלה');
      router.refresh();
    });

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        emoji="📭"
        title="אין בקשות חברות"
        description="בקשות שתקבלו או תשלחו יופיעו כאן."
      />
    );
  }

  return (
    <div className="grid gap-6">
      {incoming.length > 0 ? (
        <section>
          <h2 className="mb-3 text-base font-bold text-ink">בקשות שהתקבלו</h2>
          <ul className="grid gap-2">
            {waiting.map((request) => (
              <FriendRow
                key={request.userId}
                name={request.displayName}
                avatarUrl={request.avatarUrl}
                detail="שלח לכם בקשת חברות"
                onOpenProfile={() => onOpenProfile(request.userId)}
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => respond(request, false)}
                      aria-label={`דחיית בקשת החברות של ${request.displayName}`}
                    >
                      דחה
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      disabled={pending}
                      onClick={() => respond(request, true)}
                      aria-label={`אישור בקשת החברות של ${request.displayName}`}
                    >
                      אשר
                    </Button>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      {outgoing.length > 0 ? (
        <section>
          <h2 className="mb-3 text-base font-bold text-ink">בקשות שנשלחו</h2>
          <ul className="grid gap-2">
            {sent.map((request) => (
              <FriendRow
                key={request.userId}
                name={request.displayName}
                avatarUrl={request.avatarUrl}
                detail="בקשה נשלחה — ממתינה לאישור"
                actions={
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => cancel(request)}
                    aria-label={`ביטול בקשת החברות ל${request.displayName}`}
                  >
                    ביטול
                  </Button>
                }
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SearchPanel({ onOpenProfile }: { onOpenProfile: (userId: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserSearchHit[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [acting, startAction] = useTransition();

  const search = (value: string) => {
    setQuery(value);
    const text = value.trim();
    if (text.length < 2) {
      setHits(null);
      return;
    }
    startSearch(async () => {
      const result = await searchUsersAction(text);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setHits(result.data);
    });
  };

  const act = (hit: UserSearchHit) =>
    startAction(async () => {
      const result =
        hit.relationship === 'INCOMING'
          ? await respondToFriendRequestAction(hit.userId, true)
          : await sendFriendRequestAction(hit.userId);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      const relationship = result.data.relationship;
      toast.success(
        relationship === 'FRIENDS' ? `${hit.displayName} נוסף לחברים` : 'בקשת החברות נשלחה',
      );
      // Reflect the new state without a second round trip; the server render
      // behind this screen is refreshed too, so the other tabs stay in step.
      setHits((current) =>
        (current ?? []).map((row) =>
          row.userId === hit.userId ? { ...row, relationship } : row,
        ),
      );
      router.refresh();
    });

  return (
    <div className="grid gap-4">
      <TextInput
        type="search"
        value={query}
        onChange={(event) => search(event.target.value)}
        placeholder="חיפוש לפי שם או מזהה משתמש"
        aria-label="חיפוש שחקנים"
      />

      {query.trim().length > 0 && query.trim().length < 2 ? (
        <p className="text-xs text-ink-faint">הזינו לפחות שתי אותיות.</p>
      ) : null}

      {searching ? <p className="text-xs text-ink-faint">מחפש…</p> : null}

      {hits !== null && hits.length === 0 && !searching ? (
        <EmptyState
          emoji="🔍"
          title="לא נמצאו שחקנים"
          description="בדקו את האיות, או בקשו מהחבר את מזהה המשתמש שלו מתוך מסך החברים."
        />
      ) : null}

      {hits && hits.length > 0 ? (
        <ul className="grid gap-2">
          {hits.map((hit) => (
            <FriendRow
              key={hit.userId}
              name={hit.displayName}
              avatarUrl={hit.avatarUrl}
              onOpenProfile={
                hit.relationship === 'FRIENDS' ? () => onOpenProfile(hit.userId) : undefined
              }
              actions={
                <Button
                  size="sm"
                  variant={relationshipTone(hit.relationship)}
                  disabled={acting || !isActionable(hit.relationship)}
                  onClick={() => act(hit)}
                >
                  {RELATIONSHIP_LABEL[hit.relationship]}
                </Button>
              }
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
