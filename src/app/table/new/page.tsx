import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { CreateTableForm } from '@/components/table/CreateTableForm';
import { requireRegisteredUser } from '@/lib/auth';
import { addHoursToTime, nextHalfHourInJerusalem, todayInJerusalem } from '@/lib/timezone';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'פתיחת שולחן חדש' };

export default async function NewTablePage() {
  await requireRegisteredUser('/table/new');

  const startTime = nextHalfHourInJerusalem();

  return (
    <>
      <AppBar title="פתיחת שולחן" subtitle="הגדרות ערב הפוקר" backHref="/" />
      <PageShell>
        <CreateTableForm
          defaultDate={todayInJerusalem()}
          defaultStart={startTime}
          defaultEnd={addHoursToTime(startTime, 4)}
        />
      </PageShell>
    </>
  );
}
