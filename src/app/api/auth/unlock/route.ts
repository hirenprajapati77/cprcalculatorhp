import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { cache, isRedisAvailable } from '@/lib/redis';
import { hashToken, timingSafeEqual } from '@/lib/auth-token';
import { cookieSecureFromRequest } from '@/lib/auth-cookie';

async function checkUnlockRateLimit(request: NextRequest): Promise<{ allowed: boolean; unavailable?: boolean }> {
  const isProduction = process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production';
  const redisConfigured = Boolean(env.REDIS_URL || process.env.REDIS_URL);
  const failClosed = isProduction && redisConfigured;

  if (failClosed && !isRedisAvailable()) {
    return { allowed: false, unavailable: true };
  }

  // Prefer nginx's X-Real-IP (always the direct peer). Only when TRUST_PROXY is
  // set do we consult X-Forwarded-For — and we take the *last* hop, which
  // nginx's $proxy_add_x_forwarded_for appends as the real client. Taking the
  // first hop lets an attacker rotate spoofed IPs and bypass the unlock limit.
  let ip = request.headers.get('x-real-ip') || '127.0.0.1';
  if (env.TRUST_PROXY === 'true') {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      const hops = forwardedFor.split(',').map((h) => h.trim()).filter(Boolean);
      if (hops.length > 0) {
        ip = hops[hops.length - 1]!;
      }
    }
  }

  const limit = 5;
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const ttlSeconds = Math.ceil(windowMs / 1000);
  const cacheKey = `rate_limit:unlock:${ip}`;

  try {
    const count = await cache.incr(cacheKey, ttlSeconds, failClosed);
    return { allowed: count <= limit };
  } catch (err) {
    if (failClosed) {
      console.error('[AuthUnlock] Redis rate limiter failed in production:', err);
      return { allowed: false, unavailable: true };
    }
    return { allowed: true };
  }
}

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
