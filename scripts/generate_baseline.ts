import fs from 'fs';
import path from 'path';
import { MarketService } from '../src/services/market.service';
import { ScannerService } from '../src/services/scanner.service';

const symbols = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", 
  "SBIN", "BHARTIARTL", "ITC", "KOTAKBANK", "LT"
];

async function run() {
  const results = [];
  for (const symbol of symbols) {
    const stockData = await MarketService.getStockData(symbol, 'NSE');
    if (!stockData) continue;
    const current = ScannerService.scanStock(stockData);
    results.push({
      symbol: current.symbol,
      signals: current.signals,
      score: current.score,
      rr: current.rr,
      entry: current.entry,
      sl: current.sl,
      target: current.target
    });
  }
  
  const p = path.resolve(__dirname, '../baseline_fresh.json');
  fs.writeFileSync(p, JSON.stringify(results, null, 2));
  console.log('Saved baseline_fresh.json');
}

run();
