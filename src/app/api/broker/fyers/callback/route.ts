import { NextRequest, NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const authCode = searchParams.get('auth_code') || searchParams.get('code');
  
  const host = request.headers.get('host') || '129.159.230.41';
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}`;

  if (!authCode) {
    const errorMsg = searchParams.get('error_description') || 'Missing authorization code';
    return NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent(errorMsg)}`, baseUrl));
  }

  try {
    const result = await FyersAuthService.generateToken(authCode);
    if (result.success) {
      return NextResponse.redirect(new URL('/settings?fyers=connected', baseUrl));
    } else {
      return NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent(result.message)}`, baseUrl));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown validation error';
    return NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent(msg)}`, baseUrl));
  }
}
