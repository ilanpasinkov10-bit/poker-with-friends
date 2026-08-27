/**
 * The profile screen and its tabs.
 *
 * This layout lives in a route group so that it covers /profile and its tabs
 * without covering /profile/settings. The URLs are unchanged — a group adds no
 * path segment — but settings is a destination you arrive at *from* the
 * profile and leave again, so it gets its own header and back action rather
 * than the summary card and the tab strip of the screen it sits under.
 */
import { PageShell } from '@/components/layout/PageShell';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { getOwnProfile, requireRegisteredUserId } from '@/lib/auth';
import { computeLifetimeStats, summariseByGroup } from '@/lib/domain/stats';
import { loadPlayerHistory } from '@/lib/data/profile';
import { countIncomingRequests } from '@/lib/data/friends';

export const dynamic = 'force-dynamic';

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRegisteredUserId('/profile');
  // Three independent reads, so they go together rather than one after the
  // other. The profile row used to come back as part of the session check and
  // therefore in front of these; it is the viewer's name and picture, not a
  // permission, and nothing here waits on it.
  const [profile, { games }, pendingRequests] = await Promise.all([
    getOwnProfile(user.id),
    loadPlayerHistory(user.id),
    countIncomingRequests(user.id),
  ]);
  const stats = computeLifetimeStats(games);
  const groups = summariseByGroup(games);

  return (
    <>
      <PageShell withNav>
        <ProfileHeader
          name={profile?.display_name ?? 'שחקן'}
          avatarUrl={profile?.avatar_url ?? null}
          stats={stats}
          tableCount={groups.length}
          pendingRequests={pendingRequests}
        />
        <div className="mt-5">
          <ProfileTabs />
        </div>
        <div className="mt-5">{children}</div>
      </PageShell>
    </>
  );
}
