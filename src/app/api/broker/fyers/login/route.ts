import { NextResponse } from 'next/server';
import { FyersAuthService } from '@/services/fyers-auth.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const loginUrl = FyersAuthService.getLoginUrl();
    return NextResponse.redirect(loginUrl);
  } catch (err) {
    console.error('Error redirecting to Fyers OAuth login:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to redirect to login' }, { status: 500 });
  }
}
