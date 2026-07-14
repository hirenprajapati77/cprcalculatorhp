import { MarketService } from '../src/services/market.service';
import { ScannerService } from '../src/services/scanner.service';
import fs from 'fs';

async function capture() {
  const symbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT'];
  const baseline = [];

  for (const sym of symbols) {
    const stock = await MarketService.getStockData(sym);
    if (!stock) {
      console.log(`Failed to fetch ${sym}`);
      continue;
    }
    const result = ScannerService.scanStock(stock);
    baseline.push({
      symbol: stock.symbol,
      signals: result.signals,
      score: result.score,
      rr: result.rr,
      entry: result.entry,
      sl: result.sl,
      target: result.target,
    });
  }

  fs.writeFileSync('baseline_snapshot.json', JSON.stringify(baseline, null, 2));
  console.log('Baseline captured to baseline_snapshot.json');
}

capture();
