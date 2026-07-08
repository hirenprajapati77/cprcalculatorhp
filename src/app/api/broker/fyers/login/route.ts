import { NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';

export const dynamic = 'force-dynamic';

import crypto from 'crypto';

export async function GET() {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const loginUrl = FyersAuthService.getLoginUrl(undefined, state);
    
    const response = NextResponse.redirect(loginUrl);
    // secure:true only if actually serving HTTPS — NOT based on NODE_ENV,
    // because production can run on plain HTTP (e.g. IP-based without TLS).
    const isHttps = (process.env.NEXT_PUBLIC_BASE_URL || '').startsWith('https://');
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 10 // 10 minutes
    });

    return response;
  } catch (err) {
    console.error('Error redirecting to Fyers OAuth login:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to redirect to login' }, { status: 500 });
  }
}
