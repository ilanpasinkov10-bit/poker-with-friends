import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { SignInForm } from '@/components/auth/SignInForm';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith('/') ? params.next : '/';

  const user = await getSessionUser();
  if (user && !user.isAnonymous) redirect(next);

  return (
    <>
      <AppBar title="התחברות" backHref="/" />
      <PageShell>
        <p className="mb-6 text-sm text-ink-muted">
          התחברו כדי לפתוח שולחנות ולשמור את היסטוריית המשחקים שלכם.
        </p>
        <SignInForm next={next} />
        <p className="mt-6 text-center text-sm text-ink-faint">
          עדיין אין לכם חשבון?{' '}
          <Link
            href={`/auth/sign-up?next=${encodeURIComponent(next)}`}
            className="font-semibold text-brand-ink"
          >
            הרשמה
          </Link>
        </p>
      </PageShell>
    </>
  );
}
