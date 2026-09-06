import Link from 'next/link';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { LINK_FAILURE_MESSAGE, type LinkFailure } from '@/lib/domain/auth-links';

export const dynamic = 'force-dynamic';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const params = await searchParams;
  // Set when a reset link failed on its way back in: the person is here to ask
  // for another one, and should be told why rather than wondering.
  const failure = LINK_FAILURE_MESSAGE[params.link as LinkFailure] ?? null;

  return (
    <>
      <AppBar title="איפוס סיסמה" backHref="/auth/sign-in" />
      <PageShell belowAppBar>
        {failure ? (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn"
          >
            {failure}
          </p>
        ) : null}

        <p className="mb-6 text-sm text-ink-muted">
          הזינו את כתובת האימייל של החשבון, ונשלח אליכם קישור לבחירת סיסמה חדשה.
        </p>

        <ForgotPasswordForm />

        <p className="mt-6 text-center text-sm text-ink-faint">
          נזכרתם?{' '}
          <Link href="/auth/sign-in" className="font-semibold text-brand-ink">
            חזרה להתחברות
          </Link>
        </p>
      </PageShell>
    </>
  );
}
