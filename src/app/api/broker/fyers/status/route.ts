import { NextRequest, NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';
import { MarketService } from '@/services/market.service';
import { hashToken, timingSafeEqual } from '@/lib/auth-token';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Guard: require a valid session before probing the Fyers API.
  // Prevents unauthenticated callers from exhausting the Fyers rate limit.
  const expectedToken = env.APP_ACCESS_TOKEN?.trim();
  if (!expectedToken) {
    if (env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({
      connected: false,
      dataApiOk: false,
      dataApiMessage: 'APP_ACCESS_TOKEN unset — Fyers probe skipped',
    });
  }

  const expectedHash = await hashToken(expectedToken);
  const authHeader = request.headers.get('authorization');
  const authCookie = request.cookies.get('app_access_token')?.value;
  const tokenOk =
    (authHeader && timingSafeEqual(authHeader, `Bearer ${expectedToken}`)) ||
    (authCookie && (timingSafeEqual(authCookie, expectedHash) || timingSafeEqual(authCookie, expectedToken)));
  if (!tokenOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tokenDetails = await FyersAuthService.getTokenDetails();
    if (!tokenDetails) {
      return NextResponse.json({ connected: false, dataApiOk: false });
    }

    const probe = await MarketService.probeFyersDataApi();
    return NextResponse.json({
      connected: true,
      expiresAt: tokenDetails.expiresAt,
      updatedAt: tokenDetails.updatedAt,
      dataApiOk: probe.ok,
      dataApiMessage: probe.message,
    });
  } catch (err) {
    return NextResponse.json({ connected: false, dataApiOk: false, error: String(err) }, { status: 500 });
  }
}
