import { env } from '@/config/env';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const expectedToken = env.APP_ACCESS_TOKEN?.trim();

  // 1. Gate /settings/debug
  if (url.pathname.startsWith('/settings/debug')) {
    if (env.NODE_ENV === 'production' && env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL !== 'true') {
      url.pathname = '/404';
      return NextResponse.rewrite(url);
    }
  }

  // 2. For page routes (non-API, non-static), automatically set the access token
  //    cookie so that browser-initiated API calls are authenticated.
  if (!url.pathname.startsWith('/api/') && expectedToken) {
    const existing = request.cookies.get('app_access_token')?.value;
    // Only set if missing or stale to avoid rewriting on every request
    if (!existing || !timingSafeEqual(existing, expectedToken)) {
      const res = NextResponse.next();
      res.cookies.set('app_access_token', expectedToken, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        secure: url.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
      return res;
    }
    return NextResponse.next();
  }

  // 3. Gate /api routes
  if (url.pathname.startsWith('/api/')) {
    // Exempt public routes
    if (
      url.pathname.startsWith('/api/health') ||
      url.pathname.startsWith('/api/cron/') ||
      url.pathname.startsWith('/api/broker/fyers/callback') ||
      url.pathname.startsWith('/api/broker/fyers/login') ||
      url.pathname.startsWith('/api/share/')
    ) {
      return NextResponse.next();
    }

    // APP_ACCESS_TOKEN: required in production (env.ts also fail-fasts at import).
    // Reject unauthenticated API calls over plain HTTP when a token is configured;
    // in production, missing token is treated as unauthorized (defense in depth).
    if (env.NODE_ENV === 'production' && !expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (expectedToken) {
      const authHeader = request.headers.get('authorization');
      const authCookie = request.cookies.get('app_access_token')?.value;

      let isAuth = false;
      if (authHeader && timingSafeEqual(authHeader, `Bearer ${expectedToken}`)) {
        isAuth = true;
      } else if (authCookie && timingSafeEqual(authCookie, expectedToken)) {
        isAuth = true;
      }

      if (!isAuth) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
