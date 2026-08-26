/**
 * The profile screen and its tabs.
 *
 * This layout lives in a route group so that it covers /profile and its tabs
 * without covering /profile/settings. The URLs are unchanged — a group adds no
 * path segment — but settings is a destination you arrive at *from* the
 * profile and leave again, so it gets its own header and back action rather
 * than the summary card and the tab strip of the screen it sits under.
 */
import { BottomNav } from '@/components/layout/BottomNav';
import { PageShell } from '@/components/layout/PageShell';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { requireRegisteredUser } from '@/lib/auth';
import { computeLifetimeStats, summariseByGroup } from '@/lib/domain/stats';
import { loadPlayerHistory } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRegisteredUser('/profile');
  const { games } = await loadPlayerHistory(user.id);
  const stats = computeLifetimeStats(games);
  const groups = summariseByGroup(games);

  return (
    <>
      <PageShell withNav>
        <ProfileHeader
          name={user.profile?.display_name ?? 'שחקן'}
          avatarUrl={user.profile?.avatar_url ?? null}
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
