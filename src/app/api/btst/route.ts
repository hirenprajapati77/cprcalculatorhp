import { NextResponse } from 'next/server';
import { MarketService } from '@/services/market.service';
import { BtstService, BtstScoreResult } from '@/services/backtest/btst.service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const universe = searchParams.get('universe') || 'NIFTY50';

    const executionWindowOpen = BtstService.isExecutionWindowOpen();

    const stocks = MarketService.getUniverse(universe as Parameters<typeof MarketService.getUniverse>[0]);
    const results: BtstScoreResult[] = [];

    let strongSignal = 0;
    let breakoutReady = 0;
    let avoid = 0;
    let totalLong = 0;
    let totalShort = 0;
    let totalConflict = 0;

    const stockPromises = stocks.map(async (stockMeta) => {
      try {
        const stock = await MarketService.getStockData(stockMeta.symbol);
        return { stockMeta, stock };
      } catch (err) {
        console.error(`Failed to fetch stock data for ${stockMeta.symbol}:`, err);
        return { stockMeta, stock: null };
      }
    });

    const stockResults = await Promise.all(stockPromises);

    for (const { stock } of stockResults) {
      if (stock) {
        const result = BtstService.evaluateOvernight(stock);
        
        // Count metrics
        const maxScore = Math.max(result.longScore, result.shortScore);
        
        if (result.tag === 'NEUTRAL_CONFLICT') {
          totalConflict++;
          avoid++;
        } else if (result.tag === 'WEAK') {
          avoid++;
        } else {
          if (maxScore >= 90) {
            strongSignal++;
          } else if (maxScore >= 70) {
            breakoutReady++;
          } else if (maxScore < 40) {
            avoid++;
          }
          
          if (result.tag === 'LONG') totalLong++;
          if (result.tag === 'SHORT') totalShort++;
        }

        // Exclude WEAK
        if (result.tag !== 'WEAK') {
          results.push(result);
        }
      }
    }

    // Sort results by max score
    results.sort((a, b) => Math.max(b.longScore, b.shortScore) - Math.max(a.longScore, a.shortScore));

    return NextResponse.json({
      success: true,
      executionWindowOpen,
      scannedAt: new Date().toISOString(),
      results,
      insights: {
        strongSignal,
        breakoutReady,
        avoid,
        totalLong,
        totalShort,
        totalConflict
      }
    });

  } catch (error) {
    console.error('BTST API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to evaluate BTST setups' }, { status: 500 });
  }
}
