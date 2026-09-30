import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Enterprise Market Tools Workstation Contract (Phase 10)', () => {
  it('validates Market Breadth regime score mapping and scale formatting (-10 to +10)', () => {
    const rawScores = [
      { raw: 10, expectedLabel: 'Extremely Bullish', barPct: 100 },
      { raw: 5, expectedLabel: 'Bullish', barPct: 75 },
      { raw: 0, expectedLabel: 'Neutral', barPct: 50 },
      { raw: -5, expectedLabel: 'Bearish', barPct: 25 },
      { raw: -10, expectedLabel: 'Extremely Bearish', barPct: 0 },
    ];

    const getRegimeLabel = (score: number) => {
      if (score >= 7) return 'Extremely Bullish';
      if (score >= 3) return 'Bullish';
      if (score > -3) return 'Neutral';
      if (score > -7) return 'Bearish';
      return 'Extremely Bearish';
    };

    const getBarPercentage = (score: number) => {
      // Map [-10, 10] to [0, 100]
      const clamped = Math.max(-10, Math.min(10, score));
      return ((clamped + 10) / 20) * 100;
    };

    for (const item of rawScores) {
      assert.equal(getRegimeLabel(item.raw), item.expectedLabel);
      assert.equal(getBarPercentage(item.raw), item.barPct);
    }
  });

  it('validates Multi-Year Breakout window filtering logic without mutating records', () => {
    const stocks = [
      { symbol: 'RELIANCE', breakout1Y: true, breakout2Y: true, breakout5Y: false, breakoutATH: false },
      { symbol: 'TCS', breakout1Y: true, breakout2Y: true, breakout5Y: true, breakoutATH: false },
      { symbol: 'INFY', breakout1Y: true, breakout2Y: true, breakout5Y: true, breakoutATH: true },
      { symbol: 'HDFCBANK', breakout1Y: true, breakout2Y: false, breakout5Y: false, breakoutATH: false },
    ];

    const filterByWindow = (win: 'ALL' | '1Y' | '2Y' | '5Y' | 'ATH') => {
      return stocks.filter((stock) => {
        if (win === '1Y' && !stock.breakout1Y) return false;
        if (win === '2Y' && !stock.breakout2Y) return false;
        if (win === '5Y' && !stock.breakout5Y) return false;
        if (win === 'ATH' && !stock.breakoutATH) return false;
        return true;
      });
    };

    assert.equal(filterByWindow('ALL').length, 4);
    assert.equal(filterByWindow('1Y').length, 4);
    assert.equal(filterByWindow('2Y').length, 3);
    assert.equal(filterByWindow('5Y').length, 2);
    assert.equal(filterByWindow('ATH').length, 1);
    assert.equal(filterByWindow('ATH')[0]?.symbol, 'INFY');
  });

  it('validates Pattern Breakout Trade-Ready filter invariants and quality tier constraints', () => {
    const candidates = [
      {
        symbol: 'TITAN',
        primaryPattern: 'CUP_AND_HANDLE',
        rvol20d: 2.2,
        qualityTier: 'A+' as const,
        isEtf: false,
      },
      {
        symbol: 'SBIN',
        primaryPattern: 'VCP',
        rvol20d: 1.8,
        qualityTier: 'A' as const,
        isEtf: false,
      },
      {
        symbol: 'LT',
        primaryPattern: 'NONE', // Raw 52W High, not a classical chart pattern
        rvol20d: 2.5,
        qualityTier: 'A' as const,
        isEtf: false,
      },
      {
        symbol: 'NIFTYBEES', // ETF
        primaryPattern: 'FLAT_BASE',
        rvol20d: 3.0,
        qualityTier: 'A+' as const,
        isEtf: true,
      },
      {
        symbol: 'WIPRO',
        primaryPattern: 'DOUBLE_BOTTOM',
        rvol20d: 1.2, // Below 1.75 threshold
        qualityTier: 'A' as const,
        isEtf: false,
      },
      {
        symbol: 'ITC',
        primaryPattern: 'VCP',
        rvol20d: 2.0,
        qualityTier: 'B' as const, // Tier B, not A or A+
        isEtf: false,
      },
    ];

    const isTradeReady = (c: (typeof candidates)[0]) => {
      if (c.qualityTier !== 'A+' && c.qualityTier !== 'A') return false;
      if (c.rvol20d === null || c.rvol20d < 1.75) return false;
      if (c.primaryPattern === 'NONE') return false;
      if (c.isEtf) return false;
      return true;
    };

    const tradeReadyList = candidates.filter(isTradeReady);
    assert.equal(tradeReadyList.length, 2);
    assert.deepEqual(tradeReadyList.map((x) => x.symbol), ['TITAN', 'SBIN']);
  });

  it('validates Multi-Window Momentum Leaders window consensus and tier aggregation', () => {
    const stocks = [
      { symbol: 'TRENT', leaderWindowCount: 4, tier: 'A+' as const, compositeScore: 94 },
      { symbol: 'BEL', leaderWindowCount: 3, tier: 'A' as const, compositeScore: 82 },
      { symbol: 'HAL', leaderWindowCount: 2, tier: 'B' as const, compositeScore: 68 },
      { symbol: 'BHEL', leaderWindowCount: 1, tier: 'C' as const, compositeScore: 45 },
    ];

    const filterByWindows = (selection: 'ALL' | '4' | '3' | '2') => {
      return stocks.filter((stock) => {
        if (selection === '4' && stock.leaderWindowCount !== 4) return false;
        if (selection === '3' && stock.leaderWindowCount < 3) return false;
        if (selection === '2' && stock.leaderWindowCount < 2) return false;
        return true;
      });
    };

    assert.equal(filterByWindows('ALL').length, 4);
    assert.equal(filterByWindows('4').length, 1);
    assert.equal(filterByWindows('4')[0]?.symbol, 'TRENT');
    assert.equal(filterByWindows('3').length, 2); // 4 and 3
    assert.equal(filterByWindows('2').length, 3); // 4, 3, and 2
  });

  it('validates Workstation Table Density styling resolution', () => {
    const resolvePadding = (density: 'compact' | 'comfortable') => {
      return density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';
    };

    assert.equal(resolvePadding('compact'), 'py-1.5 px-3');
    assert.equal(resolvePadding('comfortable'), 'py-2.5 px-3');
  });

  it('validates StockDetailDrawer payload construction across market tool symbol clicks', () => {
    // Multi-Year Breakout item
    const breakoutItem = {
      symbol: 'TATAMOTORS',
      close: 980.5,
      changePct: 3.25,
      sector: 'Automobile',
      strongestBreakout: '5Y',
      volume: 4500000,
    };

    const breakoutDrawerData = {
      symbol: breakoutItem.symbol,
      ltp: breakoutItem.close,
      previousClose: 950.0,
      sector: breakoutItem.sector,
      signals: [breakoutItem.strongestBreakout ? `${breakoutItem.strongestBreakout}_BREAKOUT` : 'BREAKOUT'],
      signalSummary: breakoutItem.strongestBreakout ? `${breakoutItem.strongestBreakout} Breakout` : 'Breakout',
    };

    assert.equal(breakoutDrawerData.symbol, 'TATAMOTORS');
    assert.deepEqual(breakoutDrawerData.signals, ['5Y_BREAKOUT']);
    assert.equal(breakoutDrawerData.ltp, 980.5);

    // Pattern Breakout item
    const patternItem = {
      symbol: 'DIXON',
      close: 14250.0,
      prevClose: 13600.0,
      changePct: 4.8,
      sector: 'Consumer Durables',
      primaryPattern: 'VCP' as const,
      primaryPatternLabel: 'VCP Base',
      volume: 680000,
    };

    const patternDrawerData = {
      symbol: patternItem.symbol,
      ltp: patternItem.close,
      previousClose: patternItem.prevClose,
      sector: patternItem.sector,
      signals: [patternItem.primaryPattern || 'BREAKOUT'],
      signalSummary: patternItem.primaryPatternLabel,
    };

    assert.equal(patternDrawerData.symbol, 'DIXON');
    assert.deepEqual(patternDrawerData.signals, ['VCP']);
    assert.equal(patternDrawerData.ltp, 14250.0);
    assert.equal(patternDrawerData.signalSummary, 'VCP Base');
  });
});
