import { notFound } from 'next/navigation';
import { PreviewChrome } from './PreviewChrome';
import { SCREENS, findScreen } from './screens';

/**
 * Development-only visual gallery of every major screen and state, rendered
 * from the real components with static fixture props.
 *
 * It is not part of the product: it returns notFound() outside development, it
 * reads no data, and no production module imports anything from this folder.
 * Interactive controls that would call a server action are inert without a
 * backend — modals and local component state still work.
 */
export const dynamic = 'force-dynamic';

export default async function DevPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string; bare?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const params = await searchParams;
  const screen = findScreen(params.screen) ?? SCREENS[0]!;
  const bare = params.bare === '1';

  if (bare) return <>{screen.render()}</>;

  return (
    <PreviewChrome
      screens={SCREENS.map(({ id, label, group }) => ({ id, label, group }))}
      current={screen.id}
      note={screen.note}
    >
      {screen.render()}
    </PreviewChrome>
  );
}
