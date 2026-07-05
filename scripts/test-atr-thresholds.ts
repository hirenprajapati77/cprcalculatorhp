import { MarketService } from '../src/services/market.service';
import { calculateCPR, classifyCprWidth } from '../src/lib/cpr-engine';
import { calculateATR } from '../src/lib/atr';

const symbols = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'HINDUNILVR', 'ITC', 'LT', 'SBIN', 'BHARTIARTL',
  'ADANIENT', 'TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'TATAMOTORS', 'M&M',
  'IDEA', 'ZOMATO', 'PNB', 'IDFCFIRSTB', 'GMRINFRA', 'BHEL',
  'IRCTC', 'POLYCAB', 'DIXON', 'HAL', 'BEL'
];

async function run() {
  let oldNarrow = 0; let oldNormal = 0; let oldWide = 0;
  let newNarrow = 0; let newNormal = 0; let newWide = 0;

  for (const sym of symbols) {
    try {
      const data = await MarketService.getStockData(sym);
      if (!data) {
        console.log(`Failed to fetch ${sym}`);
        continue;
      }
      
      const history = data.history || [];
      const len = history.length;
      if (len < 2) continue;
      
      const yesterday = history[len - 2];
      const pivot = (yesterday.high + yesterday.low + yesterday.close) / 3;
      const bc = (yesterday.high + yesterday.low) / 2;
      const tc = (pivot - bc) + pivot;
      const tcFinal = Math.max(bc, tc);
      const bcFinal = Math.min(bc, tc);
      
      const widthPct = ((tcFinal - bcFinal) / pivot) * 100;
      
      const atr = calculateATR(history, data.close);
      const atrPct = atr / data.close;
      
      const oldClass = classifyCprWidth(widthPct);
      const newClass = classifyCprWidth(widthPct, atrPct);
      
      console.log(`${sym.padEnd(12)} | ATR%: ${(atrPct*100).toFixed(2)}% | Width: ${widthPct.toFixed(2)}% | Old: ${oldClass.padEnd(6)} | New: ${newClass}`);
      
      if (oldClass === 'NARROW') oldNarrow++;
      if (oldClass === 'NORMAL') oldNormal++;
      if (oldClass === 'WIDE') oldWide++;
      
      if (newClass === 'NARROW') newNarrow++;
      if (newClass === 'NORMAL') newNormal++;
      if (newClass === 'WIDE') newWide++;
    } catch (e: any) {
      console.error(`Error for ${sym}: ${e.message}`);
    }
  }
  console.log('--- Summary ---');
  console.log(`OLD -> NARROW: ${oldNarrow}, NORMAL: ${oldNormal}, WIDE: ${oldWide}`);
  console.log(`NEW -> NARROW: ${newNarrow}, NORMAL: ${newNormal}, WIDE: ${newWide}`);
}

run();
