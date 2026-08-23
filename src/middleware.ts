import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/** Keeps the Supabase session (registered and guest alike) fresh. */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
