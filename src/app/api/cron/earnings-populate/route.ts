import { NextResponse } from 'next/server';
import { isValidCronSecret } from '@/lib/crypto';
import { EarningsPopulatorService } from '@/services/earnings-populator.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // Allow ample time for fallback Yahoo Finance batch calls

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('x-cron-secret');
    if (!isValidCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await EarningsPopulatorService.populate();

    if (!result.success) {
      return NextResponse.json({ 
        error: 'Populator partially failed', 
        details: result 
      }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Earnings Populator Cron Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 });
  }
}
