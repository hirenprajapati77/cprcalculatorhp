import type { NextRequest } from 'next/server';
import { env } from '@/config/env';

/**
 * Whether Set-Cookie should include Secure.
 * Prefer real request HTTPS (direct or via nginx X-Forwarded-Proto), then build-time base URL.
 * Never key off NODE_ENV — production may still be probed on plain HTTP IP.
 */
export function cookieSecureFromRequest(req: NextRequest): boolean {
  if (req.nextUrl.protocol === 'https:') return true;
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwarded === 'https') return true;
  return Boolean(env.NEXT_PUBLIC_BASE_URL?.startsWith('https://'));
}

/** For redirects that only have env (no request), e.g. OAuth start. */
export function cookieSecureFromEnv(): boolean {
  return Boolean(env.NEXT_PUBLIC_BASE_URL?.startsWith('https://'));
}
