import { NextRequest, NextResponse } from 'next/server';
import { cookieSecureFromRequest } from '@/lib/auth-cookie';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  const secure = cookieSecureFromRequest(req);

  // Mirror unlock cookie attributes so browsers reliably clear the session.
  res.cookies.set('app_access_token', '', {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure,
    maxAge: 0,
    expires: new Date(0),
  });
  return res;
}
