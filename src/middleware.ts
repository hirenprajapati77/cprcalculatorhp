import { env } from '@/config/env';
import { isCronSecretExemptApiPath } from '@/lib/api-auth-exemptions';
import { hashToken, timingSafeEqual } from '@/lib/auth-token';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** PWA + public static assets must stay ungated — SW registration cannot follow an auth redirect. */
function isPublicStaticAsset(pathname: string): boolean {
  // Never exempt API routes — even if they end in a static extension (e.g. /api/x.png spoof)
  if (pathname.startsWith('/api/')) return false;
  if (
    pathname === '/sw.js' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/offline' ||
    pathname.startsWith('/icons/')
  ) {
    return true;
  }
  return /\.(?:png|svg|jpg|jpeg|webp|ico|woff2?)$/i.test(pathname);
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  if (isPublicStaticAsset(url.pathname)) {
    return NextResponse.next();
  }

  const expectedToken = env.APP_ACCESS_TOKEN?.trim();
  const expectedHash = expectedToken ? await hashToken(expectedToken) : '';

  // 1. Gate /settings/debug
  if (url.pathname.startsWith('/settings/debug')) {
    if (env.NODE_ENV === 'production' && env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL !== 'true') {
      url.pathname = '/404';
      return NextResponse.rewrite(url);
    }
  }

  // 2. Gate Page Routes — Redirect unauthenticated requests to /unlock
  const normalizedPath = url.pathname.replace(/\/$/, '') || '/';
  const isPublicPage =
    normalizedPath === '/unlock' ||
    normalizedPath === '/about' ||
    normalizedPath === '/faq' ||
    normalizedPath === '/offline' ||
    normalizedPath.startsWith('/share');

  if (!url.pathname.startsWith('/api/') && expectedToken && !isPublicPage) {
    const existing = request.cookies.get('app_access_token')?.value;
    const isValid = existing && (timingSafeEqual(existing, expectedHash) || timingSafeEqual(existing, expectedToken));
    if (!isValid) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/unlock';
      // Clear query params to prevent bypass/confusion
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 3. Gate /api routes
  if (url.pathname.startsWith('/api/')) {
    // Exempt public routes + cron-secret refresh + auth endpoints
    // NOTE: /api/broker/fyers/login is intentionally NOT exempt — anyone who
    // can start OAuth could overwrite the production Fyers broker token.
    // Callback stays exempt (OAuth return cannot send the session cookie).
    if (
      url.pathname.startsWith('/api/health') ||
      url.pathname.startsWith('/api/market-tools/breadth') ||
      url.pathname.startsWith('/api/market-tools/breakout') ||
      isCronSecretExemptApiPath(url.pathname) ||
      url.pathname.startsWith('/api/broker/fyers/callback') ||
      url.pathname.startsWith('/api/share/') ||
      url.pathname === '/api/auth/unlock' ||
      url.pathname === '/api/auth/logout'
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
      } else if (authCookie && (timingSafeEqual(authCookie, expectedHash) || timingSafeEqual(authCookie, expectedToken))) {
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
  // Always run on /api/* (even spoofed extensions like /api/x.png).
  // Pages: skip Next internals, PWA assets, and common static files.
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
