'use client';

import { Modal } from '@/components/ui/Modal';
import { EVENT_ICON, eventSentence, type TableEvent } from '@/lib/domain/events';
import { formatDateTime } from '@/lib/format';

/**
 * The table's full activity history.
 *
 * A bottom sheet on a phone and a centred dialog on a wider screen, because
 * `Modal` already is one — this is where the history goes so that the live pot
 * can stay short enough to read at a glance without losing anything.
 *
 * The list scrolls inside the sheet rather than the page: on a phone that
 * keeps the title and the close button reachable however long the history
 * grows, and it is the reason the sheet is capped in height at all.
 */
export function ActivityHistorySheet({
  open,
  onClose,
  events,
}: {
  open: boolean;
  onClose: () => void;
  events: readonly TableEvent[];
}) {
  return (
    <Modal open={open} onClose={onClose} title="פעילות בשולחן" size="lg">
      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">עוד לא קרה כלום בשולחן.</p>
      ) : (
        <ol
          // `overscroll-contain` stops a flick at the end of the list from
          // scrolling the page behind the sheet, which on iOS otherwise feels
          // like the sheet is about to be dismissed.
          className="-mx-1 max-h-[60vh] overflow-y-auto overscroll-contain px-1"
        >
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-start gap-2.5 border-b border-line-soft py-2.5 last:border-b-0"
            >
              <span aria-hidden className="shrink-0 leading-6">
                {EVENT_ICON[event.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{eventSentence(event)}</p>
                <p className="ltr-num mt-0.5 text-[0.7rem] text-ink-faint">
                  {formatDateTime(event.at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
