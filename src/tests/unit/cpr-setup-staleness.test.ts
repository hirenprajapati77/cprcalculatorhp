import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  atrScaledExtensionCap,
  isBreakoutAgainstPriorClose,
  isBreakoutEntryGapInvalidated,
  isBreakoutEntryExtended,
  evaluateCprSetupPriceStalenessBasic,
  CPR_ENTRY_EXTENSION_PCT,
} from '../../lib/cpr-setup-staleness';

describe('cpr-setup-staleness (Tier 1 coverage)', () => {
  describe('atrScaledExtensionCap', () => {
    it('returns default CPR_ENTRY_EXTENSION_PCT when atrPct is missing or non-positive', () => {
      assert.equal(atrScaledExtensionCap(), CPR_ENTRY_EXTENSION_PCT);
      assert.equal(atrScaledExtensionCap(0), CPR_ENTRY_EXTENSION_PCT);
      assert.equal(atrScaledExtensionCap(-1), CPR_ENTRY_EXTENSION_PCT);
      assert.equal(atrScaledExtensionCap(NaN), CPR_ENTRY_EXTENSION_PCT);
    });

    it('bounds atr-scaled cap between 1.0% and 3.0%', () => {
      // 0.5 * 1.5 = 0.75 -> bounded to min 1.0
      assert.equal(atrScaledExtensionCap(0.5), 1.0);
      // 1.5 * 1.5 = 2.25 -> within [1.0, 3.0]
      assert.equal(atrScaledExtensionCap(1.5), 2.25);
      // 3.0 * 1.5 = 4.5 -> bounded to max 3.0
      assert.equal(atrScaledExtensionCap(3.0), 3.0);
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
      // entry 100, ltp 102 -> 2% >= 1.5% default cap
      assert.equal(isBreakoutEntryExtended({ entry: 100, ltp: 102, direction: 'LONG' }), true);
      assert.equal(isBreakoutEntryExtended({ entry: 100, ltp: 101, direction: 'LONG' }), false);
    });

    it('detects SHORT entry extension past cap', () => {
      // entry 100, ltp 98 -> -2% <= -1.5%
      assert.equal(isBreakoutEntryExtended({ entry: 100, ltp: 98, direction: 'SHORT' }), true);
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
});
