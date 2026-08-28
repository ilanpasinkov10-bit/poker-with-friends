'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { buildShareCard, type ShareCardModel } from '@/lib/domain/share-card';
import type { ShareCardKind } from '@/lib/share/render';
import type { GameResultRow, PokerTableRow } from '@/types/database';

/**
 * Sharing the night as a picture.
 *
 * Nothing here runs until the button is pressed. The renderer is a dynamic
 * import, so the drawing code and the canvas work stay out of the table screen
 * entirely — a player who never shares anything downloads none of it, and the
 * results screen weighs exactly what it weighed before this existed.
 *
 * The card is built from the frozen `game_results` rows the screen already
 * has. There is no new query and no new endpoint: the data was already on this
 * page, having already passed the checks that let the viewer read the game at
 * all, so there is no second door to guard.
 */

const TABS: Array<{ kind: ShareCardKind; label: string }> = [
  { kind: 'QUICK', label: 'סיכום קצר' },
  { kind: 'FULL', label: 'תוצאות מלאות' },
];

interface Card {
  url: string;
  file: File;
}

export function ShareSummary({
  table,
  results,
}: {
  table: PokerTableRow;
  results: GameResultRow[];
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ShareCardKind>('QUICK');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [failed, setFailed] = useState(false);
  // One entry per card type. A finished game does not change, so a card that
  // has been drawn once is simply kept — switching back and forth costs
  // nothing, and neither does opening the sheet again.
  const cards = useRef(new Map<ShareCardKind, Card>());
  const [, forceRender] = useState(0);

  const model: ShareCardModel | null = buildShareCard(table, results);

  const release = useCallback(() => {
    for (const card of cards.current.values()) URL.revokeObjectURL(card.url);
    cards.current.clear();
  }, []);

  // The bitmaps are megabytes each; they go when the screen does.
  useEffect(() => release, [release]);

  const generate = useCallback(
    async (want: ShareCardKind) => {
      if (!model || cards.current.has(want)) return;
      setBusy(true);
      setFailed(false);
      try {
        const [{ renderShareCard }, { fileFromBlob, shareFileName }] = await Promise.all([
          import('@/lib/share/render'),
          import('@/lib/share/share'),
        ]);
        const blob = await renderShareCard(model, want);
        const file = fileFromBlob(blob, shareFileName(model.playedOn, want));
        cards.current.set(want, { url: URL.createObjectURL(blob), file });
        forceRender((n) => n + 1);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [model],
  );

  useEffect(() => {
    if (open) void generate(kind);
  }, [open, kind, generate]);

  if (!model) return null;

  const card = cards.current.get(kind);

  const share = async () => {
    if (!card) return;
    setSharing(true);
    try {
      const { shareOrSave } = await import('@/lib/share/share');
      const outcome = await shareOrSave(card.file, 'ערב פוקר · Poker With Friends');
      if (outcome === 'DOWNLOADED') toast.success('התמונה נשמרה');
      if (outcome === 'FAILED') toast.error('לא הצלחנו לשתף את התמונה. נסו שוב.');
      // A cancelled share sheet is not a failure and says nothing.
    } finally {
      setSharing(false);
    }
  };

  const save = async () => {
    if (!card) return;
    const { download } = await import('@/lib/share/share');
    if (download(card.file)) toast.success('התמונה נשמרה');
    else toast.error('לא הצלחנו לשמור את התמונה');
  };

  return (
    <>
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        <span className="inline-flex items-center gap-2">
          <ShareIcon />
          שתף סיכום משחק
        </span>
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="שיתוף סיכום המשחק" size="lg">
        <div role="tablist" className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.kind}
              type="button"
              role="tab"
              aria-selected={kind === tab.kind}
              onClick={() => setKind(tab.kind)}
              className={cn(
                'h-10 rounded-lg text-sm font-bold transition-colors',
                kind === tab.kind ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid place-items-center rounded-2xl border border-line-soft bg-surface-2 p-3">
          {card ? (
            // next/image optimises images it can fetch and resize on a server.
            // This one is a blob: URL made in this tab a moment ago, at a size
            // this component chose, and it never travels anywhere.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.url}
              alt="תצוגה מקדימה של סיכום המשחק"
              className="max-h-[52vh] w-auto rounded-xl"
            />
          ) : (
            <div className="grid h-[52vh] w-full place-items-center text-sm text-ink-faint">
              {failed ? 'לא הצלחנו ליצור את התמונה' : busy ? 'מכינים את התמונה…' : ''}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2">
          <Button block onClick={share} loading={sharing} disabled={!card || busy}>
            שתף
          </Button>
          <Button variant="secondary" block onClick={save} disabled={!card || busy}>
            שמור תמונה
          </Button>
        </div>
      </Modal>
    </>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M12 3v13M12 3 8 7M12 3l4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
