'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/profile', label: 'סקירה' },
  { href: '/profile/history', label: 'היסטוריה' },
  { href: '/profile/stats', label: 'סטטיסטיקות' },
  { href: '/profile/tables', label: 'שולחנות' },
] as const;

export function ProfileTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="ניווט פרופיל" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1.5">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-brand text-on-brand'
                    : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
