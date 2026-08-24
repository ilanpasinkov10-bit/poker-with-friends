'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/', label: 'בית', icon: '🏠' },
  { href: '/tables', label: 'השולחנות שלי', icon: '🎴' },
  { href: '/profile', label: 'הפרופיל', icon: '👤' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ניווט ראשי"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface/95 pt-1 backdrop-blur"
    >
      <ul className="app-shell flex items-stretch justify-around px-2">
        {ITEMS.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.7rem] font-semibold transition-colors',
                  active ? 'text-brand-ink' : 'text-ink-faint hover:text-ink-muted',
                )}
              >
                <span aria-hidden className="text-lg leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
