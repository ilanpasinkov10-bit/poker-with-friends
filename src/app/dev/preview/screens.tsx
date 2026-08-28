import type { ReactNode } from 'react';

import HomePage from '@/app/(nav)/page';
import JoinCodePage from '@/app/join/page';
import SignInPage from '@/app/auth/sign-in/page';
import SignUpPage from '@/app/auth/sign-up/page';

import { AppBar } from '@/components/layout/AppBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { PageShell } from '@/components/layout/PageShell';
import { JoinChoice } from '@/components/join/JoinChoice';
import { JoinTableForm } from '@/components/join/JoinTableForm';
import { LeaderboardList } from '@/components/leaderboard/LeaderboardList';
import { PeriodTabs } from '@/components/leaderboard/PeriodTabs';
import { TablePreviewCard } from '@/components/join/TablePreviewCard';
import { GroupsView } from '@/components/profile/GroupsView';
import { HistoryView } from '@/components/profile/HistoryView';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileOverview } from '@/components/profile/ProfileOverview';
import { ProfileSettingsScreen } from '@/components/profile/ProfileSettingsScreen';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { StatisticsView } from '@/components/profile/StatisticsView';
import { AppearanceControl } from '@/components/theme/AppearanceControl';
import { JoinCodeCard } from '@/components/table/JoinCodeCard';
import { LivePot } from '@/components/table/LivePot';
import { CreateTableForm } from '@/components/table/CreateTableForm';
import { LeaderboardView } from '@/components/table/LeaderboardView';
import { PlayerCard } from '@/components/table/PlayerCard';
import { TablesBrowser } from '@/components/tables/TablesBrowser';
import { FriendsScreen } from '@/components/friends/FriendsScreen';
import { TableScreen } from '@/components/table/TableScreen';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stat } from '@/components/ui/Stat';
import { computeLifetimeStats, summariseByGroup } from '@/lib/domain/stats';

import { GLOBAL_LEADERBOARD } from './fixtures';
import {
  HISTORY,
  JOIN_PREVIEW,
  LEADERBOARD,
  FRIENDS,
  INCOMING_REQUESTS,
  LEFT_PLAYERS,
  OUTGOING_REQUESTS,
  MY_TABLES,
  LONG_NAME_PLAYERS,
  SEATED_PLAYERS,
  PENDING_PLAYER,
  PENDING_REBUYS,
  PLAYERS,
  PRIVACY_SETTINGS,
  PROFILE,
  RESULT_ROWS,
  SETTLEMENT_ROWS,
  makeModel,
  playersWithCounts,
} from './fixtures';

export interface PreviewScreen {
  id: string;
  label: string;
  group: string;
  /** Extra guidance shown above the screen in the gallery chrome. */
  note?: string;
  render: () => ReactNode;
}

/** Wraps a fixture screen in the same chrome the real route provides. */
function Framed({
  title,
  subtitle,
  withNav,
  children,
}: {
  title: string;
  subtitle?: string;
  withNav?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <AppBar title={title} subtitle={subtitle} backHref="/dev/preview" />
      <PageShell withNav={withNav} belowAppBar>
        {children}
      </PageShell>
      {withNav ? <BottomNav /> : null}
    </>
  );
}

/**
 * The admin's two buttons, at their real size and without their behaviour.
 * They are what squeezes the name column on a narrow phone, so a gallery of
 * player cards is not honest without them.
 */
function FakeAdminActions() {
  return (
    <>
      <span className="grid size-10 place-items-center rounded-xl bg-brand text-xl font-black text-on-brand">
        +
      </span>
      <span className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted">
        ⋯
      </span>
    </>
  );
}

/**
 * The bottom navigation the `(nav)` layout provides in the real app. Screens
 * inside that layout no longer render it themselves, so the gallery adds it
 * here to keep a preview looking like the screen it previews.
 */
function WithNav({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}

function ProfileFrame({ children }: { children: ReactNode }) {
  const stats = computeLifetimeStats(HISTORY);
  const groups = summariseByGroup(HISTORY);
  return (
    <>
      <PageShell withNav>
        <ProfileHeader
          name={PROFILE.displayName}
          avatarUrl={PROFILE.avatarUrl}
          stats={stats}
          tableCount={groups.length}
        />
        <div className="mt-5">
          <ProfileTabs />
        </div>
        <div className="mt-5">{children}</div>
      </PageShell>
      <BottomNav />
    </>
  );
}

export const SCREENS: PreviewScreen[] = [
  // ---------------------------------------------------------------- entry
  {
    id: 'home',
    label: 'דף הבית',
    group: 'כניסה והרשמה',
    note: 'הדף האמיתי, במצב לא מחובר.',
    render: () => <HomePage />,
  },
  {
    id: 'sign-in',
    label: 'התחברות',
    group: 'כניסה והרשמה',
    render: () => <SignInPage searchParams={Promise.resolve({})} />,
  },
  {
    id: 'sign-up',
    label: 'הרשמה',
    group: 'כניסה והרשמה',
    render: () => <SignUpPage searchParams={Promise.resolve({})} />,
  },
  {
    id: 'join-code',
    label: 'הצטרפות עם קוד',
    group: 'כניסה והרשמה',
    render: () => <JoinCodePage />,
  },
  {
    id: 'join-table',
    label: 'הצטרפות לשולחן',
    group: 'כניסה והרשמה',
    note: 'המסך שרואה מי שפתח קישור הזמנה.',
    render: () => (
      <Framed title="הצטרפות לשולחן">
        <TablePreviewCard table={JOIN_PREVIEW} />
        <div className="mt-6">
          <JoinTableForm
            code="A7K92"
            tableId="preview"
            needsApproval={false}
            defaultName=""
            isSignedIn={false}
          />
        </div>
      </Framed>
    ),
  },
  {
    id: 'join-table-approval',
    label: 'הצטרפות — באישור מנהל',
    group: 'כניסה והרשמה',
    render: () => (
      <Framed title="הצטרפות לשולחן">
        <TablePreviewCard table={{ ...JOIN_PREVIEW, status: 'ACTIVE' }} />
        <div className="mt-6">
          <JoinTableForm
            code="A7K92"
            tableId="preview"
            needsApproval
            defaultName="תמר"
            isSignedIn
          />
        </div>
      </Framed>
    ),
  },
  {
    id: 'join-choice',
    label: 'הוזמנת לשולחן — בחירה',
    group: 'כניסה והרשמה',
    note: 'המסך החדש: התחברות לחשבון או כניסה כאורח.',
    render: () => (
      <Framed title="הוזמנת לשולחן">
        <TablePreviewCard table={JOIN_PREVIEW} />
        <div className="mt-6">
          <JoinChoice code="A7K92" tableId="preview" needsApproval={false} />
        </div>
      </Framed>
    ),
  },
  {
    id: 'create-table',
    label: 'פתיחת שולחן',
    group: 'כניסה והרשמה',
    render: () => (
      <Framed title="פתיחת שולחן" subtitle="הגדרות ערב הפוקר">
        <CreateTableForm defaultDate="2026-08-23" defaultStart="20:30" defaultEnd="00:30" />
      </Framed>
    ),
  },

  // ------------------------------------------------------------- live game
  {
    id: 'waiting-admin',
    label: 'חדר המתנה (מנהל)',
    group: 'משחק חי',
    note: 'לפני תחילת המשחק — קוד השולחן ושיתוף.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="ממתין להתחלה">
        <TableScreen
          model={makeModel({ status: 'WAITING', players: PLAYERS.slice(0, 3) })}
        />
      </Framed>
    ),
  },
  {
    id: 'waiting-player',
    label: 'חדר המתנה (שחקן)',
    group: 'משחק חי',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="ממתין להתחלה">
        <TableScreen
          model={makeModel({ status: 'WAITING', asAdmin: false, players: PLAYERS.slice(0, 3), viewerSeatId: 'seat-daniel' })}
        />
      </Framed>
    ),
  },
  {
    id: 'active-admin',
    label: 'משחק פעיל (מנהל)',
    group: 'משחק חי',
    note: 'לוח הבקרה המלא: סטטיסטיקות, קוד שולחן, בקשות ורשימת שחקנים.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="משחק פעיל">
        <TableScreen model={makeModel({})} />
      </Framed>
    ),
  },
  {
    id: 'active-admin-requests',
    label: 'בקשות הצטרפות וכניסה',
    group: 'משחק חי',
    note: 'בקשת הצטרפות ממתינה + שתי בקשות לכניסה נוספת.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="משחק פעיל">
        <TableScreen
          model={makeModel({
            pendingPlayers: [PENDING_PLAYER],
            pendingRequests: PENDING_REBUYS,
          })}
        />
      </Framed>
    ),
  },
  {
    id: 'cancelled',
    label: 'משחק שבוטל',
    group: 'משחק חי',
    note: 'המצב אחרי "ביטול משחק": אין התחשבנות, אין רווח והפסד, וההיסטוריה נשמרת. למנהל מוצע לפתוח שולחן חדש.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="המשחק בוטל">
        <TableScreen model={makeModel({ status: 'CANCELLED' })} />
      </Framed>
    ),
  },
  {
    id: 'live-pot',
    label: 'קופה חיה',
    group: 'משחק חי',
    note: 'הסכום שעדיין במשחק הוא הגיבור. מתחתיו הסטטיסטיקות, ותצוגה מקוצרת של הפעילות. "ראה עוד פעילות" פותח את ההיסטוריה המלאה.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="קופה חיה">
        <LivePot model={makeModel({ players: SEATED_PLAYERS, leftPlayers: LEFT_PLAYERS })} />
      </Framed>
    ),
  },
  {
    id: 'blinds-running',
    label: 'בליינדים — רץ',
    group: 'משחק חי',
    note: 'הטיימר המשותף. כל השחקנים רואים אותו; רק המנהל רואה את הכפתורים. הספירה מחושבת מהחותמת שנשמרה, לא נספרת בדפדפן — לכן היא נכונה גם אחרי שסוגרים את האפליקציה וחוזרים.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="בליינדים">
        <TableScreen model={makeModel({ blinds: 'RUNNING' })} />
      </Framed>
    ),
  },
  {
    id: 'blinds-player',
    label: 'בליינדים — שחקן',
    group: 'משחק חי',
    note: 'אותו טיימר כפי שהוא נראה לשחקן: אותם נתונים בדיוק, בלי כפתורי ניהול.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="בליינדים">
        <TableScreen model={makeModel({ blinds: 'RUNNING', asAdmin: false })} />
      </Framed>
    ),
  },
  {
    id: 'blinds-urgent',
    label: 'בליינדים — לקראת עלייה',
    group: 'משחק חי',
    note: 'פחות מדקה לעלייה. הצבע מתחלף, בלי אנימציה שתסיח את הדעת מהמשחק.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="עוד רגע עולים">
        <TableScreen model={makeModel({ blinds: 'URGENT' })} />
      </Framed>
    ),
  },
  {
    id: 'blinds-break',
    label: 'בליינדים — הפסקה',
    group: 'משחק חי',
    note: 'שלב הפסקה. כשהוא נגמר המשחק ממשיך לשלב הבא מעצמו — אף אחד לא צריך ללחוץ על כלום.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="הפסקה">
        <TableScreen model={makeModel({ blinds: 'BREAK' })} />
      </Framed>
    ),
  },
  {
    id: 'blinds-paused',
    label: 'בליינדים — מושהה',
    group: 'משחק חי',
    note: 'המנהל השהה. השעון קפוא על הזמן שנשאר, ויימשך בדיוק ממנו — גם אם רועננו את הדף באמצע.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="מושהה">
        <TableScreen model={makeModel({ blinds: 'PAUSED' })} />
      </Framed>
    ),
  },
  {
    id: 'blinds-final',
    label: 'בליינדים — שלב אחרון',
    group: 'משחק חי',
    note: 'השלב האחרון שהוגדר. הבליינדים נשארים בו — האפליקציה לא ממציאה שלב שלא הוגדר.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="שלב אחרון">
        <TableScreen model={makeModel({ blinds: 'FINAL' })} />
      </Framed>
    ),
  },
  {
    id: 'qr-join',
    label: 'שיתוף וקוד QR',
    group: 'משחק חי',
    note: 'כפתור "קוד QR" פותח מודאל עם הקוד. הוא מצביע בדיוק לקישור ההצטרפות הקיים — /join/A7K92.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="שיתוף">
        <JoinCodeCard joinCode="A7K92" tableName="פוקר של יום חמישי" />
      </Framed>
    ),
  },
  {
    id: 'active-left-players',
    label: 'שחקנים שעזבו',
    group: 'משחק חי',
    note: 'רועי ונועם השלימו עזיבה ומוצגת להם ספירה, שווי ותוצאה. מיכל שלחה ספירה שטרם אושרה, ולכן לא מוצג לה פדיון. הקופה מציגה את מה שנשאר במשחק.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="משחק פעיל">
        <TableScreen model={makeModel({ players: SEATED_PLAYERS, leftPlayers: LEFT_PLAYERS })} />
      </Framed>
    ),
  },
  {
    id: 'active-player',
    label: 'משחק פעיל (שחקן)',
    group: 'משחק חי',
    note: 'ללא כלי ניהול — רק הנתונים של השחקן וכפתור כניסה נוספת.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="משחק פעיל">
        <TableScreen model={makeModel({ asAdmin: false, viewerSeatId: 'seat-daniel' })} />
      </Framed>
    ),
  },
  {
    id: 'active-player-requested',
    label: 'שחקן — בקשה ממתינה',
    group: 'משחק חי',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="משחק פעיל">
        <TableScreen
          model={makeModel({
            asAdmin: false,
            viewerSeatId: 'seat-daniel',
            myPendingRequestId: 'req-daniel',
            pendingRequests: [PENDING_REBUYS[0]!],
          })}
        />
      </Framed>
    ),
  },
  {
    id: 'active-player-max',
    label: 'שחקן — הגיע למקסימום',
    group: 'משחק חי',
    note: '"הגעת למספר הכניסות המקסימלי" — 6 מתוך 6.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="משחק פעיל">
        <TableScreen
          model={makeModel({
            asAdmin: false,
            viewerSeatId: 'seat-daniel',
            players: PLAYERS.map((player) =>
              player.id === 'seat-daniel'
                ? { ...player, buyInCount: 6, totalPaidAgorot: 30_000, chipsIssued: 3000 }
                : player,
            ),
          })}
        />
      </Framed>
    ),
  },
  {
    id: 'active-private',
    label: 'שולחן פרטי (שחקן)',
    group: 'משחק חי',
    note: 'במצב PRIVATE שחקן רואה רק את הנתונים של עצמו.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="משחק פעיל">
        <TableScreen
          model={makeModel({ asAdmin: false, viewerSeatId: 'seat-daniel', visibility: 'PRIVATE' })}
        />
      </Framed>
    ),
  },

  // -------------------------------------------------------------- counting
  {
    id: 'counting-admin',
    label: 'ספירה — מנהל מזין',
    group: 'ספירת ז׳יטונים',
    note: 'הספירה מאוזנת: 10,000 חולקו, 10,000 נספרו.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="ספירת ז׳יטונים">
        <TableScreen
          model={makeModel({ status: 'COUNTING', players: playersWithCounts('approved') })}
        />
      </Framed>
    ),
  },
  {
    id: 'counting-mismatch',
    label: 'ספירה — חוסר התאמה',
    group: 'ספירת ז׳יטונים',
    note: '"חסרים 100 ז׳יטונים בספירה" — הסיום חסום.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="ספירת ז׳יטונים">
        <TableScreen
          model={makeModel({ status: 'COUNTING', players: playersWithCounts('mismatch') })}
        />
      </Framed>
    ),
  },
  {
    id: 'counting-partial',
    label: 'ספירה — חסרים שחקנים',
    group: 'ספירת ז׳יטונים',
    note: 'שני שחקנים עדיין לא הזינו ספירה.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="ספירת ז׳יטונים">
        <TableScreen
          model={makeModel({ status: 'COUNTING', players: playersWithCounts('partial') })}
        />
      </Framed>
    ),
  },
  {
    id: 'counting-admin-approval',
    label: 'ספירה — אישור הגשות',
    group: 'ספירת ז׳יטונים',
    note: 'מצב SELF_COUNT: השחקנים הגישו, המנהל מאשר.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="ספירת ז׳יטונים">
        <TableScreen
          model={makeModel({
            status: 'COUNTING',
            countingMode: 'SELF_COUNT',
            players: playersWithCounts('submitted'),
          })}
        />
      </Framed>
    ),
  },
  {
    id: 'counting-player',
    label: 'ספירה — שחקן מגיש',
    group: 'ספירת ז׳יטונים',
    note: '"כמה ז׳יטונים נשארו לך?"',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="ספירת ז׳יטונים">
        <TableScreen
          model={makeModel({
            status: 'COUNTING',
            asAdmin: false,
            viewerSeatId: 'seat-daniel',
            countingMode: 'SELF_COUNT',
          })}
        />
      </Framed>
    ),
  },

  // ------------------------------------------------------------- completed
  {
    id: 'results-player',
    label: 'תוצאות והתחשבנות',
    group: 'סיום והתחשבנות',
    note: 'המספרים מחושבים ב־computeFinalResults ו־computeSettlement האמיתיים.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="המשחק הסתיים">
        <TableScreen
          model={makeModel({
            status: 'COMPLETED',
            asAdmin: false,
            viewerSeatId: 'seat-daniel',
            results: RESULT_ROWS,
            settlements: SETTLEMENT_ROWS,
          })}
        />
      </Framed>
    ),
  },
  {
    id: 'results-admin',
    label: 'תוצאות (מנהל)',
    group: 'סיום והתחשבנות',
    note: 'למנהל יש סימון "שולם" ותיקון תוצאות.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="המשחק הסתיים">
        <TableScreen
          model={makeModel({
            status: 'COMPLETED',
            results: RESULT_ROWS,
            settlements: SETTLEMENT_ROWS,
          })}
        />
      </Framed>
    ),
  },
  {
    id: 'results-guest',
    label: 'תוצאות — אורח',
    group: 'סיום והתחשבנות',
    note: 'הצעת "שמור את הפרופיל שלי" לאורח בסוף המשחק.',
    render: () => (
      <Framed title="פוקר של יום חמישי" subtitle="המשחק הסתיים">
        <TableScreen
          model={makeModel({
            status: 'COMPLETED',
            asAdmin: false,
            viewerSeatId: 'seat-daniel',
            isAnonymous: true,
            results: RESULT_ROWS,
            settlements: SETTLEMENT_ROWS,
          })}
        />
      </Framed>
    ),
  },
  {
    id: 'friends',
    label: 'חברים',
    group: 'פרופיל שחקן',
    note:
      'שלוש לשוניות: החברים שלי, בקשות חברות וחיפוש. שורה אחת משותפת לכולן, ' +
      'שנשברת לשתי שורות כשאין מקום לשם ולכפתורים באותה שורה.',
    render: () => (
      <WithNav>
        <FriendsScreen
          friends={FRIENDS}
          incoming={INCOMING_REQUESTS}
          outgoing={OUTGOING_REQUESTS}
        />
      </WithNav>
    ),
  },
  {
    id: 'friends-empty',
    label: 'חברים — ריק',
    group: 'פרופיל שחקן',
    note: 'המצב ההתחלתי, לפני שנוספו חברים או התקבלו בקשות.',
    render: () => (
      <WithNav>
        <FriendsScreen friends={[]} incoming={[]} outgoing={[]} />
      </WithNav>
    ),
  },
  {
    id: 'my-tables',
    label: 'השולחנות שלי (סינון)',
    group: 'פרופיל שחקן',
    note:
      'חיפוש לפי שם, וכפתור "סינון" שפותח סטטוס ותאריך. הסינונים פועלים יחד, ' +
      'והמונה על הכפתור מונע מצב שבו סינון נשאר דולק בלי שרואים אותו.',
    render: () => (
      <Framed title="השולחנות שלי" subtitle="גלריית מסכים" withNav>
        <TablesBrowser items={MY_TABLES} />
      </Framed>
    ),
  },
  {
    id: 'global-leaderboard',
    label: 'לוח הישגים (כללי)',
    group: 'סיום והתחשבנות',
    note: 'הטאב החדש. דירוג לפי רווח ממשחקים שהסתיימו בלבד.',
    render: () => (
      <>
        <PageShell withNav>
          <div className="pt-2">
            <h1 className="text-2xl font-black tracking-tight text-ink">לוח הישגים</h1>
            <p className="mt-0.5 text-xs text-ink-faint">
              דירוג לפי רווח מצטבר ממשחקים שהסתיימו בלבד
            </p>
          </div>
          <div className="mt-4">
            <PeriodTabs current="ALL" />
          </div>
          <div className="mt-5">
            <LeaderboardList rows={GLOBAL_LEADERBOARD} />
          </div>
        </PageShell>
        <BottomNav />
      </>
    ),
  },
  {
    id: 'leaderboard',
    label: 'דירוג השולחן',
    group: 'סיום והתחשבנות',
    render: () => (
      <Framed title="דירוג השולחן" subtitle="כל המשחקים של החבר׳ה מהשכונה">
        <LeaderboardView rows={LEADERBOARD} />
      </Framed>
    ),
  },

  // --------------------------------------------------------------- profile
  {
    id: 'profile-overview',
    label: 'פרופיל — סקירה',
    group: 'פרופיל שחקן',
    note: 'כולל גרף מאזן מצטבר וגרף תוצאה לכל משחק.',
    render: () => (
      <ProfileFrame>
        <ProfileOverview games={HISTORY} />
      </ProfileFrame>
    ),
  },
  {
    id: 'profile-history',
    label: 'היסטוריית משחקים',
    group: 'פרופיל שחקן',
    render: () => (
      <ProfileFrame>
        <HistoryView games={HISTORY} page={1} hasMore />
      </ProfileFrame>
    ),
  },
  {
    id: 'profile-stats',
    label: 'סטטיסטיקות ושיאים',
    group: 'פרופיל שחקן',
    render: () => (
      <ProfileFrame>
        <StatisticsView games={HISTORY} />
      </ProfileFrame>
    ),
  },
  {
    id: 'profile-groups',
    label: 'השולחנות שלי',
    group: 'פרופיל שחקן',
    render: () => (
      <ProfileFrame>
        <GroupsView games={HISTORY} />
      </ProfileFrame>
    ),
  },
  {
    id: 'profile-settings',
    label: 'הגדרות פרופיל',
    group: 'פרופיל שחקן',
    note:
      'המסך האמיתי, עם חזרה לפרופיל בראש הדף. שם התצוגה, הצלילים והפרטיות נשמרים ' +
      'בכפתור "שמור שינויים"; התמונה, ההתראות והמראה חלים מיד.',
    render: () => (
      <WithNav>
        <ProfileSettingsScreen
          displayName={PROFILE.displayName}
          avatarUrl={PROFILE.avatarUrl}
          privacy={PRIVACY_SETTINGS}
        />
      </WithNav>
    ),
  },
  {
    id: 'appearance',
    label: 'מראה (בהיר/כהה)',
    group: 'פרופיל',
    note: 'הבורר שמופיע בהגדרות הפרופיל. הבחירה נשמרת במכשיר ומשנה את כל האפליקציה.',
    render: () => (
      <Framed title="הגדרות" subtitle="מראה">
        <section>
          <SectionTitle>מראה</SectionTitle>
          <Card className="grid gap-2">
            <AppearanceControl />
            <p className="text-xs text-ink-faint">
              הבחירה נשמרת במכשיר הזה ונשמרת גם אחרי רענון או סגירת הדפדפן.
            </p>
          </Card>
        </section>
      </Framed>
    ),
  },
  {
    id: 'profile-empty',
    label: 'פרופיל ריק',
    group: 'פרופיל שחקן',
    note: 'מצב התחלתי לפני המשחק הראשון.',
    render: () => (
      <ProfileFrame>
        <ProfileOverview games={[]} />
      </ProfileFrame>
    ),
  },

  // ------------------------------------------------------------ components
  {
    id: 'player-cards',
    label: 'כרטיסי שחקן',
    group: 'רכיבים',
    note:
      'כולל מצב "אני", מנהל שולחן, מקסימום כניסות ושולחן פרטי, ושמות ארוכים ' +
      'לצד תג התפקיד — הבדיקה שהשם אינו נחתך.',
    render: () => (
      <Framed title="כרטיסי שחקן" subtitle="גלריית רכיבים">
        <ul className="grid gap-2">
          <PlayerCard player={PLAYERS[0]!} showMoney isMe={false} maxBuyIns={6} />
          <PlayerCard player={PLAYERS[2]!} showMoney isMe maxBuyIns={6} />
          <PlayerCard
            player={{ ...PLAYERS[1]!, buyInCount: 6, totalPaidAgorot: 30_000, chipsIssued: 3000 }}
            showMoney
            isMe={false}
            maxBuyIns={6}
          />
          <PlayerCard player={PLAYERS[3]!} showMoney={false} isMe={false} maxBuyIns={6} />
        </ul>

        <div className="mt-5">
          <SectionTitle>שמות ארוכים</SectionTitle>
          <ul className="grid gap-2">
            <PlayerCard
              player={LONG_NAME_PLAYERS[0]!}
              showMoney
              isMe
              maxBuyIns={6}
              actions={<FakeAdminActions />}
            />
            <PlayerCard
              player={LONG_NAME_PLAYERS[0]!}
              showMoney
              isMe={false}
              maxBuyIns={6}
              actions={<FakeAdminActions />}
            />
            <PlayerCard player={LONG_NAME_PLAYERS[0]!} showMoney isMe={false} maxBuyIns={6} />
            <PlayerCard player={LONG_NAME_PLAYERS[1]!} showMoney isMe={false} maxBuyIns={6} />
            <PlayerCard player={LONG_NAME_PLAYERS[2]!} showMoney isMe={false} maxBuyIns={6} />
          </ul>
        </div>
      </Framed>
    ),
  },
  {
    id: 'avatars',
    label: 'תמונות ואווטארים',
    group: 'רכיבים',
    note: 'עם תמונה שהועלתה ובלעדיה (ראשי תיבות בעברית).',
    render: () => (
      <Framed title="תמונות פרופיל" subtitle="גלריית רכיבים">
        <Card className="grid gap-5">
          <div className="flex items-end gap-3">
            <Avatar name="אילן כהן" src={PROFILE.avatarUrl} size="xl" ring />
            <Avatar name="אילן כהן" src={PROFILE.avatarUrl} size="lg" />
            <Avatar name="אילן כהן" src={PROFILE.avatarUrl} size="md" />
            <Avatar name="אילן כהן" src={PROFILE.avatarUrl} size="sm" />
          </div>
          <div className="flex items-end gap-3">
            <Avatar name="אילן כהן" size="xl" ring />
            <Avatar name="שי לוי" size="lg" />
            <Avatar name="דניאל" size="md" />
            <Avatar name="רועי" size="sm" />
          </div>
        </Card>
      </Framed>
    ),
  },
  {
    id: 'ui-kit',
    label: 'כפתורים, תגיות ומצבים',
    group: 'רכיבים',
    render: () => (
      <Framed title="ערכת רכיבים" subtitle="גלריית רכיבים">
        <div className="grid gap-5">
          <Card className="grid gap-2">
            <Button block>פעולה ראשית</Button>
            <Button variant="secondary" block>
              פעולה משנית
            </Button>
            <Button variant="success" block>
              אשר
            </Button>
            <Button variant="warn" block>
              סיים משחק
            </Button>
            <Button variant="danger" block>
              דחה
            </Button>
            <Button variant="ghost" block>
              פעולה שקטה
            </Button>
            <Button block loading>
              נשמר…
            </Button>
            <Button block disabled>
              לא זמין
            </Button>
          </Card>

          <Card className="flex flex-wrap gap-2">
            <Badge tone="neutral" dot>ממתין להתחלה</Badge>
            <Badge tone="profit" dot>משחק פעיל</Badge>
            <Badge tone="warn" dot>ספירת ז׳יטונים</Badge>
            <Badge tone="brand" dot>המשחק הסתיים</Badge>
            <Badge tone="loss" dot>המשחק בוטל</Badge>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="שחקנים" value={6} sub="שישה שחקנים" />
            <Stat label="כניסות" value={20} />
            <Stat label="בקופה" value="1,000₪" tone="brand" />
            <Stat label="תוצאה" value="+100₪" tone="profit" />
          </div>

          <EmptyState
            emoji="🪑"
            title="עוד אין שחקנים"
            description="שתפו את קוד השולחן כדי שהחברים יצטרפו."
          />
        </div>
      </Framed>
    ),
  },
];

export function findScreen(id: string | undefined): PreviewScreen | undefined {
  return SCREENS.find((screen) => screen.id === id);
}
