import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  atrScaledExtensionCap,
  isBreakoutAgainstPriorClose,
  isBreakoutEntryGapInvalidated,
  isBreakoutEntryExtended,
  evaluateCprSetupPriceStalenessBasic,
  evaluateSetupTradeability,
  CPR_ENTRY_EXTENSION_PCT,
  isBreakoutEntryGapInvalidatedOrb,
  isBreakoutEntryExtendedOrb,
  evaluateOrbSetupStaleness,
} from '../../lib/cpr-setup-staleness';

describe('cpr-setup-staleness (Tier 1 coverage)', () => {
  describe('atrScaledExtensionCap', () => {
    it('returns default CPR_ENTRY_EXTENSION_PCT when atrPct is missing or non-positive', () => {
      assert.equal(atrScaledExtensionCap(), CPR_ENTRY_EXTENSION_PCT);
      assert.equal(atrScaledExtensionCap(0), CPR_ENTRY_EXTENSION_PCT);
      assert.equal(atrScaledExtensionCap(-1), CPR_ENTRY_EXTENSION_PCT);
      assert.equal(atrScaledExtensionCap(NaN), CPR_ENTRY_EXTENSION_PCT);
    });

    it('bounds atr-scaled cap between 1.0% and 3.5%', () => {
      // 0.5 * 1.5 = 0.75 -> bounded to min 1.0
      assert.equal(atrScaledExtensionCap(0.5), 1.0);
      // 1.5 * 1.5 = 2.25 -> within [1.0, 3.5]
      assert.equal(atrScaledExtensionCap(1.5), 2.25);
      // 3.0 * 1.5 = 4.5 -> bounded to max 3.5
      assert.equal(atrScaledExtensionCap(3.0), 3.5);
    });
  });

  describe('isBreakoutAgainstPriorClose', () => {
    it('returns false when ltp or previousClose are missing or zero', () => {
      assert.equal(isBreakoutAgainstPriorClose({ ltp: 0, previousClose: 100, direction: 'LONG' }), false);
      assert.equal(isBreakoutAgainstPriorClose({ ltp: 100, previousClose: 0, direction: 'LONG' }), false);
    });

    it('detects LONG breakout while still red vs prior close', () => {
      assert.equal(isBreakoutAgainstPriorClose({ ltp: 99, previousClose: 100, direction: 'LONG' }), true);
      assert.equal(isBreakoutAgainstPriorClose({ ltp: 101, previousClose: 100, direction: 'LONG' }), false);
    });

    it('detects SHORT breakdown while still green vs prior close', () => {
      assert.equal(isBreakoutAgainstPriorClose({ ltp: 101, previousClose: 100, direction: 'SHORT' }), true);
      assert.equal(isBreakoutAgainstPriorClose({ ltp: 99, previousClose: 100, direction: 'SHORT' }), false);
    });
  });

  describe('isBreakoutEntryGapInvalidated', () => {
    it('returns false when inputs are non-positive', () => {
      assert.equal(
        isBreakoutEntryGapInvalidated({ entry: 0, todayHigh: 105, todayLow: 95, direction: 'LONG' }),
        false
      );
    });

    it('detects LONG gap invalidation when todayLow > entry * (1 + buffer)', () => {
      // entry 100, low 101 > 100.2 (with buffer 0.002)
      assert.equal(
        isBreakoutEntryGapInvalidated({ entry: 100, todayHigh: 110, todayLow: 101, direction: 'LONG' }),
        true
      );
      assert.equal(
        isBreakoutEntryGapInvalidated({ entry: 100, todayHigh: 110, todayLow: 99, direction: 'LONG' }),
        false
      );
    });

    it('detects SHORT gap invalidation when todayHigh < entry * (1 - buffer)', () => {
      // entry 100, high 98 < 99.8
      assert.equal(
        isBreakoutEntryGapInvalidated({ entry: 100, todayHigh: 98, todayLow: 90, direction: 'SHORT' }),
        true
      );
      assert.equal(
        isBreakoutEntryGapInvalidated({ entry: 100, todayHigh: 102, todayLow: 90, direction: 'SHORT' }),
        false
      );
    });
  });

  describe('isBreakoutEntryExtended', () => {
    it('returns false for non-positive entry or ltp', () => {
      assert.equal(isBreakoutEntryExtended({ entry: 0, ltp: 100, direction: 'LONG' }), false);
      assert.equal(isBreakoutEntryExtended({ entry: 100, ltp: 0, direction: 'LONG' }), false);
    });

    it('detects LONG entry extension past cap', () => {
      // entry 100, ltp 103 -> 3% >= 2.5% default cap
      assert.equal(isBreakoutEntryExtended({ entry: 100, ltp: 103, direction: 'LONG' }), true);
      assert.equal(isBreakoutEntryExtended({ entry: 100, ltp: 101, direction: 'LONG' }), false);
    });

    it('detects SHORT entry extension past cap', () => {
      // entry 100, ltp 97 -> -3% <= -2.5%
      assert.equal(isBreakoutEntryExtended({ entry: 100, ltp: 97, direction: 'SHORT' }), true);
      assert.equal(isBreakoutEntryExtended({ entry: 100, ltp: 99, direction: 'SHORT' }), false);
    });
  });

  describe('evaluateCprSetupPriceStalenessBasic', () => {
    it('reports GAP_INVALIDATED when entry is outside today range', () => {
      const res = evaluateCprSetupPriceStalenessBasic({
        entry: 100,
        ltp: 105,
        direction: 'LONG',
        todayHigh: 110,
        todayLow: 102,
      });
      assert.equal(res.stale, true);
      if (res.stale) {
        assert.equal(res.reason, 'GAP_INVALIDATED');
      }
    });

    it('reports AGAINST_PRIOR_CLOSE when breakout is opposite to day direction', () => {
      const res = evaluateCprSetupPriceStalenessBasic({
        entry: 100,
        ltp: 99,
        direction: 'LONG',
        previousClose: 101,
      });
      assert.equal(res.stale, true);
      if (res.stale) {
        assert.equal(res.reason, 'AGAINST_PRIOR_CLOSE');
      }
    });

    it('reports EXTENDED when ltp exceeds extension cap', () => {
      const res = evaluateCprSetupPriceStalenessBasic({
        entry: 100,
        ltp: 103,
        direction: 'LONG',
        todayHigh: 105,
        todayLow: 98,
        previousClose: 98,
      });
      assert.equal(res.stale, true);
      if (res.stale) {
        assert.equal(res.reason, 'EXTENDED');
      }
    });

    it('reports stale: false when setup is fresh and within bounds', () => {
      const res = evaluateCprSetupPriceStalenessBasic({
        entry: 100,
        ltp: 100.8,
        direction: 'LONG',
        todayHigh: 102,
        todayLow: 99,
        previousClose: 100,
      });
      assert.equal(res.stale, false);
    });
  });

  describe('evaluateSetupTradeability (Model R:R vs Executable Tradeability)', () => {
    it('preserves modelRr and marks READY with actionable executableRr for normal LONG setup', () => {
      const res = evaluateSetupTradeability({
        entry: 100,
        ltp: 100.8,
        target: 110,
        direction: 'LONG',
        modelRr: '1:2.5',
        todayHigh: 102,
        todayLow: 99,
        previousClose: 100,
      });
      assert.equal(res.status, 'READY');
      assert.equal(res.isExecutable, true);
      assert.equal(res.modelRr, '1:2.5');
      assert.equal(res.executableRr, '1:2.5');
    });

    it('preserves modelRr and marks READY with actionable executableRr for normal SHORT setup', () => {
      const res = evaluateSetupTradeability({
        entry: 100,
        ltp: 99.2,
        target: 90,
        direction: 'SHORT',
        modelRr: '1:3.0',
        todayHigh: 101,
        todayLow: 98,
        previousClose: 100,
      });
      assert.equal(res.status, 'READY');
      assert.equal(res.isExecutable, true);
      assert.equal(res.modelRr, '1:3.0');
      assert.equal(res.executableRr, '1:3.0');
    });

    it('marks EXTENDED and hides executableRr (—) when LONG ltp exceeds 1.5% extension cap', () => {
      const res = evaluateSetupTradeability({
        entry: 100,
        ltp: 103.0,
        target: 120,
        direction: 'LONG',
        modelRr: '1:19.5',
        todayHigh: 105,
        todayLow: 98,
        previousClose: 99,
      });
      assert.equal(res.status, 'EXTENDED');
      assert.equal(res.isExecutable, false);
      assert.equal(res.modelRr, '1:19.5');
      assert.equal(res.executableRr, '—');
    });

    it('marks EXTENDED and hides executableRr (—) when SHORT ltp falls past 1.5% extension cap', () => {
      const res = evaluateSetupTradeability({
        entry: 100,
        ltp: 97.0,
        target: 80,
        direction: 'SHORT',
        modelRr: '1:15.0',
        todayHigh: 102,
        todayLow: 95,
        previousClose: 101,
      });
      assert.equal(res.status, 'EXTENDED');
      assert.equal(res.isExecutable, false);
      assert.equal(res.modelRr, '1:15.0');
      assert.equal(res.executableRr, '—');
    });

    it('evaluates boundary conditions around exact 2.5% cap (LONG)', () => {
      // 2.49% past entry -> within tolerance, READY
      const within = evaluateSetupTradeability({
        entry: 100,
        ltp: 102.49,
        target: 110,
        direction: 'LONG',
        modelRr: '1:2.0',
        todayHigh: 103,
        todayLow: 99,
        previousClose: 100,
      });
      assert.equal(within.status, 'READY');
      assert.equal(within.isExecutable, true);
      assert.equal(within.executableRr, '1:2.0');

      // 2.50% past entry -> at/exceeds cap, EXTENDED
      const atCap = evaluateSetupTradeability({
        entry: 100,
        ltp: 102.50,
        target: 110,
        direction: 'LONG',
        modelRr: '1:2.0',
        todayHigh: 103,
        todayLow: 99,
        previousClose: 100,
      });
      assert.equal(atCap.status, 'EXTENDED');
      assert.equal(atCap.isExecutable, false);
      assert.equal(atCap.executableRr, '—');
    });

    it('evaluates boundary conditions around exact 2.5% cap (SHORT)', () => {
      // 2.49% below entry -> within tolerance, READY
      const within = evaluateSetupTradeability({
        entry: 100,
        ltp: 97.51,
        target: 90,
        direction: 'SHORT',
        modelRr: '1:2.0',
        todayHigh: 101,
        todayLow: 97,
        previousClose: 100,
      });
      assert.equal(within.status, 'READY');
      assert.equal(within.isExecutable, true);
      assert.equal(within.executableRr, '1:2.0');

      // 2.50% below entry -> at/exceeds cap, EXTENDED
      const atCap = evaluateSetupTradeability({
        entry: 100,
        ltp: 97.50,
        target: 90,
        direction: 'SHORT',
        modelRr: '1:2.0',
        todayHigh: 101,
        todayLow: 97,
        previousClose: 100,
      });
      assert.equal(atCap.status, 'EXTENDED');
      assert.equal(atCap.isExecutable, false);
      assert.equal(atCap.executableRr, '—');
    });

    it('marks GAP when price gapped past entry without trading through', () => {
      const res = evaluateSetupTradeability({
        entry: 100,
        ltp: 105,
        target: 110,
        direction: 'LONG',
        modelRr: '1:2.0',
        todayHigh: 110,
        todayLow: 102,
      });
      assert.equal(res.status, 'GAP');
      assert.equal(res.isExecutable, false);
      assert.equal(res.modelRr, '1:2.0');
      assert.equal(res.executableRr, '—');
    });

    it('marks TARGET MET when LTP has reached target', () => {
      const res = evaluateSetupTradeability({
        entry: 100,
        ltp: 110.5,
        target: 110,
        direction: 'LONG',
        modelRr: '1:2.5',
      });
      assert.equal(res.status, 'TARGET MET');
      assert.equal(res.isExecutable, false);
      assert.equal(res.modelRr, '1:2.5');
      assert.equal(res.executableRr, '—');
    });

    it('marks DO NOT TRADE when alert is suppressed', () => {
      const res = evaluateSetupTradeability({
        entry: 100,
        ltp: 100.5,
        target: 110,
        direction: 'LONG',
        modelRr: '1:2.5',
        alertSuppressedReason: 'SECTOR_HEADWIND',
        alertSuppressedDetail: 'NIFTY IT is down 2%',
      });
      assert.equal(res.status, 'DO NOT TRADE');
      assert.equal(res.isExecutable, false);
      assert.equal(res.modelRr, '1:2.5');
      assert.equal(res.executableRr, '—');
      assert.equal(res.detail, 'NIFTY IT is down 2%');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Opening Range Breakout (ORB) staleness tests
  // ──────────────────────────────────────────────────────────────────────────
  describe('isBreakoutEntryGapInvalidatedOrb', () => {
    it('returns false when any input is non-positive', () => {
      assert.equal(
        isBreakoutEntryGapInvalidatedOrb({
          orHigh: 0,
          orLow: 90,
          todayHigh: 100,
          todayLow: 90,
          direction: 'LONG',
        }),
        false
      );
      assert.equal(
        isBreakoutEntryGapInvalidatedOrb({
          orHigh: 100,
          orLow: 0,
          todayHigh: 100,
          todayLow: 90,
          direction: 'LONG',
        }),
        false
      );
    });

    it('LONG ORB: gap-invalidated when todayLow > orHigh * (1 + buffer)', () => {
      // orHigh = 100, todayLow = 101 > 100.2
      assert.equal(
        isBreakoutEntryGapInvalidatedOrb({
          orHigh: 100,
          orLow: 90,
          todayHigh: 110,
          todayLow: 101,
          direction: 'LONG',
        }),
        true
      );
      // todayLow = 99 <= 100.2 → not invalidated
      assert.equal(
        isBreakoutEntryGapInvalidatedOrb({
          orHigh: 100,
          orLow: 90,
          todayHigh: 110,
          todayLow: 99,
          direction: 'LONG',
        }),
        false
      );
    });

    it('SHORT ORB: gap-invalidated when todayHigh < orLow * (1 - buffer)', () => {
      // orLow = 100, todayHigh = 98 < 99.8
      assert.equal(
        isBreakoutEntryGapInvalidatedOrb({
          orHigh: 110,
          orLow: 100,
          todayHigh: 98,
          todayLow: 90,
          direction: 'SHORT',
        }),
        true
      );
      // todayHigh = 102 >= 99.8 → not invalidated
      assert.equal(
        isBreakoutEntryGapInvalidatedOrb({
          orHigh: 110,
          orLow: 100,
          todayHigh: 102,
          todayLow: 90,
          direction: 'SHORT',
        }),
        false
      );
    });
  });

  describe('isBreakoutEntryExtendedOrb', () => {
    it('returns false when orEntry or ltp is non-positive', () => {
      assert.equal(
        isBreakoutEntryExtendedOrb({ orEntry: 0, ltp: 105, direction: 'LONG' }),
        false
      );
      assert.equal(
        isBreakoutEntryExtendedOrb({ orEntry: 100, ltp: 0, direction: 'LONG' }),
        false
      );
    });

    it('LONG ORB: extended when ltp >= orEntry * (1 + cap)', () => {
      // orEntry = 100, ltp = 103, cap = 2.5% → 3% >= 2.5% → extended
      assert.equal(
        isBreakoutEntryExtendedOrb({
          orEntry: 100,
          ltp: 103,
          direction: 'LONG',
        }),
        true
      );
      // orEntry = 100, ltp = 102, cap = 2.5% → 2% < 2.5% → not extended
      assert.equal(
        isBreakoutEntryExtendedOrb({
          orEntry: 100,
          ltp: 102,
          direction: 'LONG',
        }),
        false
      );
    });

    it('SHORT ORB: extended when ltp <= orEntry * (1 - cap)', () => {
      // orEntry = 100, ltp = 97, cap = 2.5% → -3% <= -2.5% → extended
      assert.equal(
        isBreakoutEntryExtendedOrb({
          orEntry: 100,
          ltp: 97,
          direction: 'SHORT',
        }),
        true
      );
      // orEntry = 100, ltp = 98, cap = 2.5% → -2% > -2.5% → not extended
      assert.equal(
        isBreakoutEntryExtendedOrb({
          orEntry: 100,
          ltp: 98,
          direction: 'SHORT',
        }),
        false
      );
    });

    it('uses custom maxExtensionPct when provided', () => {
      // cap = 1% instead of default 2.5%
      assert.equal(
        isBreakoutEntryExtendedOrb({
          orEntry: 100,
          ltp: 101.5,
          direction: 'LONG',
          maxExtensionPct: 1,
        }),
        true
      );
      assert.equal(
        isBreakoutEntryExtendedOrb({
          orEntry: 100,
          ltp: 100.5,
          direction: 'LONG',
          maxExtensionPct: 1,
        }),
        false
      );
    });
  });

  describe('evaluateOrbSetupStaleness', () => {
    it('returns not-stale for a healthy LONG ORB setup', () => {
      const res = evaluateOrbSetupStaleness({
        orEntry: 100,
        orHigh: 100,
        orLow: 95,
        ltp: 101,
        direction: 'LONG',
        todayHigh: 105,
        todayLow: 95,
      });
      assert.equal(res.stale, false);
    });

    it('returns not-stale for a healthy SHORT ORB setup', () => {
      const res = evaluateOrbSetupStaleness({
        orEntry: 100,
        orHigh: 105,
        orLow: 100,
        ltp: 99,
        direction: 'SHORT',
        todayHigh: 105,
        todayLow: 95,
      });
      assert.equal(res.stale, false);
    });

    it('flags GAP_INVALIDATED for LONG ORB when entry outside today range', () => {
      const res = evaluateOrbSetupStaleness({
        orEntry: 100,
        orHigh: 100,
        orLow: 90,
        ltp: 105,
        direction: 'LONG',
        todayHigh: 110,
        todayLow: 101,
      });
      assert.equal(res.stale, true);
      assert.equal(res.reason, 'GAP_INVALIDATED');
      assert.ok(res.detail.includes('100'));
    });

    it('flags GAP_INVALIDATED for SHORT ORB when entry outside today range', () => {
      const res = evaluateOrbSetupStaleness({
        orEntry: 100,
        orHigh: 110,
        orLow: 100,
        ltp: 95,
        direction: 'SHORT',
        todayHigh: 98,
        todayLow: 90,
      });
      assert.equal(res.stale, true);
      assert.equal(res.reason, 'GAP_INVALIDATED');
    });

    it('flags EXTENDED for LONG ORB when LTP chased past cap', () => {
      const res = evaluateOrbSetupStaleness({
        orEntry: 100,
        orHigh: 100,
        orLow: 90,
        ltp: 103,
        direction: 'LONG',
        todayHigh: 105,
        todayLow: 95,
      });
      assert.equal(res.stale, true);
      assert.equal(res.reason, 'EXTENDED');
    });

    it('flags AGAINST_PRIOR_CLOSE for LONG ORB when LTP below prior close', () => {
      const res = evaluateOrbSetupStaleness({
        orEntry: 100,
        orHigh: 100,
        orLow: 90,
        ltp: 99,
        direction: 'LONG',
        previousClose: 100,
      });
      assert.equal(res.stale, true);
      assert.equal(res.reason, 'AGAINST_PRIOR_CLOSE');
    });

    it('skips gap check when todayHigh/todayLow are missing', () => {
      const res = evaluateOrbSetupStaleness({
        orEntry: 100,
        orHigh: 100,
        orLow: 90,
        ltp: 101,
        direction: 'LONG',
      });
      assert.equal(res.stale, false);
    });
  });
});
