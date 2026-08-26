import { notFound } from 'next/navigation';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { TableScreen } from '@/components/table/TableScreen';
import { requireAnyUser } from '@/lib/auth';
import { isUuid } from '@/lib/domain/ids';
import { loadTableView } from '@/lib/data/table';
import { TABLE_STATUS_LABEL } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await requireAnyUser(`/table/${id}`);
  const model = await loadTableView(id, user.id, user.isAnonymous);

  return (
    <>
      <AppBar
        title={model.table.name}
        subtitle={TABLE_STATUS_LABEL[model.table.status]}
        backHref="/"
      />
      <PageShell belowAppBar>
        <TableScreen model={model} />
      </PageShell>
    </>
  );
}
