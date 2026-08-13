import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BREAKOUT_CONFIRM,
  applyBreakoutSignals,
  getBreakoutCandidate,
  isBreakoutConfirmed,
} from '@/lib/breakout-confirm';
import { VOLUME_THRESHOLDS } from '@/config/trading-constants';

describe('breakout-confirm', () => {
  it('getBreakoutCandidate requires volume + LTP beyond TC/BC', () => {
    assert.equal(getBreakoutCandidate(1.0, 110, 100, 99), null);
    assert.equal(
      getBreakoutCandidate(VOLUME_THRESHOLDS.BREAKOUT_RATIO, 110, 100, 99),
      'UP'
    );
    assert.equal(
      getBreakoutCandidate(VOLUME_THRESHOLDS.BREAKOUT_RATIO, 90, 100, 99),
      'DOWN'
    );
    assert.equal(
      getBreakoutCandidate(VOLUME_THRESHOLDS.BREAKOUT_RATIO, 99.5, 100, 99),
      null
    );
  });

  it('rejects session reclaim until RECLAIM_HOLD_MINUTES', () => {
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 99,
        high: 102,
        low: 98,
        holdMinutes: BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES - 1,
      }),
      false
    );
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 99,
        high: 102,
        low: 98,
        holdMinutes: BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES,
      }),
      true
    );
  });

  it('rejects UP gap flicker without hold or 15m close', () => {
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 100.5,
        high: 101,
        low: 100.2,
        holdMinutes: 0,
      }),
      false
    );
  });

  it('confirms UP gap continuation only after HOLD_MINUTES (10)', () => {
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 100.5,
        high: 101,
        low: 100.2,
        holdMinutes: BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES,
      }),
      false
    );
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 100.5,
        high: 101,
        low: 100.2,
        holdMinutes: BREAKOUT_CONFIRM.HOLD_MINUTES,
      }),
      true
    );
  });

  it('15m close beyond level confirms immediately', () => {
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 100.5,
        high: 101,
        low: 100.2,
        candle15m: { open: 100.5, high: 101.2, low: 100.3, close: 101 },
        holdMinutes: 0,
        allowSessionReclaim: false,
      }),
      true
    );
  });

  it('15m close inside CPR still confirms via session reclaim when hold is met', () => {
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 99,
        high: 102,
        low: 98,
        candle15m: { open: 99, high: 101, low: 98, close: 99.5 },
        holdMinutes: BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES,
      }),
      true
    );
  });

  it('15m close inside CPR does not confirm flicker without reclaim hold', () => {
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 99,
        high: 102,
        low: 98,
        candle15m: { open: 99, high: 101, low: 98, close: 99.5 },
        holdMinutes: 0,
      }),
      false
    );
  });

  it('allowSessionReclaim false blocks reclaim without 15m', () => {
    assert.equal(
      isBreakoutConfirmed({
        direction: 'UP',
        ltp: 101,
        level: 100,
        open: 99,
        high: 102,
        low: 98,
        holdMinutes: 30,
        allowSessionReclaim: false,
      }),
      false
    );
  });

  it('confirms DOWN via session reclaim after reclaim hold', () => {
    assert.equal(
      isBreakoutConfirmed({
        direction: 'DOWN',
        ltp: 98,
        level: 100,
        open: 101,
        high: 102,
        low: 97,
        holdMinutes: BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES,
      }),
      true
    );
  });

  it('applyBreakoutSignals tags BREAKOUT only when confirmed', () => {
    const signals: string[] = [];
    applyBreakoutSignals(signals, VOLUME_THRESHOLDS.BREAKOUT_RATIO, 101, 100, 99, {
      open: 100.5,
      high: 101,
      low: 100.2,
      holdMinutes: 0,
    });
    assert.equal(signals.includes('BREAKOUT'), false);

    applyBreakoutSignals(signals, VOLUME_THRESHOLDS.BREAKOUT_RATIO, 101, 100, 99, {
      open: 99,
      high: 102,
      low: 98,
      holdMinutes: BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES,
    });
    assert.equal(signals.includes('BREAKOUT'), true);
  });
});
