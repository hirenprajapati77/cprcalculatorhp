import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const authCode = searchParams.get('auth_code') || searchParams.get('code');
  const state = searchParams.get('state');
  
  const baseUrl = env.APP_BASE_URL || env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  const cookieState = request.cookies.get('oauth_state')?.value;
  if (!state || state !== cookieState) {
    return NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent('Invalid CSRF state')}`, baseUrl));
  }

  if (!authCode) {
    const errorMsg = searchParams.get('error_description') || 'Missing authorization code';
    return NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent(errorMsg)}`, baseUrl));
  }

  try {
    const result = await FyersAuthService.generateToken(authCode);
    
    const url = result.success 
      ? new URL('/settings?fyers=connected', baseUrl)
      : new URL(`/settings?fyers=error&msg=${encodeURIComponent(result.message)}`, baseUrl);
      
    const response = NextResponse.redirect(url);
    response.cookies.delete('oauth_state');
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown validation error';
    const response = NextResponse.redirect(new URL(`/settings?fyers=error&msg=${encodeURIComponent(msg)}`, baseUrl));
    response.cookies.delete('oauth_state');
    return response;
  }
}
