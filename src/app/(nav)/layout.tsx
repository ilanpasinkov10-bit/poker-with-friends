import { BottomNav } from '@/components/layout/BottomNav';

/**
 * The four screens the bottom navigation reaches, and the navigation itself.
 *
 * The point of this layout is that it does not re-render when you move between
 * those screens. A `loading.tsx` replaces the *children* of the segment it sits
 * in, so anything rendered here — the navigation — survives a route change and
 * everything the skeleton covers is only ever the content area.
 *
 * Before this, every screen rendered its own copy of the navigation, which put
 * it inside the part React swaps out. Tapping "בית" from the tables list
 * replaced the whole page, navigation included, with a bare skeleton: the app
 * visibly blinked out and back on a route change that should have felt like
 * moving between tabs.
 */
export default function NavLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
