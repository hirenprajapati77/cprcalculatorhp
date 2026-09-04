import { NextRequest, NextResponse } from 'next/server';
import { OptionChainService } from '@/services/option-chain.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: 'Symbol parameter is required' },
      { status: 400 }
    );
  }

  const allowRollover = searchParams.get('allowRollover') !== 'false';
  const targetExpiryStr = searchParams.get('targetExpiryStr') || undefined;

  try {
    const result = await OptionChainService.getOptionChain(
      symbol,
      allowRollover,
      targetExpiryStr
    );

    if ('error' in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error(`[API:Options:Chain] Error fetching option chain for ${symbol}:`, err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
