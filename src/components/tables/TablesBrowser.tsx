'use client';

import { PendingCardLink } from '@/components/layout/PendingLink';
import { useMemo, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, OptionGroup, TextInput } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { TABLE_STATUS_LABEL, TABLE_STATUS_TONE, playersWord } from '@/lib/labels';
import {
  activeFilterCount,
  EMPTY_FILTER,
  filterTables,
  isFiltering,
  localToday,
  type DateFilter,
  type StatusFilter,
  type TableFilter,
} from '@/lib/domain/table-filters';
import { useToast } from '@/components/ui/Toast';
import { setTableHiddenAction } from '@/lib/actions/tables';
import { canHideTable, groupTables } from '@/lib/domain/table-groups';
import type { PokerTableRow } from '@/types/database';

/**
 * The player's tables, with a way to find one.
 *
 * Everything here filters rows the page has already loaded. `loadMyTables`
 * fetches the whole list in one capped query, so the answer to "which of these
 * is the Thursday game" is already in memory — asking the database again on
 * every keystroke would be slower and would need a spinner to explain itself.
 *
 * The search box stays on screen because it is the one that gets used; status
 * and date live behind a single "סינון" button, which keeps a list of games
 * looking like a list of games rather than a search form. That button carries a
 * count, so a filter can never be left on invisibly — the commonest way a list
 * like this comes to look broken.
 */

export interface TableListItem {
  table: PokerTableRow;
  role: 'ADMIN' | 'PLAYER';
  playerCount: number;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'הכל' },
  // The app's own wording, so a filter and the badge on the card always say the
  // same thing about the same game.
  { value: 'ACTIVE', label: TABLE_STATUS_LABEL.ACTIVE },
  { value: 'WAITING', label: TABLE_STATUS_LABEL.WAITING },
  { value: 'COUNTING', label: TABLE_STATUS_LABEL.COUNTING },
  { value: 'COMPLETED', label: TABLE_STATUS_LABEL.COMPLETED },
  { value: 'CANCELLED', label: TABLE_STATUS_LABEL.CANCELLED },
];

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'ALL', label: 'הכל' },
  { value: 'TODAY', label: 'היום' },
  { value: 'LAST_7', label: '7 ימים אחרונים' },
  { value: 'LAST_30', label: '30 ימים אחרונים' },
  { value: 'RANGE', label: 'טווח תאריכים' },
];

export function TablesBrowser({ items }: { items: TableListItem[] }) {
  const [filter, setFilter] = useState<TableFilter>(EMPTY_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Fixed for the life of the screen, so no two renders can disagree about
  // what "היום" means.
  const today = useMemo(() => localToday(), []);

  const matches = useMemo(() => {
    const withFields = items.map((item) => ({
      ...item,
      name: item.table.name,
      status: item.table.status,
      gameDate: item.table.game_date,
    }));
    return filterTables(withFields, filter, today);
  }, [items, filter, today]);

  // One section per lifecycle status, in the order a game moves through them,
  // and none at all for a status nothing is in.
  const groups = useMemo(() => groupTables(matches), [matches]);

  const count = activeFilterCount(filter);
  const filtering = isFiltering(filter);
  const set = <K extends keyof TableFilter>(key: K, value: TableFilter[K]) =>
    setFilter((current) => ({ ...current, [key]: value }));

  return (
    <>
      <div className="mt-5 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TextInput
            type="search"
            value={filter.query}
            onChange={(event) => set('query', event.target.value)}
            placeholder="חיפוש לפי שם שולחן"
            aria-label="חיפוש לפי שם שולחן"
          />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={count > 0 ? `סינון, ${count} מסננים פעילים` : 'סינון'}
          className={cn(
            'flex h-12 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold',
            count > 0
              ? 'border-brand/40 bg-brand-soft text-brand-ink'
              : 'border-line bg-surface-2 text-ink-muted',
          )}
        >
          סינון
          {count > 0 ? (
            <span className="grid size-5 place-items-center rounded-full bg-brand text-[0.65rem] font-black text-on-brand">
              <Num>{count}</Num>
            </span>
          ) : null}
        </button>
      </div>

      {filtering ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-ink-faint">
            <Num>{matches.length}</Num> מתוך <Num>{items.length}</Num> שולחנות
          </p>
          <button
            type="button"
            onClick={() => setFilter(EMPTY_FILTER)}
            className="shrink-0 text-xs font-semibold text-brand-ink underline underline-offset-2"
          >
            נקה סינון
          </button>
        </div>
      ) : null}

      {matches.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            emoji="🔍"
            title="לא נמצאו שולחנות שמתאימים לסינון"
            description="נסו שם אחר, או נקו את הסינון כדי לראות את כל השולחנות."
            action={
              <Button variant="secondary" onClick={() => setFilter(EMPTY_FILTER)}>
                נקה סינון
              </Button>
            }
          />
        </div>
      ) : null}

      {groups.map((group, index) => (
        <section key={group.status} className={index === 0 ? 'mt-6' : 'mt-8'}>
          <SectionTitle>{group.title}</SectionTitle>
          <TableList items={group.items} />
        </section>
      ))}

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="סינון">
        <div className="grid gap-5">
          <section>
            <p className="mb-2 text-sm font-semibold text-ink-muted">סטטוס</p>
            <OptionGroup
              name="status"
              value={filter.status}
              onChange={(value) => set('status', value)}
              options={STATUS_OPTIONS}
            />
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold text-ink-muted">תאריך</p>
            <OptionGroup
              name="date"
              value={filter.date}
              onChange={(value) => set('date', value)}
              options={DATE_OPTIONS}
            />

            {filter.date === 'RANGE' ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="מתאריך" htmlFor="filterFrom">
                  <TextInput
                    id="filterFrom"
                    type="date"
                    value={filter.from}
                    onChange={(event) => set('from', event.target.value)}
                  />
                </Field>
                <Field label="עד תאריך" htmlFor="filterTo">
                  <TextInput
                    id="filterTo"
                    type="date"
                    value={filter.to}
                    onChange={(event) => set('to', event.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </section>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setFilter(EMPTY_FILTER)}>
              נקה סינון
            </Button>
            <Button onClick={() => setSheetOpen(false)}>
              הצג <Num>{matches.length}</Num>
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * The card is unchanged from before the filters, bar one thing: the name wraps
 * instead of truncating, for the same reason it does everywhere else — a table
 * you are searching for by name is a poor place to hide the end of the name.
 */
function TableList({ items }: { items: TableListItem[] }) {
  return (
    <ul className="grid gap-2">
      {items.map(({ table, role, playerCount }) => (
        <Card as="li" key={table.id} className="relative p-0">
          {/* Outside the link, not inside it: an anchor may not contain a
              button, and a tap meant for this one must never open the table. */}
          {canHideTable(table.status) ? <HideAction table={table} /> : null}
          <PendingCardLink href={`/table/${table.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold break-words text-ink">{table.name}</p>
                <p className="mt-0.5 text-[0.7rem] text-ink-faint">
                  <Num>{formatDate(table.game_date)}</Num> ·{' '}
                  <Num>{formatTime(table.planned_start_at)}</Num> ·{' '}
                  {playersWord(playerCount)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={TABLE_STATUS_TONE[table.status]} dot>
                  {TABLE_STATUS_LABEL[table.status]}
                </Badge>
                {role === 'ADMIN' ? (
                  <span className="text-[0.65rem] font-semibold text-brand-ink">מנהל שולחן</span>
                ) : null}
              </div>
            </div>
            <p className="mt-2 pe-9 text-[0.7rem] text-ink-faint">
              כניסה <Num>{formatMoney(table.buy_in_agorot)}</Num> · מקסימום{' '}
              <Num>{table.max_buy_ins}</Num> כניסות · קוד{' '}
              <Num className="font-bold text-ink-muted">{table.join_code}</Num>
            </p>
          </PendingCardLink>
        </Card>
      ))}
    </ul>
  );
}

/**
 * Taking one finished game off your own list.
 *
 * Offered only once a game is over. While a table is waiting, being played or
 * being counted there may still be something for this person to do about it,
 * and a list they have removed it from is the wrong place to find that out —
 * the database refuses those too, so this is not the thing keeping them safe.
 *
 * Nothing is deleted. The row it writes says one person does not want one
 * table on one screen; the game, its results and everybody else's list are
 * untouched.
 */
function HideAction({ table }: { table: PokerTableRow }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const hide = () =>
    startTransition(async () => {
      const result = await setTableHiddenAction(table.id, true);
      // The dialog closes either way: a failure is said in the toast, and
      // leaving it open invites a second tap at something that just refused.
      setConfirming(false);
      if (!result.ok) toast.error(result.message);
      else toast.success('השולחן הוסר מהרשימה שלך');
    });

  return (
    <>
      <button
        type="button"
        aria-label={`הסתר מהשולחנות שלי — ${table.name}`}
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="absolute bottom-2 start-2 z-10 grid size-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-surface-3 hover:text-ink-muted disabled:opacity-40"
      >
        <HideIcon />
      </button>

      <ConfirmDialog
        open={confirming}
        tone="danger"
        title="הסרת שולחן מהרשימה"
        message="השולחן יוסר מהתצוגה שלך בלבד. נתוני המשחק, התוצאות והסטטיסטיקות יישמרו."
        cancelLabel="ביטול"
        confirmLabel="הסר מהרשימה"
        loading={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={hide}
      />
    </>
  );
}

function HideIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.4 5.4A9.6 9.6 0 0112 5c5 0 9 4.5 9 7a11 11 0 01-2.4 3.4M6.2 6.7A11.7 11.7 0 003 12c0 2.5 4 7 9 7a9.3 9.3 0 004-.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
