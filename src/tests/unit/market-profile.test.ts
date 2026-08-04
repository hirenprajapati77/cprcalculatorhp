import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import {
  MARKET_PROFILES,
  MarketSessionResolver,
  resolveMarketProfile,
  clocksForContext,
  supportsClosingAuction,
  toProfileTotalMinutes,
} from '../../config/market-profile';
import {
  getSessionState,
  shouldFreezeBreakouts,
  BTST_WINDOW_MINUTES,
  BTST_CLOCK,
  isInClosingLiquidityWindow,
  isMarketOpen,
  isBtstDiscoveryOpen,
} from '../../lib/market-hours';
import { MARKET_SESSION, BTST_WINDOWS, CPR_JOURNAL_WINDOW } from '../../config/trading-constants';

/** Tuesday 2026-08-04 — known trading day. Build IST wall-clock as UTC-5:30. */
function istDate(hour: number, minute: number): Date {
  const utcHour = hour - 5;
  const utcMinute = minute - 30;
  let h = utcHour;
  let m = utcMinute;
  let day = 4;
  if (m < 0) {
    m += 60;
    h -= 1;
  }
  if (h < 0) {
    h += 24;
    day -= 1;
  }
  return new Date(Date.UTC(2026, 7, day, h, m, 0));
}

describe('Market Profile — CONTINUOUS identity (default env)', () => {
  it('active profile resolves to CONTINUOUS clocks matching prior production', () => {
    const p = resolveMarketProfile(process.env.MARKET_PROFILE);
    assert.strictEqual(p.id, 'CONTINUOUS');
    assert.deepStrictEqual(MARKET_SESSION.CLOSE, { hour: 15, minute: 30 });
    assert.deepStrictEqual(BTST_WINDOWS.DISCOVERY_START, { hour: 15, minute: 10 });
    assert.deepStrictEqual(BTST_WINDOWS.DISCOVERY_END_EXCLUSIVE, { hour: 15, minute: 25 });
    assert.deepStrictEqual(BTST_WINDOWS.CLOSING_WINDOW_START, { hour: 15, minute: 15 });
    assert.deepStrictEqual(BTST_WINDOWS.CONFIRM_START, { hour: 15, minute: 15 });
    assert.deepStrictEqual(BTST_WINDOWS.JOURNAL_START, { hour: 15, minute: 25 });
    assert.deepStrictEqual(BTST_WINDOWS.JOURNAL_END_INCLUSIVE, { hour: 15, minute: 30 });
    assert.strictEqual(CPR_JOURNAL_WINDOW.START_HHMM, 1520);
    assert.strictEqual(CPR_JOURNAL_WINDOW.END_HHMM, 1524);
  });

  it('BTST_WINDOW_MINUTES / BTST_CLOCK match CONTINUOUS fixtures', () => {
    assert.strictEqual(BTST_WINDOW_MINUTES.MARKET_CLOSE, 15 * 60 + 30);
    assert.strictEqual(BTST_WINDOW_MINUTES.DISCOVERY_START, 15 * 60 + 10);
    assert.strictEqual(BTST_WINDOW_MINUTES.DISCOVERY_END, 15 * 60 + 25);
    assert.strictEqual(BTST_WINDOW_MINUTES.CLOSING_WINDOW_START, 15 * 60 + 15);
    assert.strictEqual(BTST_CLOCK.marketClose, '15:30');
    assert.strictEqual(BTST_CLOCK.discoveryEnd, '15:25');
  });

  it('isInClosingLiquidityWindow is [15:15, 15:30) under CONTINUOUS', () => {
    assert.equal(isInClosingLiquidityWindow(15 * 60 + 14), false);
    assert.equal(isInClosingLiquidityWindow(15 * 60 + 15), true);
    assert.equal(isInClosingLiquidityWindow(15 * 60 + 29), true);
    assert.equal(isInClosingLiquidityWindow(15 * 60 + 30), false);
  });

  it('supportsClosingAuction is always false under CONTINUOUS', () => {
    assert.equal(supportsClosingAuction('INFY', { isFnO: true, profileId: 'CONTINUOUS' }), false);
    assert.equal(MarketSessionResolver.supportsClosingAuction('INFY', { isFnO: true }), false);
  });

  it('getSessionState never emits CAS/FNO_ONLY under CONTINUOUS', () => {
    const ctx = MarketSessionResolver.resolve('INFY', { isFnO: true, profileId: 'CONTINUOUS' });
    assert.strictEqual(getSessionState(istDate(15, 20), ctx), 'LIVE');
    assert.strictEqual(getSessionState(istDate(15, 35), ctx), 'CLOSED');
  });

  it('shouldFreezeBreakouts is false under CONTINUOUS even for F&O after 15:15', () => {
    const ctx = MarketSessionResolver.resolve('INFY', { isFnO: true, profileId: 'CONTINUOUS' });
    assert.equal(shouldFreezeBreakouts(istDate(15, 20), ctx), false);
  });
});

describe('Market Profile — CLOSING_AUCTION simulation', () => {
  it('SEBI-locked clocks on CLOSING_AUCTION profile', () => {
    const p = MARKET_PROFILES.CLOSING_AUCTION;
    assert.deepStrictEqual(p.cashContinuousEnd, { hour: 15, minute: 15 });
    assert.deepStrictEqual(p.casEnd, { hour: 15, minute: 35 });
    assert.deepStrictEqual(p.officialClose, { hour: 15, minute: 35 });
    assert.deepStrictEqual(p.discoveryEndExclusive, { hour: 15, minute: 15 });
    assert.deepStrictEqual(p.rule5Start, { hour: 15, minute: 0 });
    assert.deepStrictEqual(p.rule5EndExclusive, { hour: 15, minute: 15 });
    assert.deepStrictEqual(p.fnoSessionEnd, { hour: 15, minute: 40 });
    assert.strictEqual(p.freezeBreakoutsAfterContinuousEnd, true);
    assert.strictEqual(p.cprJournalStartHhmm, 1535);
    assert.strictEqual(p.cprJournalEndHhmm, 1537);
    assert.deepStrictEqual(p.btstJournalStart, { hour: 15, minute: 38 });
    assert.deepStrictEqual(p.btstJournalEndInclusive, { hour: 15, minute: 40 });
  });

  it('supportsClosingAuction: F&O true, non-F&O false under CLOSING_AUCTION', () => {
    assert.equal(
      MarketSessionResolver.supportsClosingAuction('INFY', { isFnO: true, profileId: 'CLOSING_AUCTION' }),
      true
    );
    assert.equal(
      MarketSessionResolver.supportsClosingAuction('MGL', { isFnO: false, profileId: 'CLOSING_AUCTION' }),
      false
    );
  });

  it('MarketSessionContext carries resolver fields', () => {
    const ctx = MarketSessionResolver.resolve('INFY', { isFnO: true, profileId: 'CLOSING_AUCTION' });
    assert.strictEqual(ctx.symbol, 'INFY');
    assert.equal(ctx.isFnO, true);
    assert.equal(ctx.supportsClosingAuction, true);
    assert.strictEqual(ctx.profile, 'CLOSING_AUCTION');
  });

  it('getSessionState F&O: LIVE→CAS at 15:15, CAS until 15:35, FNO_ONLY until 15:40', () => {
    const ctx = MarketSessionResolver.resolve('INFY', { isFnO: true, profileId: 'CLOSING_AUCTION' });
    assert.strictEqual(getSessionState(istDate(15, 14), ctx), 'LIVE');
    assert.strictEqual(getSessionState(istDate(15, 15), ctx), 'CAS');
    assert.strictEqual(getSessionState(istDate(15, 34), ctx), 'CAS');
    assert.strictEqual(getSessionState(istDate(15, 35), ctx), 'FNO_ONLY');
    assert.strictEqual(getSessionState(istDate(15, 39), ctx), 'FNO_ONLY');
    assert.strictEqual(getSessionState(istDate(15, 40), ctx), 'CLOSED');
  });

  it('getSessionState non-F&O: still LIVE at 15:20, no CAS', () => {
    const ctx = MarketSessionResolver.resolve('MGL', { isFnO: false, profileId: 'CLOSING_AUCTION' });
    assert.equal(ctx.supportsClosingAuction, false);
    assert.strictEqual(clocksForContext(ctx).id, 'CONTINUOUS');
    assert.strictEqual(getSessionState(istDate(15, 20), ctx), 'LIVE');
    assert.strictEqual(getSessionState(istDate(15, 29), ctx), 'LIVE');
    assert.strictEqual(getSessionState(istDate(15, 30), ctx), 'CLOSED');
  });

  it('shouldFreezeBreakouts after 15:15 for F&O only', () => {
    const fno = MarketSessionResolver.resolve('INFY', { isFnO: true, profileId: 'CLOSING_AUCTION' });
    const cash = MarketSessionResolver.resolve('MGL', { isFnO: false, profileId: 'CLOSING_AUCTION' });
    assert.equal(shouldFreezeBreakouts(istDate(15, 14), fno), false);
    assert.equal(shouldFreezeBreakouts(istDate(15, 15), fno), true);
    assert.equal(shouldFreezeBreakouts(istDate(15, 20), fno), true);
    assert.equal(shouldFreezeBreakouts(istDate(15, 20), cash), false);
  });

  it('Rule5 window bounds on CLOSING_AUCTION profile object', () => {
    const p = MARKET_PROFILES.CLOSING_AUCTION;
    const start = toProfileTotalMinutes(p.rule5Start);
    const end = toProfileTotalMinutes(p.rule5EndExclusive);
    assert.strictEqual(start, 15 * 60);
    assert.strictEqual(end, 15 * 60 + 15);
    // Auction bar at 15:20 is outside Rule5 continuous window
    assert.ok(15 * 60 + 20 >= end);
  });
});

describe('Market Profile — unknown env falls back to CONTINUOUS', () => {
  it('resolveMarketProfile ignores garbage', () => {
    assert.strictEqual(resolveMarketProfile('NOPE').id, 'CONTINUOUS');
    assert.strictEqual(resolveMarketProfile('').id, 'CONTINUOUS');
    assert.strictEqual(resolveMarketProfile(null).id, 'CONTINUOUS');
  });
});

// Sanity: default process still sees continuous discovery open helper at 15:20
describe('Market Profile — default helpers still continuous', () => {
  it('isMarketOpen / discovery helpers use CONTINUOUS module clocks', () => {
    assert.equal(isMarketOpen(istDate(15, 20)), true);
    assert.equal(isMarketOpen(istDate(15, 30)), false);
    assert.equal(isBtstDiscoveryOpen(istDate(15, 20)), true);
    assert.equal(isBtstDiscoveryOpen(istDate(15, 25)), false);
  });
});
