import { NextRequest, NextResponse } from 'next/server';
import { getStockBtstCompare } from '@/services/journal/stock-btst-compare.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const backtestRunId =
      request.nextUrl.searchParams.get('backtestRunId') ?? undefined;
    const result = await getStockBtstCompare(backtestRunId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
