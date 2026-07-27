import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';

function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const aPadded = a.padEnd(maxLen, '\0');
  const bPadded = b.padEnd(maxLen, '\0');
  let result = 0;
  for (let i = 0; i < maxLen; i++) {
    result |= aPadded.charCodeAt(i) ^ bPadded.charCodeAt(i);
  }
  return result === 0 && a.length === b.length;
}

function cookieSecure(req: NextRequest): boolean {
  return (
    req.nextUrl.protocol === 'https:' ||
    Boolean(env.NEXT_PUBLIC_BASE_URL?.startsWith('https://'))
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const expectedToken = env.APP_ACCESS_TOKEN?.trim();

    if (!expectedToken) {
      return NextResponse.json(
        { error: 'App access token not configured on server' },
        { status: 500 }
      );
    }

    if (!token || !timingSafeEqual(token, expectedToken)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set('app_access_token', expectedToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: cookieSecure(req),
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
