import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { SignInForm } from '@/components/auth/SignInForm';
import { getSessionUser } from '@/lib/auth';
import { LINK_FAILURE_MESSAGE, isLinkFailure } from '@/lib/domain/auth-links';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; link?: string }>;
}) {
  const params = await searchParams;
  const next =
    params.next && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/';

  // A confirmation or magic link that could not be completed sends the person
  // here with a reason. It used to send `?error=link`, which this page did not
  // read — so a failed confirmation looked exactly like an ordinary visit, and
  // somebody who had just confirmed their address was left guessing.
  const linkFailure = isLinkFailure(params.link) ? LINK_FAILURE_MESSAGE[params.link] : null;

  const user = await getSessionUser();
  if (user && !user.isAnonymous) redirect(next);

  return (
    <>
      <AppBar title="התחברות" backHref="/" />
      <PageShell belowAppBar>
        {linkFailure ? (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn"
          >
            {linkFailure}
          </p>
        ) : null}

        <p className="mb-6 text-sm text-ink-muted">
          התחברו כדי לפתוח שולחנות ולשמור את היסטוריית המשחקים שלכם.
        </p>
        <SignInForm next={next} />

        <p className="mt-4 text-center text-sm">
          <Link href="/auth/forgot" className="font-semibold text-brand-ink">
            שכחתי סיסמה
          </Link>
        </p>

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
