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
  
  // 1. Gate /settings/debug
  if (url.pathname.startsWith('/settings/debug')) {
    if (env.NODE_ENV === 'production' && env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL !== 'true') {
      url.pathname = '/404';
      return NextResponse.rewrite(url);
    }
  }

  // 2. Gate /api routes
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

    // Check for APP_ACCESS_TOKEN
    const expectedToken = env.APP_ACCESS_TOKEN;
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
  matcher: ['/api/:path*', '/settings/debug/:path*'],
};
