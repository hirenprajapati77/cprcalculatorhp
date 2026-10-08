import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { hashToken, timingSafeEqual } from '@/lib/auth-token';
import { cookieSecureFromRequest } from '@/lib/auth-cookie';
import { checkUnlockRateLimit } from '@/lib/unlock-rate-limit';

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkUnlockRateLimit(req);
    if (rateLimit.unavailable) {
      console.error('[AuthUnlock] Redis rate limiter unavailable in production. Rejecting unlock request.');
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable. Please try again later.' },
        {
          status: 503,
          headers: {
            'Retry-After': '60',
          },
        }
      );
    }

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': '900',
          },
        }
      );
    }

    const body = await req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const expectedToken = env.APP_ACCESS_TOKEN?.trim();

    if (!expectedToken) {
      return NextResponse.json(
        { error: 'App access token not configured on server' },
        { status: 500 }
      );
    }

    if (!token || !timingSafeEqual(token, expectedToken)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const cookieValue = await hashToken(expectedToken);
    const res = NextResponse.json({ success: true });
    res.cookies.set('app_access_token', cookieValue, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: cookieSecureFromRequest(req),
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
