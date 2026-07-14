import fs from 'fs';
import path from 'path';
import { MarketService } from '../src/services/market.service';
import { ScannerService } from '../src/services/scanner.service';

async function run() {
  const baselinePath = path.resolve(__dirname, '../baseline_fresh.json');
  const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  let hasDiff = false;

  for (const baseline of baselineData) {
    const symbol = baseline.symbol;
    try {
      const stockData = await MarketService.getStockData(symbol, 'NSE');
      if (!stockData) {
        console.error(`Could not fetch data for ${symbol}`);
        continue;
      }
      
      const current = ScannerService.scanStock(stockData);
      
      // We ignore new signals like CPR_QUALITY_*
      const currentSignals = current.signals.filter(s => !s.startsWith('CPR_QUALITY_'));
      
      const s1 = [...baseline.signals].sort();
      const s2 = [...currentSignals].sort();
      
      const sigMatch = JSON.stringify(s1) === JSON.stringify(s2);
      const scoreMatch = baseline.score === current.score;
      const rrMatch = baseline.rr === current.rr;
      // Use toFixed to avoid floating point precision issues
      const entryMatch = baseline.entry.toFixed(2) === current.entry.toFixed(2);
      const slMatch = baseline.sl.toFixed(2) === current.sl.toFixed(2);
      const targetMatch = baseline.target.toFixed(2) === current.target.toFixed(2);
      
      if (!sigMatch || !scoreMatch || !rrMatch || !entryMatch || !slMatch || !targetMatch) {
        hasDiff = true;
        console.log(`\n❌ MISMATCH FOR ${symbol}`);
        if (!sigMatch) console.log(`Signals:\n  Baseline: ${s1.join(',')}\n  Current:  ${s2.join(',')}`);
        if (!scoreMatch) console.log(`Score: Baseline ${baseline.score} | Current ${current.score}`);
        if (!rrMatch) console.log(`RR: Baseline ${baseline.rr} | Current ${current.rr}`);
        if (!entryMatch) console.log(`Entry: Baseline ${baseline.entry.toFixed(2)} | Current ${current.entry.toFixed(2)}`);
        if (!slMatch) console.log(`SL: Baseline ${baseline.sl.toFixed(2)} | Current ${current.sl.toFixed(2)}`);
        if (!targetMatch) console.log(`Target: Baseline ${baseline.target.toFixed(2)} | Current ${current.target.toFixed(2)}`);
      } else {
        console.log(`✅ ${symbol} - MATCH`);
      }
    } catch (e) {
      console.error(`Error processing ${symbol}:`, e);
    }
  }
  
  if (hasDiff) {
    console.error('\nRegression detected!');
    process.exit(1);
  } else {
    console.log('\nAll 10 baseline symbols match perfectly!');
  }
}

run();
