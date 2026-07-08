import { MarketService } from './src/services/market.service';
import { BtstService } from './src/services/backtest/btst.service';

async function main() {
  const universe = 'NIFTY50';
  const stocks = MarketService.getUniverse(universe as Parameters<typeof MarketService.getUniverse>[0]);
  
  const countsBaseline = { LONG: 0, SHORT: 0, NEUTRAL_CONFLICT: 0, WEAK: 0 };
  const countsNoVdu = { LONG: 0, SHORT: 0, NEUTRAL_CONFLICT: 0, WEAK: 0 };

  console.log(`Checking tags over universe ${universe} for ONE DAY...`);
  for (const stock of stocks) {
    const stockData = await MarketService.getStockData(stock.symbol);
    if (!stockData) continue;

    const resB = BtstService.evaluateOvernight(stockData, undefined, 'baseline');
    countsBaseline[resB.tag]++;

    const resN = BtstService.evaluateOvernight(stockData, undefined, 'no_vdu_weighted');
    countsNoVdu[resN.tag]++;
  }

  console.log('--- BASELINE ---');
  console.log(`LONG: ${countsBaseline.LONG}`);
  console.log(`SHORT: ${countsBaseline.SHORT}`);
  console.log(`NEUTRAL_CONFLICT: ${countsBaseline.NEUTRAL_CONFLICT}`);
  console.log(`WEAK: ${countsBaseline.WEAK}`);
  console.log(`TOTAL ADMITTED (LONG+SHORT): ${countsBaseline.LONG + countsBaseline.SHORT}`);

  console.log('\n--- NO_VDU_WEIGHTED ---');
  console.log(`LONG: ${countsNoVdu.LONG}`);
  console.log(`SHORT: ${countsNoVdu.SHORT}`);
  console.log(`NEUTRAL_CONFLICT: ${countsNoVdu.NEUTRAL_CONFLICT}`);
  console.log(`WEAK: ${countsNoVdu.WEAK}`);
  console.log(`TOTAL ADMITTED (LONG+SHORT): ${countsNoVdu.LONG + countsNoVdu.SHORT}`);
}

main().catch(console.error);
