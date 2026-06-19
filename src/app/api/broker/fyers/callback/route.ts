import { NextRequest, NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const authCode = searchParams.get('auth_code') || searchParams.get('code');

  if (!authCode) {
    const errorMsg = searchParams.get('error_description') || 'Missing authorization code';
    return NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent(errorMsg)}`, request.url));
  }

  try {
    const result = await FyersAuthService.generateToken(authCode);
    if (result.success) {
      return NextResponse.redirect(new URL('/settings?fyers=connected', request.url));
    } else {
      return NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent(result.message)}`, request.url));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown validation error';
    return NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent(msg)}`, request.url));
  }
}
