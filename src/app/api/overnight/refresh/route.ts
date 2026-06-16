import { NextRequest, NextResponse } from 'next/server';
import { OvernightService } from '@/services/overnight/overnight.service';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mockTime = searchParams.get('mockTime'); // Support testing different times
    const direction = (searchParams.get('direction') as 'LONG' | 'SHORT' | 'BOTH') || 'BOTH';

    let dateOverride: Date | undefined;
    if (mockTime) {
      dateOverride = new Date(mockTime);
    }

    const signals = await OvernightService.discover(direction, dateOverride);
    return NextResponse.json({ success: true, count: signals.length, signals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
