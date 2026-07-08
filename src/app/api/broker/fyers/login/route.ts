import { NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';

export const dynamic = 'force-dynamic';

import crypto from 'crypto';

export async function GET() {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const loginUrl = FyersAuthService.getLoginUrl(undefined, state);
    
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 10 // 10 minutes
    });

    return response;
  } catch (err) {
    console.error('Error redirecting to Fyers OAuth login:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to redirect to login' }, { status: 500 });
  }
}
