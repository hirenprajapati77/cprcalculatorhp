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
  const results = [];
  
  for (const sym of symbols) {
    try {
      const data = await MarketService.getStockData(sym);
      if (!data) continue;
      
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
      
      // Classifications
      const oldClass = classifyCprWidth(widthPct);
      const newClass = classifyCprWidth(widthPct, atrPct);
      
      // HOT ZONE
      const closeDistance = Math.abs(data.ltp - pivot) / pivot;
      const oldHotZone = (oldClass === 'NARROW' && closeDistance <= 0.0015);
      const newHotZone = (newClass === 'NARROW' && closeDistance <= (0.10 * atrPct));
      
      // BUILD
      const priceChangePct = (data.ltp - data.close) / data.close;
      const volumeRatio = (data.volume || 1000) / (data.avgVolume || 1000); // mock volume ratio if missing
      
      const oldBuild = Math.abs(priceChangePct) > 0.015 && volumeRatio >= 1.5;
      const newBuild = Math.abs(priceChangePct) > (0.75 * atrPct) && volumeRatio >= 1.5;
      
      results.push({
        sym,
        atrPct: (atrPct * 100).toFixed(2) + '%',
        widthPct: widthPct.toFixed(2) + '%',
        oldClass, newClass,
        oldHotZone: oldHotZone ? 'Yes' : '-', newHotZone: newHotZone ? 'Yes' : '-',
        oldBuild: oldBuild ? 'Yes' : '-', newBuild: newBuild ? 'Yes' : '-'
      });
    } catch (e: any) {}
  }
  
  console.log('| Symbol | ATR% | CPR Width | Old Class | New Class | Old HotZone | New HotZone | Old Build | New Build |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.sym} | ${r.atrPct} | ${r.widthPct} | ${r.oldClass} | **${r.newClass}** | ${r.oldHotZone} | ${r.newHotZone} | ${r.oldBuild} | ${r.newBuild} |`);
  }
}

run();
