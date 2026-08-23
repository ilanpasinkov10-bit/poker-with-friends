import { Num } from '@/components/ui/Num';
import { formatSignedMoney } from '@/lib/format';
import type { PersonalRecord } from '@/lib/domain/stats';

export function RecordsList({ records }: { records: PersonalRecord[] }) {
  return (
    <ul className="grid gap-2">
      {records.map((record) => (
        <li
          key={record.key}
          className="flex items-center gap-3 rounded-2xl border border-line-soft bg-surface p-3.5"
        >
          <span className="text-2xl" aria-hidden>
            {record.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{record.title}</p>
            <p className="truncate text-[0.7rem] text-ink-faint">
              {record.gameLabel ?? 'עדיין אין נתונים'}
            </p>
          </div>
          <span className="shrink-0 text-base font-black text-brand-ink">
            <Num>
              {record.valueAgorot !== undefined
                ? formatSignedMoney(record.valueAgorot)
                : (record.valueNumber ?? '—')}
            </Num>
          </span>
        </li>
      ))}
    </ul>
  );
}
