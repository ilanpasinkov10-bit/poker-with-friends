'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { useToast } from '@/components/ui/Toast';
import { formatChips, formatMoney } from '@/lib/format';
import { buyInsWord } from '@/lib/labels';
import { canAdminAddBuyIn } from '@/lib/domain/permissions';
import { adminAddBuyInAction, reverseBuyInAction } from '@/lib/actions/buyins';
import { removePlayerAction } from '@/lib/actions/players';
import type { PlayerView } from '@/lib/data/table';
import type { TableStatus } from '@/types/database';

export function AdminPlayerActions({
  tableId,
  player,
  maxBuyIns,
  buyInAgorot,
  chipsPerBuyIn,
  tableStatus,
  adminUserId,
}: {
  tableId: string;
  player: PlayerView;
  maxBuyIns: number;
  buyInAgorot: number;
  chipsPerBuyIn: number;
  tableStatus: TableStatus;
  adminUserId: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const atMax = player.buyInCount >= maxBuyIns;
  const canAdd = canAdminAddBuyIn(
    { userId: adminUserId, isTableAdmin: true },
    {
      tablePlayerId: player.id,
      ownerUserId: player.userId,
      status: player.status,
      buyInCount: player.buyInCount,
    },
    { status: tableStatus, maxBuyIns },
  );

  const addBuyIn = () =>
    startTransition(async () => {
      const result = await adminAddBuyInAction(tableId, player.id);
      if (!result.ok) toast.error(result.message);
      else toast.success(`נוספה כניסה ל${player.displayName}`);
      setMenuOpen(false);
    });

  const reverse = () =>
    startTransition(async () => {
      if (!player.lastReversibleTxId) return;
      const result = await reverseBuyInAction(tableId, player.lastReversibleTxId);
      if (!result.ok) toast.error(result.message);
      else toast.success('הכניסה בוטלה');
      setConfirmReverse(false);
      setMenuOpen(false);
    });

  const remove = () =>
    startTransition(async () => {
      const result = await removePlayerAction(tableId, player.id);
      if (!result.ok) toast.error(result.message);
      else toast.success('השחקן הוסר מהשולחן');
      setConfirmRemove(false);
      setMenuOpen(false);
    });



  return (
    <>
      <button
        type="button"
        onClick={addBuyIn}
        disabled={pending || !canAdd}
        aria-label={`הוסף כניסה ל${player.displayName}`}
        className="grid size-10 place-items-center rounded-xl bg-brand text-xl font-black text-white disabled:opacity-40"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={`פעולות נוספות עבור ${player.displayName}`}
        className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted"
      >
        ⋯
      </button>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={player.displayName}>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <MiniStat label="כניסות" value={<Num>{player.buyInCount}</Num>} />
          <MiniStat label="השקעה" value={<Num>{formatMoney(player.totalPaidAgorot)}</Num>} />
          <MiniStat label="ז׳יטונים" value={<Num>{formatChips(player.chipsIssued)}</Num>} />
        </div>

        <div className="grid gap-2">
          <Button block loading={pending} disabled={!canAdd} onClick={addBuyIn}>
            הוסף כניסה (<Num>{formatMoney(buyInAgorot)}</Num> · <Num>{formatChips(chipsPerBuyIn)}</Num>)
          </Button>
          {atMax ? (
            <p className="text-center text-xs font-semibold text-warn">
              השחקן הגיע למספר הכניסות המקסימלי (<Num>{buyInsWord(maxBuyIns)}</Num>)
            </p>
          ) : null}

          <Button
            variant="warn"
            block
            disabled={!player.lastReversibleTxId}
            onClick={() => setConfirmReverse(true)}
          >
            בטל את הכניסה האחרונה
          </Button>

          <Button
            variant="danger"
            block
            disabled={player.buyInCount > 0}
            onClick={() => setConfirmRemove(true)}
          >
            הסר מהשולחן
          </Button>
          {player.buyInCount > 0 ? (
            <p className="text-center text-xs text-ink-faint">
              לא ניתן להסיר שחקן שכבר נכנס למשחק — בטלו קודם את הכניסות שלו.
            </p>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmReverse}
        title="לבטל את הכניסה האחרונה?"
        message={
          <>
            נבטל כניסה אחת של {player.displayName}: <Num>{formatMoney(buyInAgorot)}</Num> ו־
            <Num>{formatChips(chipsPerBuyIn)}</Num> ז׳יטונים. הביטול נרשם כתנועה נפרדת ונשמר
            בהיסטוריה.
          </>
        }
        confirmLabel="בטל כניסה"
        tone="danger"
        loading={pending}
        onConfirm={reverse}
        onCancel={() => setConfirmReverse(false)}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="להסיר את השחקן?"
        message={`${player.displayName} יוסר מהשולחן ולא יוכל להמשיך לשחק.`}
        confirmLabel="הסר"
        tone="danger"
        loading={pending}
        onConfirm={remove}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2">
      <p className="text-[0.65rem] text-ink-faint">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
