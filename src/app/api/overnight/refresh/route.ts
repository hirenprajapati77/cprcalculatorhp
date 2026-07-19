import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { OvernightService } from '@/services/overnight/overnight.service';
import { isValidCronSecret } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');

  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const mockTime = searchParams.get('mockTime'); // Support testing different times
    const direction = (searchParams.get('direction') as 'LONG' | 'SHORT' | 'BOTH') || 'BOTH';

    let dateOverride: Date | undefined;
    if (mockTime && env.NODE_ENV !== 'production') {
      dateOverride = new Date(mockTime);
    }

    const signals = await OvernightService.discover(direction, dateOverride);
    return NextResponse.json({ success: true, count: signals.length, signals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
