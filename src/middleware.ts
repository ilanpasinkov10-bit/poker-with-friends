import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Keeps the Supabase session (registered and guest alike) fresh, and hard-blocks
 * the development-only preview gallery outside development.
 *
 * The gallery page also calls notFound() itself, but a streamed response has
 * already sent its 200 by the time React gets there. Refusing here means the
 * route never reaches the renderer and returns a real 404.
 */
export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && request.nextUrl.pathname.startsWith('/dev')) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
