import { ScannerController } from './src/services/scanner-controller';

async function runTest() {
  console.log("Running local sanity scan...");
  
  // Need to force LIVE mode to test the new range=1mo
  process.env.MARKET_DATA_MODE = 'live';

  try {
    const results = await ScannerController.runFullScan('NIFTY50', 'NSE');
    
    if (!results || results.length === 0) {
      console.log("No results found!");
      return;
    }

    const scores = results.map(r => r.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`\nAvg Score: ${avgScore.toFixed(2)}`);
    
    const strongBuys = results.filter(r => r.score >= 90);
    console.log(`Strong Buys (>= 90): ${strongBuys.length}`);
    if (strongBuys.length > 0) {
      for (const s of strongBuys) {
        console.log(`- ${s.symbol}: Score=${s.score}, Signals=[${s.signals.join(', ')}]`);
      }
    }
    
    console.log("\nSample NORMAL CPR stocks:");
    const normalStocks = results.filter(r => r.signals.includes('NORMAL')).slice(0, 5);
    for (const s of normalStocks) {
      console.log(`- ${s.symbol}: Score=${s.score}, Class=${s.classification}, Conf=${s.confidence}%, Signals=[${s.signals.join(', ')}]`);
    }

    console.log("\nSpecific checks (GRASIM, INDUSINDBK, BHARTIARTL):");
    const specific = results.filter(r => ['GRASIM', 'INDUSINDBK', 'BHARTIARTL'].includes(r.symbol));
    for (const s of specific) {
      console.log(`- ${s.symbol}: Score=${s.score}, Class=${s.classification}, Conf=${s.confidence}%, Signals=[${s.signals.join(', ')}]`);
    }

    console.log("\nConfidence Matching Check:");
    const mismatch = results.filter(r => r.score !== r.confidence);
    if (mismatch.length === 0) {
      console.log("PASS: All confidence values match their scores exactly.");
    } else {
      console.log(`FAIL: ${mismatch.length} mismatches found.`);
      console.log(mismatch.slice(0, 2).map(r => `${r.symbol}: Score=${r.score}, Conf=${r.confidence}`));
    }
  } catch(e) {
    console.error(e);
  }
}

runTest();
