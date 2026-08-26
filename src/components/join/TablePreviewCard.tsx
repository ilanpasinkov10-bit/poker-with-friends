import { Badge } from '@/components/ui/Badge';
import { Num } from '@/components/ui/Num';
import { formatMoney, formatTime } from '@/lib/format';
import { TABLE_STATUS_LABEL, TABLE_STATUS_TONE, chipsWord } from '@/lib/labels';
import type { TableStatus } from '@/types/database';

export interface TablePreviewData {
  name: string;
  admin_name: string;
  status: TableStatus;
  planned_end_at: string;
  buy_in_agorot: number;
  chips_per_buy_in: number;
  player_count: number;
}

/** Summary of a table shown to someone who is about to join it. */
export function TablePreviewCard({ table }: { table: TablePreviewData }) {
  return (
    <section className="card-grad rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        {/* Same reasoning as the table header: the badge is fixed width, so the
            name wraps rather than being cut off on a narrow phone. This is the
            screen where someone decides whether to join — the table's name is
            the whole point of it. */}
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black break-words text-ink">{table.name}</h2>
          <p className="mt-0.5 text-sm text-ink-faint">מנהל השולחן: {table.admin_name}</p>
        </div>
        <Badge className="shrink-0" tone={TABLE_STATUS_TONE[table.status]} dot>
          {TABLE_STATUS_LABEL[table.status]}
        </Badge>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        <Info label="שחקנים" value={<Num>{table.player_count}</Num>} />
        <Info label="כניסה" value={<Num>{formatMoney(table.buy_in_agorot)}</Num>} />
        <Info label="שעת סיום" value={<Num>{formatTime(table.planned_end_at)}</Num>} />
      </dl>

      <p className="mt-4 text-center text-xs text-ink-faint">
        כל כניסה: <Num>{formatMoney(table.buy_in_agorot)}</Num> ·{' '}
        {chipsWord(table.chips_per_buy_in)}
      </p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-3">
      <dt className="text-[0.7rem] text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-base font-bold text-ink">{value}</dd>
    </div>
  );
}
