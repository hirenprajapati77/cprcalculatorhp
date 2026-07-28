import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/lib/redis';
import { hashToken, timingSafeEqual } from '@/lib/auth-token';

function cookieSecure(req: NextRequest): boolean {
  return (
    req.nextUrl.protocol === 'https:' ||
    Boolean(env.NEXT_PUBLIC_BASE_URL?.startsWith('https://'))
  );
}

async function checkUnlockRateLimit(request: NextRequest): Promise<boolean> {
  let ip = request.headers.get('x-real-ip') || '127.0.0.1';
  if (env.TRUST_PROXY === 'true') {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      ip = forwardedFor.split(',')[0].trim();
    }
  }

  const limit = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const ttlSeconds = Math.ceil(windowMs / 1000);
  const cacheKey = `rate_limit:unlock:${ip}`;

  const count = await cache.incr(cacheKey, ttlSeconds);
  return count <= limit;
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await checkUnlockRateLimit(req);
    if (!allowed) {
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

    const cookieValue = hashToken(expectedToken);
    const res = NextResponse.json({ success: true });
    res.cookies.set('app_access_token', cookieValue, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: cookieSecure(req),
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
