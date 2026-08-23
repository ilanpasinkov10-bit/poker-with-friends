'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Bottom sheet on phones, centred dialog on wider screens. Rendered inside the
 * RTL document so its content direction is inherited correctly.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="סגירה"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'animate-rise relative z-10 w-full overflow-hidden rounded-t-3xl border border-line bg-surface',
          'sm:rounded-3xl',
          size === 'lg' ? 'sm:max-w-lg' : 'sm:max-w-md',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3.5">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="grid size-8 place-items-center rounded-full bg-surface-3 text-ink-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="safe-bottom border-t border-line-soft bg-surface-2 px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel = 'ביטול',
  tone = 'primary',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-sm leading-relaxed text-ink-muted">{message}</div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-xl border border-line bg-surface-3 font-semibold text-ink"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            'h-11 rounded-xl font-semibold disabled:opacity-60',
            tone === 'danger' ? 'bg-loss text-[#2b0a13]' : 'bg-brand text-white',
          )}
        >
          {loading ? '…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
