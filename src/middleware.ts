import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeStringEqual } from './lib/crypto';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  
  // 1. Gate /settings/debug
  if (url.pathname.startsWith('/settings/debug')) {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL !== 'true') {
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
      url.pathname.startsWith('/api/share/')
    ) {
      return NextResponse.next();
    }

    // Check for APP_ACCESS_TOKEN
    const expectedToken = process.env.APP_ACCESS_TOKEN;
    if (expectedToken) {
      const authHeader = request.headers.get('authorization');
      const authCookie = request.cookies.get('app_access_token')?.value;

      let isAuth = false;
      if (authHeader && timingSafeStringEqual(authHeader, `Bearer ${expectedToken}`)) {
        isAuth = true;
      } else if (authCookie && timingSafeStringEqual(authCookie, expectedToken)) {
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
