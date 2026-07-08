function calculateCPR(input, atrPct) {
  const H = input.high, L = input.low, C = input.close;
  const pivot = (H + L + C) / 3;
  const bc = (H + L) / 2;
  const tc = (pivot - bc) + pivot;
  let tcFinal = tc, bcFinal = bc;
  if(tc < bc) { tcFinal = bc; bcFinal = tc; }
  const width = ((tcFinal - bcFinal) / pivot) * 100;
  const narrowThresh = atrPct ? (0.15 * atrPct * 100) : 0.3;
  const normalThresh = atrPct ? (0.40 * atrPct * 100) : 0.8;
  const classification = width < narrowThresh ? 'NARROW' : width < normalThresh ? 'NORMAL' : 'WIDE';
  return { pivot, bc: bcFinal, tc: tcFinal, width, classification };
}
function calculateATR(history, currentClose) {
  const len = history.length;
  let atr = currentClose * 0.02;
  if (len >= 2) {
    let trueRangeSum = 0;
    for (let i = 1; i < len; i++) {
      const high = history[i].high;
      const low = history[i].low;
      const prevClose = history[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trueRangeSum += tr;
    }
    atr = trueRangeSum / (len - 1);
  }
  return atr;
}
function getAtrPct(history, currentClose) {
  const atr = calculateATR(history, currentClose);
  return currentClose > 0 ? atr / currentClose : 0.02;
}

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN', 'ITC'];
async function fetchHist(sym, days, interval) {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  const period1 = Math.floor(startDate.getTime() / 1000);
  const period2 = Math.floor(endDate.getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?period1=${period1}&period2=${period2}&interval=${interval}`;
  
  const res = await fetch(url);
  const json = await res.json();
  const result = json.chart.result[0];
  const timestamps = result.timestamp;
  const quotes = result.indicators.quote[0];
  
  const hist = [];
  for(let i=0; i<timestamps.length; i++) {
    if(quotes.open[i] !== null && quotes.close[i] !== null) {
      hist.push({ open: quotes.open[i], high: quotes.high[i], low: quotes.low[i], close: quotes.close[i] });
    }
  }
  return hist;
}
async function verify() {
  console.log('| Symbol | W-CPR% | W-Class | M-CPR% | M-Class |');
  console.log('|---|---|---|---|---|');
  for (const sym of SYMBOLS) {
    try {
      const yfSymbol = sym === 'NIFTY' || sym === 'NIFTY50' ? '^NSEI' : sym === 'BANKNIFTY' ? '^NSEBANK' : sym + '.NS';
      const wHist = await fetchHist(yfSymbol, 150, '1wk');
      const mHist = await fetchHist(yfSymbol, 500, '1mo');
      const lastW = wHist[wHist.length - 2];
      const wAtrPct = getAtrPct(wHist.slice(0, wHist.length - 1), lastW.close);
      const wCpr = calculateCPR(lastW, wAtrPct);
      const lastM = mHist[mHist.length - 2];
      const mAtrPct = getAtrPct(mHist.slice(0, mHist.length - 1), lastM.close);
      const mCpr = calculateCPR(lastM, mAtrPct);
      console.log(`| ${sym} | ${wCpr.width.toFixed(2)}% | ${wCpr.classification} | ${mCpr.width.toFixed(2)}% | ${mCpr.classification} |`);
    } catch (err) {
      console.log(`| ${sym} | Error: ${err.message} |`);
    }
  }
}
verify();
