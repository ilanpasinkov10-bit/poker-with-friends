'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-profit/40 bg-profit-soft text-profit',
  error: 'border-loss/40 bg-loss-soft text-loss',
  info: 'border-line bg-surface-3 text-ink',
};

const TONE_ICON: Record<ToastTone, string> = { success: '✓', error: '!', info: 'i' };

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++;
    setItems((current) => [...current, { id, tone, message }]);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 4200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-24 sm:pb-6"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'animate-rise pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg shadow-black/40',
              TONE_CLASS[item.tone],
            )}
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-current/15 text-xs">
              {TONE_ICON[item.tone]}
            </span>
            <span className="min-w-0 flex-1">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
