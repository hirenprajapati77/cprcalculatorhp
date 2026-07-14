import fs from 'fs';
import path from 'path';
import { MarketService } from '../src/services/market.service';
import { ScannerService } from '../src/services/scanner.service';

const symbols = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", 
  "SBIN", "BHARTIARTL", "ITC", "KOTAKBANK", "LT"
];

async function run() {
  const mode = process.argv[2]; // 'fetch', 'legacy', 'new', 'compare'

  if (mode === 'fetch') {
    const data: any = {};
    for (const sym of symbols) {
      data[sym] = await MarketService.getStockData(sym, 'NSE');
    }
    fs.writeFileSync(path.resolve(__dirname, '../mock_data.json'), JSON.stringify(data));
    console.log('Fetched mock_data.json');
  } 
  else if (mode === 'legacy' || mode === 'new') {
    const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../mock_data.json'), 'utf8'));
    const results: any = {};
    for (const sym of symbols) {
      if (!data[sym]) continue;
      // We must pass the raw data through scanStock
      results[sym] = ScannerService.scanStock(data[sym]);
    }
    fs.writeFileSync(path.resolve(__dirname, `../${mode}_results.json`), JSON.stringify(results, null, 2));
    console.log(`Saved ${mode}_results.json`);
  }
  else if (mode === 'compare') {
    const legacy = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../legacy_results.json'), 'utf8'));
    const current = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../new_results.json'), 'utf8'));
    
    let hasDiff = false;
    for (const sym of symbols) {
      if (!legacy[sym] || !current[sym]) continue;
      
      const leg = legacy[sym];
      const cur = current[sym];
      
      // Ignore new CPR analytics signals in current
      const curSignals = cur.signals.filter((s: string) => !s.startsWith('CPR_QUALITY_') && !s.startsWith('CPR_REL_'));
      const legSignals = leg.signals;
      
      const sigMatch = JSON.stringify([...legSignals].sort()) === JSON.stringify([...curSignals].sort());
      const scoreMatch = leg.score === cur.score;
      // For rr, entry, sl, target, since the old one didn't have toFixed, let's compare with toFixed
      const rrMatch = leg.rr === cur.rr;
      const entryMatch = Number(leg.entry).toFixed(2) === Number(cur.entry).toFixed(2);
      const slMatch = Number(leg.sl).toFixed(2) === Number(cur.sl).toFixed(2);
      const targetMatch = Number(leg.target).toFixed(2) === Number(cur.target).toFixed(2);
      
      if (!sigMatch || !scoreMatch || !rrMatch || !entryMatch || !slMatch || !targetMatch) {
        hasDiff = true;
        console.log(`\n❌ MISMATCH FOR ${sym}`);
        if (!sigMatch) console.log(`Signals:\n  Legacy:  ${legSignals.join(',')}\n  Current: ${curSignals.join(',')}`);
        if (!scoreMatch) console.log(`Score: Legacy ${leg.score} | Current ${cur.score}`);
        if (!rrMatch) console.log(`RR: Legacy ${leg.rr} | Current ${cur.rr}`);
        if (!entryMatch) console.log(`Entry: Legacy ${Number(leg.entry).toFixed(2)} | Current ${Number(cur.entry).toFixed(2)}`);
      } else {
        console.log(`✅ ${sym} - MATCH`);
      }
    }
    
    if (hasDiff) process.exit(1);
    else console.log('\nAll perfectly matched!');
  }
}

run();
