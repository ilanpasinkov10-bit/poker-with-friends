'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { validateChipCount } from '@/lib/domain/chips';
import { formatChips } from '@/lib/format';
import { correctGameResultsAction } from '@/lib/actions/counting';
import type { GameResultRow } from '@/types/database';

/**
 * A finalised game is not silently editable. A correction requires a stated
 * reason, must still balance, and is recorded in game_corrections along with a
 * snapshot of the previous results.
 */
export function CorrectResultsDialog({
  open,
  tableId,
  results,
  onClose,
}: {
  open: boolean;
  tableId: string;
  results: GameResultRow[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(results.map((r) => [r.table_player_id, String(r.final_chips)])),
  );

  const parsed = results.map((r) => ({
    chipsIssued: r.chips_issued,
    finalChips: Number(counts[r.table_player_id] ?? r.final_chips),
  }));
  const allNumeric = parsed.every((p) => Number.isInteger(p.finalChips) && p.finalChips >= 0);
  const check = validateChipCount(parsed);
  const canSubmit = allNumeric && check.verdict === 'BALANCED' && reason.trim().length >= 3;

  const submit = () =>
    startTransition(async () => {
      const result = await correctGameResultsAction(tableId, {
        reason,
        counts: results.map((r) => ({
          tablePlayerId: r.table_player_id,
          chips: Number(counts[r.table_player_id] ?? r.final_chips),
        })),
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success('התוצאות תוקנו ונשמר תיעוד');
      onClose();
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="תיקון תוצאות"
      size="lg"
      footer={
        <Button block loading={pending} disabled={!canSubmit} onClick={submit}>
          שמור תיקון
        </Button>
      }
    >
      <p className="mb-4 text-sm text-ink-muted">
        התיקון ישמור תיעוד מלא של הערכים הקודמים ויחשב מחדש את ההתחשבנות.
      </p>

      <div className="grid gap-2">
        {results.map((result) => (
          <div
            key={result.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
              {result.display_name}
            </span>
            <input
              type="number"
              min={0}
              dir="ltr"
              aria-label={`ספירה מתוקנת עבור ${result.display_name}`}
              value={counts[result.table_player_id] ?? ''}
              onChange={(event) =>
                setCounts((current) => ({
                  ...current,
                  [result.table_player_id]: event.target.value,
                }))
              }
              className="ltr-num h-11 w-28 rounded-lg border border-line bg-surface px-2 text-center font-bold text-ink"
            />
          </div>
        ))}
      </div>

      <p
        className={
          'mt-3 text-center text-sm font-semibold ' +
          (check.verdict === 'BALANCED' ? 'text-profit' : 'text-warn')
        }
      >
        {check.verdict === 'BALANCED'
          ? 'הספירה תקינה ✓'
          : check.verdict === 'MISSING'
            ? `חסרים ${formatChips(Math.abs(check.difference))} ז׳יטונים בספירה`
            : `יש ${formatChips(check.difference)} ז׳יטונים יותר מהכמות שנכנסה למשחק`}
      </p>
      <p className="mt-1 text-center text-xs text-ink-faint">
        חולקו <Num>{formatChips(check.totalIssued)}</Num> · נספרו{' '}
        <Num>{formatChips(check.totalCounted)}</Num>
      </p>

      <div className="mt-5">
        <Field label="סיבת התיקון" htmlFor="correctionReason" hint="לפחות 3 תווים">
          <TextInput
            id="correctionReason"
            maxLength={500}
            placeholder="נספרו בטעות ז׳יטונים של שחקן אחר"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
