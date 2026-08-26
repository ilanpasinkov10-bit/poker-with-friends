import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith('/') ? params.next : '/';

  const user = await getSessionUser();
  if (user && !user.isAnonymous) redirect(next);

  // A guest who already has a seat keeps the same identity: signing up links an
  // email to their existing anonymous user instead of creating a second one.
  const upgradingGuest = Boolean(user?.isAnonymous);

  return (
    <>
      <AppBar title={upgradingGuest ? 'שמירת הפרופיל' : 'הרשמה'} backHref="/" />
      <PageShell belowAppBar>
        <p className="mb-6 text-sm text-ink-muted">
          {upgradingGuest
            ? 'שמרו את הפרופיל שלכם כדי לשמור על היסטוריית המשחקים והסטטיסטיקות.'
            : 'חשבון חינמי — כדי לפתוח שולחנות ולשמור היסטוריה.'}
        </p>
        <SignUpForm
          next={next}
          upgradeGuest={upgradingGuest}
          defaultName={user?.profile?.display_name ?? ''}
        />
        <p className="mt-6 text-center text-sm text-ink-faint">
          כבר יש לכם חשבון?{' '}
          <Link
            href={`/auth/sign-in?next=${encodeURIComponent(next)}`}
            className="font-semibold text-brand-ink"
          >
            התחברות
          </Link>
        </p>
      </PageShell>
    </>
  );
}
