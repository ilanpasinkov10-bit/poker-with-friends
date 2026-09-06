import Link from 'next/link';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { getSessionIdentity } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Choosing a new password after following a reset link.
 *
 * Reaching this screen at all means the link worked: `/auth/callback/recovery`
 * exchanged it for a session first. So the check here is simply whether there
 * is one — no session means the link expired, was already used, or somebody
 * typed the address in by hand, and all three end the same way: ask for a new
 * link rather than show a form that cannot work.
 */
export default async function ResetPasswordPage() {
  const identity = await getSessionIdentity();
  const canReset = Boolean(identity) && !identity!.isAnonymous;

  return (
    <>
      <AppBar title="סיסמה חדשה" backHref="/" />
      <PageShell belowAppBar>
        {canReset ? (
          <>
            <p className="mb-6 text-sm text-ink-muted">
              בחרו סיסמה חדשה לחשבון. אחרי השמירה תישארו מחוברים.
            </p>
            <ResetPasswordForm />
          </>
        ) : (
          <div className="rounded-2xl border border-warn/30 bg-warn-soft p-5 text-center">
            <p className="text-lg font-bold text-warn">הקישור אינו בתוקף</p>
            <p className="mt-2 text-sm text-ink-muted">
              קישורי איפוס תקפים לזמן מוגבל, ואפשר להשתמש בכל קישור פעם אחת בלבד.
            </p>
            <Link
              href="/auth/forgot"
              className="mt-4 inline-block font-semibold text-brand-ink"
            >
              שליחת קישור חדש
            </Link>
          </div>
        )}
      </PageShell>
    </>
  );
}
