
const yahooFinance = require('yahoo-finance2').default;
const cpr = require('./src/lib/cpr-engine');
const atr = require('./src/lib/atr');

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN', 'ITC'];

async function verify() {
  console.log('| Symbol | W-CPR% | W-Class | M-CPR% | M-Class |');
  console.log('|---|---|---|---|---|');
  const endDate = new Date();
  
  for (const sym of SYMBOLS) {
    try {
      const yfSymbol = sym === 'NIFTY' || sym === 'NIFTY50' ? '^NSEI' : sym === 'BANKNIFTY' ? '^NSEBANK' : sym + '.NS';
      
      const wOpts = { period1: new Date(endDate.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString(), interval: '1wk' };
      const wHist = await yahooFinance.historical(yfSymbol, wOpts);
      
      const mOpts = { period1: new Date(endDate.getTime() - 500 * 24 * 60 * 60 * 1000).toISOString(), interval: '1mo' };
      const mHist = await yahooFinance.historical(yfSymbol, mOpts);

      const lastW = wHist[wHist.length - 2];
      const wCpr = cpr.calculateCPR({ high: lastW.high, low: lastW.low, close: lastW.close });
      const wAtrPct = atr.getAtrPct(wHist.slice(0, wHist.length - 1), lastW.close);
      const wWidth = Math.abs(wCpr.tc - wCpr.bc) / wCpr.pivot * 100;
      const wClass = cpr.classifyCprWidth(wWidth, wAtrPct);

      const lastM = mHist[mHist.length - 2];
      const mCpr = cpr.calculateCPR({ high: lastM.high, low: lastM.low, close: lastM.close });
      const mAtrPct = atr.getAtrPct(mHist.slice(0, mHist.length - 1), lastM.close);
      const mWidth = Math.abs(mCpr.tc - mCpr.bc) / mCpr.pivot * 100;
      const mClass = cpr.classifyCprWidth(mWidth, mAtrPct);

      console.log('| ' + sym + ' | ' + wWidth.toFixed(2) + '% | ' + wClass + ' | ' + mWidth.toFixed(2) + '% | ' + mClass + ' |');
    } catch (err) {
      console.log('| ' + sym + ' | Error: ' + err.message + ' |');
    }
  }
}
verify();

