import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  const secure =
    req.nextUrl.protocol === 'https:' ||
    Boolean(env.NEXT_PUBLIC_BASE_URL?.startsWith('https://'));

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
