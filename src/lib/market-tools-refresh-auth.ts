import { NextRequest } from 'next/server';
import { env } from '@/config/env';
import { hashToken, timingSafeEqual } from '@/lib/auth-token';

/**
 * Checks whether a request is authorized to trigger the heavy `?refresh=true`
 * path on a Market Tools API route (Pattern Breakout, Multi-Year Breakout,
 * Market Breadth). Accepts either:
 *   - Authorization: Bearer <raw APP_ACCESS_TOKEN>  (script/API usage)
 *   - app_access_token cookie                        (browser UI usage)
 *
 * IMPORTANT: the app_access_token cookie holds hashToken(APP_ACCESS_TOKEN),
 * not the raw token itself (see /api/auth/unlock/route.ts, which is the only
 * place that sets it). Comparing the cookie directly against the raw token
 * will never match for a real, already-unlocked browser session.
 *
 * Confirmed live, 31 Aug 2026: breakout/route.ts and breadth/route.ts each
 * had their own inline copy of this check that compared the cookie against
 * the raw token only (`provided !== expectedToken`), so any legitimately
 * logged-in user got 401'd on every refresh click, regardless of session
 * validity. pattern-breakout/route.ts's inline copy happened to have the
 * correct dual hash/raw comparison already. Centralizing here so there's
 * one correct implementation instead of three independent copies that can
 * silently drift out of sync with each other (as they already did once).
 */
export async function isAuthorizedForRefresh(request: NextRequest): Promise<boolean> {
  const expectedToken = env.APP_ACCESS_TOKEN?.trim();
  if (!expectedToken) return true; // no token configured -- auth gate is a no-op, matches existing behavior

  const authHeader = request.headers.get('authorization');
  if (authHeader && timingSafeEqual(authHeader, `Bearer ${expectedToken}`)) {
    return true;
  }

  const authCookie = request.cookies.get('app_access_token')?.value;
  if (!authCookie) return false;

  const expectedHash = await hashToken(expectedToken);
  return timingSafeEqual(authCookie, expectedHash) || timingSafeEqual(authCookie, expectedToken);
}
