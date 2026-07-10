import { MarketService } from '../src/services/market.service';
import { calculateCPR } from '../src/lib/cpr-engine';
import { isCprVirgin } from '../src/lib/cpr-engine';
import { getAtrPct } from '../src/lib/atr';

function getISTDateString(): string {
  const istTime = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return istTime.toISOString().split('T')[0];
}

function isTodayCandleClosed(): boolean {
  const now = new Date();
  const istHour = (now.getUTCHours() + 5) % 24;
  const istMin = (now.getUTCMinutes() + 30) % 60;
  return istHour > 15 || (istHour === 15 && istMin >= 30);
}

async function printV2Breakdown(symbol: string) {
  const stock = await MarketService.getStockData(symbol);
  if (!stock) { console.log(`${symbol}: no data`); return; }

  const todayStr = getISTDateString();

  let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
  let todayCandle     = { high: stock.high, low: stock.low, close: stock.ltp };

  let isLastToday = false;
  let isTodayCandleFinal = false;

  if (stock.history && stock.history.length > 0) {
    const lastCandle = stock.history[stock.history.length - 1];
    isLastToday = lastCandle.date === todayStr;
    isTodayCandleFinal = isLastToday && isTodayCandleClosed();

    todayCandle = isTodayCandleFinal
      ? lastCandle
      : { high: stock.high, low: stock.low, close: stock.ltp };

    yesterdayCandle = isLastToday
      ? (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : lastCandle)
      : lastCandle;
  }

  const atrPct = getAtrPct(stock.history || [], stock.close);

  const todayCpr    = calculateCPR({ high: yesterdayCandle.high, low: yesterdayCandle.low, close: yesterdayCandle.close }, atrPct);
  const tomorrowCpr = calculateCPR({ high: todayCandle.high,     low: todayCandle.low,     close: todayCandle.close     }, atrPct);

  const isHvLong  = tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc;
  const isLvShort = tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc;

  const direction: string = isHvLong ? 'LONG' : (isLvShort ? 'SHORT' : 'NEUTRAL');
  const hvPassed = isHvLong;
  const lvPassed = isLvShort;
  const allGatesPassed = hvPassed;

  const range = todayCandle.high - todayCandle.low;
  let clv = range > 0 ? ((2 * todayCandle.close - todayCandle.high - todayCandle.low) / range) : 0;
  clv = Math.max(-1, Math.min(1, clv));

  const sessionVirgin = isCprVirgin(stock.high, stock.low, todayCpr.tc, todayCpr.bc);
  const liquidityPassed = stock.avgVolume >= 500000 && (stock.ltp * stock.volume) >= 150000000;

  let clvScore = 0;
  if (direction === 'LONG')       clvScore = Math.round(((clv + 1) / 2) * 75);
  else if (direction === 'SHORT') clvScore = Math.round(((-clv + 1) / 2) * 75);

  const cprScore       = (tomorrowCpr.classification === 'NARROW' || sessionVirgin) ? 15 : 0;
  const liquidityScore = liquidityPassed ? 10 : 0;

  const scoreBeforeGate = clvScore + cprScore + liquidityScore;
  const finalScore      = allGatesPassed ? scoreBeforeGate : 0;

  let rejectionReason = '';
  if (!allGatesPassed) {
    if (direction === 'NEUTRAL') rejectionReason = 'NEUTRAL direction — tomorrowCPR not strictly higher or lower than todayCPR';
    else rejectionReason = `direction=${direction} but hvPassed=false`;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SYMBOL         : ${symbol}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`todayStr       : ${todayStr}`);
  console.log(`isLastToday    : ${isLastToday}`);
  console.log(`isFinalCandle  : ${isTodayCandleFinal}`);
  console.log(`\n-- Candles used --`);
  console.log(`yesterdayCandle: H=${yesterdayCandle.high}  L=${yesterdayCandle.low}  C=${yesterdayCandle.close}`);
  console.log(`todayCandle    : H=${todayCandle.high}  L=${todayCandle.low}  C=${todayCandle.close}`);
  console.log(`\n-- Today CPR (built from yesterday candle) --`);
  console.log(`  TC=${todayCpr.tc.toFixed(4)}  BC=${todayCpr.bc.toFixed(4)}  Pivot=${todayCpr.pivot.toFixed(4)}`);
  console.log(`  Classification: ${todayCpr.classification}`);
  console.log(`\n-- Tomorrow CPR (built from today candle) --`);
  console.log(`  TC=${tomorrowCpr.tc.toFixed(4)}  BC=${tomorrowCpr.bc.toFixed(4)}  Pivot=${tomorrowCpr.pivot.toFixed(4)}`);
  console.log(`  Classification: ${tomorrowCpr.classification}`);
  const cprWidth = tomorrowCpr.pivot > 0 ? (Math.abs(tomorrowCpr.tc - tomorrowCpr.bc) / tomorrowCpr.pivot) * 100 : 999;
  console.log(`  CPR Width%    : ${cprWidth.toFixed(4)}`);
  console.log(`\n-- Direction & Gates --`);
  console.log(`  Higher Value (isHvLong)  : ${isHvLong}  (tomorBC=${tomorrowCpr.bc.toFixed(4)} > todayBC=${todayCpr.bc.toFixed(4)}: ${tomorrowCpr.bc > todayCpr.bc}, tomorTC=${tomorrowCpr.tc.toFixed(4)} > todayTC=${todayCpr.tc.toFixed(4)}: ${tomorrowCpr.tc > todayCpr.tc})`);
  console.log(`  Lower Value  (isLvShort) : ${isLvShort}  (tomorBC=${tomorrowCpr.bc.toFixed(4)} < todayBC=${todayCpr.bc.toFixed(4)}: ${tomorrowCpr.bc < todayCpr.bc}, tomorTC=${tomorrowCpr.tc.toFixed(4)} < todayTC=${todayCpr.tc.toFixed(4)}: ${tomorrowCpr.tc < todayCpr.tc})`);
  console.log(`  Direction    : ${direction}`);
  console.log(`  hvPassed     : ${hvPassed}`);
  console.log(`  lvPassed     : ${lvPassed}`);
  console.log(`  allGates     : ${allGatesPassed}`);
  console.log(`\n-- CLV --`);
  console.log(`  range        : ${range.toFixed(4)}`);
  console.log(`  clv (raw)    : ${clv.toFixed(6)}`);
  console.log(`  clv score    : ${clvScore}`);
  console.log(`\n-- CPR Score --`);
  console.log(`  tomorrowCPR class : ${tomorrowCpr.classification}`);
  console.log(`  sessionVirgin     : ${sessionVirgin}`);
  console.log(`  cprScore          : ${cprScore}`);
  console.log(`\n-- Liquidity --`);
  console.log(`  avgVolume    : ${stock.avgVolume}  (>= 500000: ${stock.avgVolume >= 500000})`);
  console.log(`  ltp * volume : ${(stock.ltp * stock.volume).toFixed(0)}  (>= 150000000: ${stock.ltp * stock.volume >= 150000000})`);
  console.log(`  liquidityPassed: ${liquidityPassed}`);
  console.log(`  liquidityScore : ${liquidityScore}`);
  console.log(`\n-- Final Score --`);
  console.log(`  scoreBeforeGate : ${scoreBeforeGate}  (clv=${clvScore} + cpr=${cprScore} + liq=${liquidityScore})`);
  console.log(`  allGatesPassed  : ${allGatesPassed}`);
  console.log(`  FINAL V2 SCORE  : ${finalScore}`);
  if (!allGatesPassed) console.log(`  REJECTION REASON: ${rejectionReason}`);
}

async function main() {
  await printV2Breakdown('INOXWIND');
  await printV2Breakdown('DIXON');
  process.exit(0);
}
main();
