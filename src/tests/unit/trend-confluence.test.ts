import test from 'node:test';
import assert from 'node:assert';
import { BtstRankingService } from '../../services/overnight/btst-ranking.service';
import { StbtRankingService } from '../../services/overnight/stbt-ranking.service';

test('Trend Confluence Shadow Scoring', async (t) => {
  // Base fixed inputs for original 6 rules
  const baseInputs = {
    volume: 500000,
    avgVolume: 200000,
    tomorrowCprNarrow: true, // +30
    tomorrowBc: 105, tomorrowTc: 108,
    todayBc: 100, todayTc: 103, // +20 (higher value)
    close: 110, high: 112, low: 104, // closeStrength: (110-104)/8 = 0.75 > 0.70 (+15)
    vwap: 102, // close > tc and close > vwap (+20)
    intradayVolume: 400000,
    last15mHigh: 108, // close > 108 (+20)
    last15mLow: 101, // for STBT
    hasConfirmationCandles: true,
  };

  // Base score sum should be:
  // VDU: 500k >= 2.0*200k = +25
  // CPR Narrow: +30
  // Higher Value: +20
  // VWAP: +20
  // Liquidity: +20
  // Closing Strength: +15
  // Total = 130
  const baseExpectedBtstScore = 130;

  await t.test('BTST - Fresh bullish cross + RSI 55 -> 15 pts', () => {
    const res = BtstRankingService.calculateScoreDetails({
      ...baseInputs,
      rsi14: 55,
      emaCross: { cross: 'BULLISH', isBullishAlignment: true }
    });
    assert.strictEqual(res.score, baseExpectedBtstScore, 'Total score must remain untouched');
    assert.strictEqual(res.breakdown?.trendConfluence, 15);
  });

  await t.test('BTST - Bullish alignment only + RSI 60 -> 5 pts', () => {
    const res = BtstRankingService.calculateScoreDetails({
      ...baseInputs,
      rsi14: 60,
      emaCross: { cross: 'NONE', isBullishAlignment: true }
    });
    assert.strictEqual(res.score, baseExpectedBtstScore, 'Total score must remain untouched');
    assert.strictEqual(res.breakdown?.trendConfluence, 5);
  });

  await t.test('BTST - Bullish alignment + RSI 75 (overbought trap) -> -10 pts', () => {
    const res = BtstRankingService.calculateScoreDetails({
      ...baseInputs,
      rsi14: 75,
      emaCross: { cross: 'NONE', isBullishAlignment: true }
    });
    assert.strictEqual(res.score, baseExpectedBtstScore, 'Total score must remain untouched');
    assert.strictEqual(res.breakdown?.trendConfluence, -10);
  });

  await t.test('BTST - Missing RSI or EMA data -> 0 pts, no throw', () => {
    const res = BtstRankingService.calculateScoreDetails({
      ...baseInputs,
      rsi14: undefined,
      emaCross: null
    });
    assert.strictEqual(res.score, baseExpectedBtstScore, 'Total score must remain untouched');
    assert.strictEqual(res.breakdown?.trendConfluence, 0);
  });

  // Bearish test inputs for STBT
  const bearInputs = {
    volume: 500000,
    avgVolume: 200000,
    tomorrowCprNarrow: true, // +30
    tomorrowBc: 95, tomorrowTc: 98,
    todayBc: 100, todayTc: 103, // +20 (lower value)
    close: 90, high: 105, low: 88, // closeWeakness: (90-88)/17 = 0.11 < 0.30 (+15)
    vwap: 99, // close < bc and close < vwap (+20)
    intradayVolume: 400000,
    last15mHigh: 100,
    last15mLow: 92, // close < 92 (+20)
    hasConfirmationCandles: true,
  };
  const baseExpectedStbtScore = 130;

  await t.test('STBT - Fresh bearish cross + RSI 45 -> 15 pts', () => {
    const res = StbtRankingService.calculateScoreDetails({
      ...bearInputs,
      rsi14: 45,
      emaCross: { cross: 'BEARISH', isBullishAlignment: false }
    });
    assert.strictEqual(res.score, baseExpectedStbtScore, 'Total score must remain untouched');
    assert.strictEqual(res.breakdown?.trendConfluence, 15);
  });

  await t.test('STBT - Bearish alignment only + RSI 40 -> 5 pts', () => {
    const res = StbtRankingService.calculateScoreDetails({
      ...bearInputs,
      rsi14: 40,
      emaCross: { cross: 'NONE', isBullishAlignment: false }
    });
    assert.strictEqual(res.score, baseExpectedStbtScore, 'Total score must remain untouched');
    assert.strictEqual(res.breakdown?.trendConfluence, 5);
  });

  await t.test('STBT - Bearish alignment + RSI 25 (oversold trap) -> -10 pts', () => {
    const res = StbtRankingService.calculateScoreDetails({
      ...bearInputs,
      rsi14: 25,
      emaCross: { cross: 'NONE', isBullishAlignment: false }
    });
    assert.strictEqual(res.score, baseExpectedStbtScore, 'Total score must remain untouched');
    assert.strictEqual(res.breakdown?.trendConfluence, -10);
  });

  await t.test('STBT - Missing data -> 0 pts', () => {
    const res = StbtRankingService.calculateScoreDetails({
      ...bearInputs,
      rsi14: null,
      emaCross: undefined
    });
    assert.strictEqual(res.score, baseExpectedStbtScore, 'Total score must remain untouched');
    assert.strictEqual(res.breakdown?.trendConfluence, 0);
  });

  await t.test('Regression check on base score output identity', () => {
    // Assert strictly that adding the shadow fields does not alter the exact base score
    const resBefore = BtstRankingService.calculateScoreDetails(baseInputs as any);
    const resAfter = BtstRankingService.calculateScoreDetails({
      ...baseInputs, rsi14: 55, emaCross: { cross: 'BULLISH', isBullishAlignment: true }
    });
    assert.strictEqual(resBefore.score, resAfter.score, 'Score strictly equal');
    assert.strictEqual(resBefore.breakdown?.vdu, resAfter.breakdown?.vdu);
    assert.strictEqual(resBefore.breakdown?.cprNarrow, resAfter.breakdown?.cprNarrow);
    assert.strictEqual(resBefore.breakdown?.vwap, resAfter.breakdown?.vwap);
  });
});
