'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Num } from '@/components/ui/Num';
import { joinPath } from '@/lib/domain/join-link';

/**
 * A QR code for the table's existing join link.
 *
 * It encodes `/join/<code>` — the same URL the share button copies — so
 * scanning it goes through exactly the same join flow, with the same approval
 * rules and the same guest handling. There is no second way into a table.
 *
 * The generator is imported lazily, only once the modal is opened: it is the
 * largest thing on this screen by some margin, and most sessions never open it.
 *
 * The code is drawn as an SVG rather than a canvas so it stays sharp at any
 * size and prints cleanly, and it is rendered on a permanent white plate —
 * scanners need the light-module/dark-module contrast, so it must not follow
 * the app's theme.
 */
export function QrJoinModal({
  open,
  onClose,
  tableName,
  joinCode,
  joinUrl,
}: {
  open: boolean;
  onClose: () => void;
  tableName: string;
  joinCode: string;
  joinUrl: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !joinUrl) return;
    let cancelled = false;

    void (async () => {
      try {
        const { toString: toQrString } = await import('qrcode');
        const markup = await toQrString(joinUrl, {
          type: 'svg',
          margin: 1,
          // Medium recovery: enough to survive a phone screen's glare and a
          // slightly bent print, without inflating the module count.
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (!cancelled) setSvg(markup);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, joinUrl]);

  return (
    <Modal open={open} onClose={onClose} title="הצטרפות בסריקה">
      <div className="text-center">
        <p className="truncate text-base font-bold text-ink">{tableName}</p>
        <p className="mt-0.5 text-xs text-ink-faint">סרקו כדי להצטרף לשולחן</p>

        <div className="mx-auto mt-4 w-full max-w-[16rem]">
          {svg ? (
            <div
              // The plate is always white: a QR inverted by dark mode does not
              // scan on many readers.
              className="aspect-square w-full rounded-2xl bg-white p-3 [&>svg]:size-full"
              // The markup is generated in this component from a URL we built,
              // never from user input.
              dangerouslySetInnerHTML={{ __html: svg }}
              role="img"
              aria-label={`קוד QR להצטרפות לשולחן ${tableName}`}
            />
          ) : failed ? (
            <div className="grid aspect-square w-full place-items-center rounded-2xl bg-surface-2 px-4 text-sm text-ink-muted">
              לא הצלחנו ליצור את הקוד. אפשר לשתף את הקישור במקום.
            </div>
          ) : (
            <div
              className="aspect-square w-full animate-pulse rounded-2xl bg-surface-2"
              aria-hidden
            />
          )}
        </div>

        <p className="mt-4 text-xs text-ink-faint">קוד שולחן</p>
        <p className="ltr-num text-2xl font-black tracking-[0.25em] text-brand-ink">{joinCode}</p>

        <p className="mt-3 text-[0.7rem] text-ink-faint">
          מי שסורק מגיע ישירות לעמוד ההצטרפות של השולחן. אפשר גם להקליד את הקוד ידנית בכתובת{' '}
          <Num>{joinPath(joinCode)}</Num>
        </p>
      </div>
    </Modal>
  );
}
