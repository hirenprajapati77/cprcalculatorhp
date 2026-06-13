import { NextRequest, NextResponse } from 'next/server';
import { ScannerController } from '@/services/scanner-controller';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const universe = body.universe || 'NIFTY50';
    const market = body.market || 'NSE';

    if (!['NIFTY50', 'NIFTY200', 'NIFTY_FNO', 'ALL'].includes(universe)) {
      return NextResponse.json({ error: 'Invalid universe parameter' }, { status: 400 });
    }
    if (!['NSE', 'BSE'].includes(market)) {
      return NextResponse.json({ error: 'Invalid market parameter' }, { status: 400 });
    }

    // Run the scan synchronously for immediate client feedback
    const results = await ScannerController.runFullScan(universe, market);

    return NextResponse.json({
      success: true,
      message: 'Scanner refresh completed.',
      count: results.length,
      results,
    }, { status: 200 });
  } catch (err) {
    console.error('Error in scanner refresh API route:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred while refreshing scanner' },
      { status: 500 }
    );
  }
}
