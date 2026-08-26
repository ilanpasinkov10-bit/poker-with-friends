import { RouteSkeleton } from '@/components/layout/RouteSkeleton';

/** A table is opened from a list, not from the bottom nav, so it has no nav. */
export default function Loading() {
  return <RouteSkeleton rows={5} withNav={false} />;
}
