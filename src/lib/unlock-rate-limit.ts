import { env } from '@/config/env';
import { NextRequest } from 'next/server';
import { cache, isRedisAvailable } from '@/lib/redis';
import { resolveClientIp } from '@/lib/client-ip';

export interface UnlockRateLimitOptions {
  isProduction?: boolean;
  redisConfigured?: boolean;
  isRedisUp?: boolean;
  trustProxy?: boolean;
}

/**
 * Checks unlock endpoint rate limits.
 *
 * Security rules:
 * 1. Prefer nginx's X-Real-IP (direct peer).
 * 2. If TRUST_PROXY is true, consult X-Forwarded-For taking the last hop (appended by nginx).
 * 3. In production behind nginx, TRUST_PROXY must be set to 'true' and the proxy must forward
 *    the verified client IP.
 * 4. If fail-closed rate limiting is active in production and no reliable client IP can be
 *    determined, fail closed (unavailable: true -> 503) rather than bucketing all requests
 *    under a shared 127.0.0.1 IP.
 */
export async function checkUnlockRateLimit(
  request: NextRequest,
  options?: UnlockRateLimitOptions
): Promise<{ allowed: boolean; unavailable?: boolean }> {
  const isProduction =
    options?.isProduction ?? (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production');
  const redisConfigured =
    options?.redisConfigured ?? Boolean(env.REDIS_URL || process.env.REDIS_URL);
  const failClosed = isProduction;
  const redisAvailable = options?.isRedisUp ?? isRedisAvailable();

  // P1-8: In production, Redis-backed rate limiting is strictly required.
  // Fail closed if Redis is missing or unavailable to prevent in-memory bypasses.
  if (isProduction && (!redisConfigured || !redisAvailable)) {
    return { allowed: false, unavailable: true };
  }

  const trustProxy = options?.trustProxy ?? (process.env.TRUST_PROXY === 'true' || env.TRUST_PROXY === 'true');
  const resolvedIp = resolveClientIp(request.headers, trustProxy);

  if (failClosed && !resolvedIp) {
    console.error('[AuthUnlock] Unable to determine client IP in production with fail-closed rate limiting.');
    return { allowed: false, unavailable: true };
  }

  const ip = resolvedIp || '127.0.0.1';

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
