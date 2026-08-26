import Link from 'next/link';
import { PendingLink } from '@/components/layout/PendingLink';
import { PageShell } from '@/components/layout/PageShell';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Num } from '@/components/ui/Num';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDate, formatMoney } from '@/lib/format';
import { isSupabaseConfigured } from '@/lib/env';
import { TABLE_STATUS_LABEL, TABLE_STATUS_TONE } from '@/lib/labels';
import type { PokerTableRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const user = await getSessionUser();
  const liveTables = user ? await loadLiveTables() : [];

  return (
    <>
      <PageShell withNav>
        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            <p className="text-sm text-ink-faint">
              {user?.profile ? `היי, ${user.profile.display_name}` : 'ברוכים הבאים'}
            </p>
            <h1 className="text-2xl font-black tracking-tight text-ink">ערב הפוקר שלכם</h1>
          </div>
          {user ? (
            <PendingLink href="/profile" aria-label="הפרופיל שלי" spinner={false}>
              <Avatar
                name={user.profile?.display_name ?? 'שחקן'}
                src={user.profile?.avatar_url}
                ring
              />
            </PendingLink>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3">
          <Link
            href="/table/new"
            className="card-grad group flex items-center gap-4 rounded-3xl border border-brand/30 bg-surface p-5 transition-colors hover:border-brand/60"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand text-2xl">
              ♠
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-ink">פתח שולחן</span>
              <span className="block text-sm text-ink-faint">
                נהלו את הכניסות, הז׳יטונים וההתחשבנות
              </span>
            </span>
          </Link>

          <Link
            href="/join"
            className="group flex items-center gap-4 rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-line/80"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-3 text-2xl">
              ♦
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-ink">הצטרף לשולחן</span>
              <span className="block text-sm text-ink-faint">
                יש לכם קוד שולחן? אפשר להיכנס גם בלי חשבון
              </span>
            </span>
          </Link>
        </div>

        {liveTables.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-base font-bold text-ink">משחקים פעילים</h2>
            <ul className="grid gap-2">
              {liveTables.map((table) => (
                <li key={table.id}>
                  <Link
                    href={`/table/${table.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-line-soft bg-surface p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink">{table.name}</p>
                      <p className="text-xs text-ink-faint">
                        {formatDate(table.game_date)} · כניסה{' '}
                        <Num>{formatMoney(table.buy_in_agorot)}</Num>
                      </p>
                    </div>
                    <Badge tone={TABLE_STATUS_TONE[table.status]} dot>
                      {TABLE_STATUS_LABEL[table.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!user ? (
          <p className="mt-8 text-center text-sm text-ink-faint">
            כבר יש לכם חשבון?{' '}
            <Link href="/auth/sign-in" className="font-semibold text-brand-ink">
              התחברות
            </Link>
          </p>
        ) : null}

        <HowItWorks />
      </PageShell>
    </>
  );
}

async function loadLiveTables(): Promise<PokerTableRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('poker_tables')
    .select('*')
    .in('status', ['WAITING', 'ACTIVE', 'COUNTING'])
    .order('planned_start_at', { ascending: false })
    .limit(5);
  return (data ?? []) as PokerTableRow[];
}

function HowItWorks() {
  const steps = [
    { title: 'פותחים שולחן', text: 'מגדירים כניסה, ז׳יטונים ושעת סיום' },
    { title: 'החברים מצטרפים', text: 'עם קוד קצר או קישור — גם בלי חשבון' },
    { title: 'משחקים', text: 'מאשרים כניסות נוספות בלחיצה' },
    { title: 'סופרים ומתחשבנים', text: 'האפליקציה מחשבת מי מעביר למי' },
  ];
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-ink-muted">איך זה עובד</h2>
      <ol className="grid gap-2">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-xl bg-surface/60 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-brand-ink">
              <Num>{index + 1}</Num>
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">{step.title}</span>
              <span className="block text-xs text-ink-faint">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-center text-[0.7rem] text-ink-faint">
        האפליקציה מנהלת משחק פוקר פיזי בין חברים — אתם יושבים ומשחקים, והיא סופרת את הכסף.
      </p>
    </section>
  );
}

function NotConfigured() {
  return (
    <PageShell>
      <div className="mt-12 rounded-2xl border border-warn/30 bg-warn-soft p-5 text-center">
        <p className="text-lg font-bold text-warn">האפליקציה עדיין לא חוברה ל‑Supabase</p>
        <p className="mt-2 text-sm text-ink-muted">
          העתיקו את <code className="ltr-num">.env.example</code> אל{' '}
          <code className="ltr-num">.env.local</code> והזינו את פרטי הפרויקט. ההוראות המלאות נמצאות
          בקובץ <code className="ltr-num">docs/SETUP.md</code>.
        </p>
      </div>
    </PageShell>
  );
}
