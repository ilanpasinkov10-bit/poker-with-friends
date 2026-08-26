import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { JoinCodeForm } from '@/components/join/JoinCodeForm';

export const metadata = { title: 'הצטרפות לשולחן' };

export default function JoinCodePage() {
  return (
    <>
      <AppBar title="הצטרפות עם קוד" backHref="/" />
      <PageShell belowAppBar>
        <p className="mb-6 text-sm text-ink-muted">
          הזינו את קוד השולחן שקיבלתם ממנהל השולחן. לא צריך חשבון.
        </p>
        <JoinCodeForm />
      </PageShell>
    </>
  );
}
