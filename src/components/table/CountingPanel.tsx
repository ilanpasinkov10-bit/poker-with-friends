'use client';

import { useMemo, useState, useTransition } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { validateChipCount } from '@/lib/domain/chips';
import { FINALIZE_BLOCKED_MESSAGE, finalizeReadiness } from '@/lib/domain/permissions';
import { formatChips, formatMoney } from '@/lib/format';
import { chipsWord } from '@/lib/labels';
import {
  adminSetChipCountAction,
  approveAllChipCountsAction,
  finalizeGameAction,
  submitChipCountAction,
} from '@/lib/actions/counting';
import type { TableViewModel } from '@/lib/data/table';

export function CountingPanel({ model }: { model: TableViewModel }) {
  // Leavers already have an approved count and their chips are part of the
  // total, so the counting screen works over every participant.
  const { table, participants: players, viewer } = model;
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  const effective = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    return player?.approvedChips ?? player?.submittedChips ?? null;
  };

  const validation = useMemo(
    () =>
      validateChipCount(
        players.map((p) => ({
          chipsIssued: p.chipsIssued,
          finalChips: effective(p.id) ?? 0,
        })),
      ),
    // effective() reads from players, so players is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players],
  );

  const missing = players.filter((p) => effective(p.id) === null);
  const awaitingApproval = players.filter(
    (p) => p.submittedChips !== null && p.approvedChips === null,
  );
  const readiness = finalizeReadiness(
    { userId: viewer.userId, isTableAdmin: viewer.isAdmin },
    { status: table.status, maxBuyIns: table.max_buy_ins },
    players.map((p) => ({
      chipsIssued: p.chipsIssued,
      submittedChips: p.submittedChips,
      approvedChips: p.approvedChips,
    })),
  );

  const finalize = () =>
    startTransition(async () => {
      const result = await finalizeGameAction(table.id);
      if (!result.ok) toast.error(result.message);
      else toast.success('המשחק הסתיים — ההתחשבנות מוכנה');
      setConfirmFinalize(false);
    });

  const approveAll = () =>
    startTransition(async () => {
      const result = await approveAllChipCountsAction(table.id);
      if (!result.ok) toast.error(result.message);
      else toast.success('כל הספירות אושרו');
    });

  return (
    <div className="grid gap-5">
      <ChipBalanceBanner
        verdict={validation.verdict}
        difference={validation.difference}
        issued={validation.totalIssued}
        counted={validation.totalCounted}
        missingPlayers={missing.length}
      />

      {!viewer.isAdmin && viewer.player && table.counting_mode === 'SELF_COUNT' ? (
        <SelfCountCard model={model} />
      ) : null}

      {!viewer.isAdmin && table.counting_mode === 'ADMIN_COUNT' ? (
        <Card className="text-center text-sm text-ink-muted">
          מנהל השולחן מזין כרגע את הספירה הסופית. רגע אחד…
        </Card>
      ) : null}

      {viewer.isAdmin ? (
        <section>
          <SectionTitle
            action={
              awaitingApproval.length > 0 ? (
                <Button size="sm" variant="secondary" loading={pending} onClick={approveAll}>
                  אשר את כל הספירות
                </Button>
              ) : undefined
            }
          >
            ספירה סופית
          </SectionTitle>

          <ul className="grid gap-2">
            {players.map((player) => (
              <AdminCountRow
                key={player.id}
                tableId={table.id}
                playerId={player.id}
                name={player.displayName}
                avatarUrl={player.avatarUrl}
                chipsIssued={player.chipsIssued}
                submitted={player.submittedChips}
                approved={player.approvedChips}
                buyInAgorot={table.buy_in_agorot}
                chipsPerBuyIn={table.chips_per_buy_in}
                totalPaidAgorot={player.totalPaidAgorot}
              />
            ))}
          </ul>

          <div className="mt-5">
            <Button
              size="lg"
              block
              variant="success"
              disabled={!readiness.ready}
              onClick={() => setConfirmFinalize(true)}
            >
              סיים וחשב התחשבנות
            </Button>
            {!readiness.ready && readiness.reason ? (
              <p className="mt-2 text-center text-xs text-ink-faint">
                {FINALIZE_BLOCKED_MESSAGE[readiness.reason]}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmFinalize}
        title="לסיים את המשחק?"
        message="נחשב את התוצאות ואת ההתחשבנות. אחרי זה תיקון דורש אישור מפורש."
        confirmLabel="מסיימים"
        loading={pending}
        onConfirm={finalize}
        onCancel={() => setConfirmFinalize(false)}
      />
    </div>
  );
}

function ChipBalanceBanner({
  verdict,
  difference,
  issued,
  counted,
  missingPlayers,
}: {
  verdict: 'BALANCED' | 'MISSING' | 'SURPLUS';
  difference: number;
  issued: number;
  counted: number;
  missingPlayers: number;
}) {
  const message =
    verdict === 'BALANCED'
      ? 'הספירה תקינה ✓'
      : verdict === 'MISSING'
        ? `חסרים ${formatChips(Math.abs(difference))} ז׳יטונים בספירה`
        : `יש ${formatChips(difference)} ז׳יטונים יותר מהכמות שנכנסה למשחק`;

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 text-center',
        verdict === 'BALANCED'
          ? 'border-profit/40 bg-profit-soft'
          : 'border-warn/40 bg-warn-soft',
      )}
    >
      <p
        className={cn(
          'text-base font-bold',
          verdict === 'BALANCED' ? 'text-profit' : 'text-warn',
        )}
      >
        {message}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        חולקו <Num>{formatChips(issued)}</Num> · נספרו <Num>{formatChips(counted)}</Num>
      </p>
      {missingPlayers > 0 ? (
        <p className="mt-1 text-xs text-ink-faint">
          <Num>{missingPlayers}</Num> שחקנים עדיין לא הזינו ספירה
        </p>
      ) : null}
    </div>
  );
}

function SelfCountCard({ model }: { model: TableViewModel }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const player = model.viewer.player!;
  const [value, setValue] = useState(
    player.submittedChips !== null ? String(player.submittedChips) : '',
  );

  const submit = () =>
    startTransition(async () => {
      const result = await submitChipCountAction(model.table.id, player.id, Number(value));
      if (!result.ok) toast.error(result.message);
      else toast.success('הספירה נשלחה למנהל השולחן');
    });

  const approved = player.approvedChips !== null;

  return (
    <Card className="card-grad">
      <p className="text-base font-bold text-ink">כמה ז׳יטונים נשארו לך?</p>
      <p className="mt-1 text-xs text-ink-faint">
        קיבלת <Num>{formatChips(player.chipsIssued)}</Num> ז׳יטונים במהלך המשחק
      </p>

      {/*
        A number field beside its button is the row that has to give way first
        on a narrow phone. `size` gives an <input> an intrinsic width of about
        twenty characters, so without `min-w-0` it refuses to shrink; the button
        gets `shrink-0` so the field takes the squeeze rather than the label
        wrapping inside the button.
      */}
      <div className="mt-4 flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          dir="ltr"
          value={value}
          disabled={approved}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0"
          className="ltr-num h-14 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-4 text-center text-2xl font-black text-ink disabled:opacity-60"
        />
        <Button
          size="lg"
          className="shrink-0"
          loading={pending}
          disabled={approved || value === ''}
          onClick={submit}
        >
          שליחה
        </Button>
      </div>

      {approved ? (
        <p className="mt-3 text-sm font-semibold text-profit">
          מנהל השולחן אישר: {chipsWord(player.approvedChips!)}
        </p>
      ) : player.submittedChips !== null ? (
        <p className="mt-3 text-sm text-ink-muted">
          נשלח: {chipsWord(player.submittedChips)} — ממתין לאישור מנהל השולחן
        </p>
      ) : null}
    </Card>
  );
}

function AdminCountRow({
  tableId,
  playerId,
  name,
  avatarUrl,
  chipsIssued,
  submitted,
  approved,
  buyInAgorot,
  chipsPerBuyIn,
  totalPaidAgorot,
}: {
  tableId: string;
  playerId: string;
  name: string;
  avatarUrl: string | null;
  chipsIssued: number;
  submitted: number | null;
  approved: number | null;
  buyInAgorot: number;
  chipsPerBuyIn: number;
  totalPaidAgorot: number;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const initial = approved ?? submitted;
  const [value, setValue] = useState(initial !== null ? String(initial) : '');

  const chips = Number(value);
  const preview =
    value !== '' && Number.isFinite(chips)
      ? Math.round((chips * buyInAgorot) / chipsPerBuyIn)
      : null;

  const save = () =>
    startTransition(async () => {
      const result = await adminSetChipCountAction(tableId, playerId, Number(value));
      if (!result.ok) toast.error(result.message);
      else toast.success(`הספירה של ${name} נשמרה`);
    });

  return (
    <li className="rounded-2xl border border-line-soft bg-surface p-3.5">
      <div className="flex items-center gap-3">
        <Avatar name={name} src={avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold break-words text-ink">{name}</p>
          <p className="text-[0.7rem] text-ink-faint">
            קיבל <Num>{formatChips(chipsIssued)}</Num> ז׳יטונים ·{' '}
            <Num>{formatMoney(totalPaidAgorot)}</Num> השקעה
          </p>
        </div>
        {approved !== null ? (
          <span className="shrink-0 text-xs font-bold text-profit">אושר</span>
        ) : submitted !== null ? (
          <span className="shrink-0 text-xs font-semibold text-warn">נשלח</span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ספירה סופית"
          aria-label={`ספירה סופית עבור ${name}`}
          className="ltr-num h-12 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-center text-lg font-bold text-ink"
        />
        <Button
          size="md"
          variant="secondary"
          className="shrink-0"
          loading={pending}
          disabled={value === ''}
          onClick={save}
        >
          שמור
        </Button>
      </div>

      {preview !== null ? (
        <p className="mt-2 text-[0.7rem] text-ink-faint">
          שווי: <Num>{formatMoney(preview)}</Num> · תוצאה:{' '}
          <span className={preview - totalPaidAgorot >= 0 ? 'text-profit' : 'text-loss'}>
            <Num>{formatMoney(preview - totalPaidAgorot)}</Num>
          </span>
        </p>
      ) : null}
    </li>
  );
}
