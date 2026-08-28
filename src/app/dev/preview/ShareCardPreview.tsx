'use client';

import { useEffect, useState } from 'react';
import { buildShareCard, type ShareCardModel } from '@/lib/domain/share-card';
import { renderShareCard, type ShareCardKind } from '@/lib/share/render';
import type { GameResultRow, PokerTableRow } from '@/types/database';

/**
 * The real generated images, in the gallery.
 *
 * Not a mock-up of the card: this calls the same renderer the share sheet
 * calls, so what is on screen here is the PNG a player would send.
 */
export function ShareCardPreview({
  cases,
}: {
  cases: Array<{
    label: string;
    kind: ShareCardKind;
    table: Pick<PokerTableRow, 'game_date' | 'started_at' | 'completed_at' | 'created_at'>;
    results: GameResultRow[];
  }>;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    (async () => {
      for (const one of cases) {
        const model: ShareCardModel | null = buildShareCard(one.table, one.results);
        if (!model) continue;
        const blob = await renderShareCard(model, one.kind);
        if (!alive) return;
        const url = URL.createObjectURL(blob);
        made.push(url);
        setUrls((current) => ({ ...current, [one.label]: url }));
      }
    })();
    return () => {
      alive = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [cases]);

  return (
    <div className="grid gap-6">
      {cases.map((one) => (
        <figure key={one.label} className="grid gap-2">
          <figcaption className="text-sm font-semibold text-ink-muted">{one.label}</figcaption>
          {urls[one.label] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={urls[one.label]}
              alt={one.label}
              data-share-card={one.label}
              className="w-full rounded-2xl border border-line"
            />
          ) : (
            <div className="grid h-64 place-items-center rounded-2xl border border-line text-xs text-ink-faint">
              מכינים…
            </div>
          )}
        </figure>
      ))}
    </div>
  );
}
