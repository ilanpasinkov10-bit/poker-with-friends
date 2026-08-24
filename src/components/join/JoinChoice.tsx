'use client';

import Link from 'next/link';
import { useState } from 'react';
import { JoinTableForm } from '@/components/join/JoinTableForm';

/**
 * What an invited visitor sees when they are not signed in: a real choice
 * between using an existing account and joining as a guest.
 *
 * The account route carries the invitation through authentication via `next`,
 * so the user lands straight back on this table instead of hunting for it.
 */
export function JoinChoice({
  code,
  tableId,
  needsApproval,
}: {
  code: string;
  tableId: string;
  needsApproval: boolean;
}) {
  const [asGuest, setAsGuest] = useState(false);
  const backHere = `/join/${code}`;

  if (asGuest) {
    return (
      <div>
        <JoinTableForm
          code={code}
          tableId={tableId}
          needsApproval={needsApproval}
          defaultName=""
          isSignedIn={false}
        />
        <button
          type="button"
          onClick={() => setAsGuest(false)}
          className="mt-4 block w-full text-center text-sm font-semibold text-ink-faint underline"
        >
          חזרה לאפשרויות הכניסה
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="font-bold text-ink">יש לך חשבון?</p>
        <p className="mt-1 text-sm text-ink-faint">התחבר לחשבון שלך והמשך לשולחן</p>
        <Link
          href={`/auth/sign-in?next=${encodeURIComponent(backHere)}`}
          className="mt-3 flex h-13 min-h-12 items-center justify-center rounded-xl bg-brand px-5 text-base font-bold text-on-brand"
        >
          התחברות לחשבון
        </Link>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="font-bold text-ink">העדפת להיכנס מהר?</p>
        <p className="mt-1 text-sm text-ink-faint">היכנס כאורח ללא הרשמה</p>
        <button
          type="button"
          onClick={() => setAsGuest(true)}
          className="mt-3 flex h-13 min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface-2 px-5 text-base font-bold text-ink"
        >
          כניסה כאורח
        </button>
      </section>

      <p className="mt-1 text-center text-[0.7rem] text-ink-faint">
        גם כאורח אפשר לשמור את הפרופיל בסוף המשחק.
      </p>
    </div>
  );
}
