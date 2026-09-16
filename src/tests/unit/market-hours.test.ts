import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import {
  getISTDateString,
  getISTTime,
  isTodayCandleClosed,
  isMarketOpen,
  isPreSession,
  getCashSessionState,
  getCompletedHistory,
  getBtstWindowState,
  isBtstDiscoveryOpen,
  isBtstConfirmOpen,
  isBtstJournalWindowOpen,
  isInClosingLiquidityWindow,
  BTST_WINDOW_MINUTES,
  BTST_CLOCK,
  getRecentNseTradingDays,
} from '../../lib/market-hours';

describe('Market Hours Utilities', () => {
  describe('getISTDateString', () => {
    it('returns the correct IST date during UTC midnight rollover (pre-IST midnight)', () => {
      // 2026-07-09T20:00:00.000Z = 2026-07-10T01:30:00.000+05:30 (IST)
      const date = new Date('2026-07-09T20:00:00.000Z');
      assert.strictEqual(getISTDateString(date), '2026-07-10');
    });

    it('returns the correct IST date during the 5.5 hour mismatch window', () => {
      // 2026-07-09T22:00:00.000Z = 2026-07-10T03:30:00.000+05:30 (IST)
      const date = new Date('2026-07-09T22:00:00.000Z');
      assert.strictEqual(getISTDateString(date), '2026-07-10');
    });
    
    it('returns the correct IST date when UTC and IST days match', () => {
      // 2026-07-09T10:00:00.000Z → same calendar day in IST (UTC+05:30)
      const date = new Date('2026-07-09T10:00:00.000Z');
      assert.strictEqual(getISTDateString(date), '2026-07-09');
    });

    it('matches getISTTime().dateString behavior', () => {
      const date = new Date('2026-07-09T20:00:00.000Z');
      const { dateString } = getISTTime(date);
      assert.strictEqual(getISTDateString(date), dateString);
    });
  });

  describe('isTodayCandleClosed (Live Market Scenario Regression)', () => {
    it('returns false during live market hours (e.g., 2:30 PM IST)', () => {
      // 2026-07-09T09:00:00.000Z → mid-session IST - Market is Open
      const liveMarketDate = new Date('2026-07-09T09:00:00.000Z');
      assert.strictEqual(isTodayCandleClosed(liveMarketDate), false);
      assert.strictEqual(isMarketOpen(liveMarketDate), true);
    });

    it('returns false right before market close', () => {
      // 2026-07-09T09:59:00.000Z → one minute before MARKET_SESSION.CLOSE IST
      const almostClose = new Date('2026-07-09T09:59:00.000Z');
      assert.strictEqual(isTodayCandleClosed(almostClose), false);
    });

    it('returns true after market close (e.g., 4:00 PM IST)', () => {
      // 2026-07-09T10:30:00.000Z = 2026-07-09T16:00:00.000+05:30 (IST) - Market is Closed
      const postMarketDate = new Date('2026-07-09T10:30:00.000Z');
      assert.strictEqual(isTodayCandleClosed(postMarketDate), true);
      assert.strictEqual(isMarketOpen(postMarketDate), false);
    });
  });

  describe('getCompletedHistory', () => {
    it('keeps history unchanged when asOfDate replay is used', () => {
      const history = [
        { date: '2026-07-08', close: 100 },
        { date: '2026-07-09', close: 101 },
      ];
      const result = getCompletedHistory(history, '2026-07-09');
      assert.equal(result.length, 2);
      assert.deepEqual(result, history);
    });

    it('with asOfDate equal to last candle date, returns full history even if wall-clock session is open', () => {
      // Regression: OvernightService.discover(dateOverride) must pass dateStr so
      // getCompletedHistory does not fall back to wall-clock getISTDateString()
      // and incorrectly slice a candle that dateOverride treats as completed.
      const todayStr = getISTDateString();
      const history = [
        { date: '2026-07-08', close: 100 },
        { date: todayStr, close: 101 },
      ];

      const withAsOf = getCompletedHistory(history, todayStr);
      assert.equal(withAsOf.length, 2, 'asOfDate branch must return unsliced history');
      assert.deepEqual(withAsOf, history);

      // Contrast: without asOfDate, live path may slice when today's candle is open.
      const withoutAsOf = getCompletedHistory(history);
      if (!isTodayCandleClosed()) {
        assert.equal(
          withoutAsOf.length,
          1,
          'wall-clock path should exclude in-progress today bar when session is open'
        );
      } else {
        assert.equal(withoutAsOf.length, 2);
      }
    });
  });

  describe('Cash session (site-wide PRESESSION + LIVE)', () => {
    // 2026-07-08 is a Wednesday trading day
    const at = (h: number, m: number) =>
      new Date(`2026-07-08T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);

    it('exposes 09:00 pre-open and 09:15–15:30 live labels', () => {
      assert.equal(BTST_CLOCK.preOpen, '09:00');
      assert.equal(BTST_CLOCK.marketOpen, '09:15');
      assert.equal(BTST_CLOCK.marketClose, '15:30');
    });

    it('maps CLOSED / PRESESSION / LIVE phases', () => {
      assert.equal(getCashSessionState(at(8, 59)), 'CLOSED');
      assert.equal(isPreSession(at(8, 59)), false);
      assert.equal(isMarketOpen(at(8, 59)), false);

      assert.equal(getCashSessionState(at(9, 0)), 'PRESESSION');
      assert.equal(isPreSession(at(9, 0)), true);
      assert.equal(isMarketOpen(at(9, 0)), false);

      assert.equal(getCashSessionState(at(9, 14)), 'PRESESSION');
      assert.equal(isPreSession(at(9, 14)), true);

      assert.equal(getCashSessionState(at(9, 15)), 'LIVE');
      assert.equal(isPreSession(at(9, 15)), false);
      assert.equal(isMarketOpen(at(9, 15)), true);

      assert.equal(getCashSessionState(at(15, 29)), 'LIVE');
      assert.equal(isMarketOpen(at(15, 29)), true);

      assert.equal(getCashSessionState(at(15, 30)), 'CLOSED');
      assert.equal(isMarketOpen(at(15, 30)), false);
    });

    it('treats weekends as CLOSED', () => {
      // 2026-07-11 is a Saturday
      const sat = new Date('2026-07-11T10:00:00+05:30');
      assert.equal(getCashSessionState(sat), 'CLOSED');
      assert.equal(isPreSession(sat), false);
      assert.equal(isMarketOpen(sat), false);
    });
  });

  describe('BTST window helpers (canonical BTST_WINDOWS)', () => {
    // 2026-07-08 is a Wednesday trading day
    const at = (h: number, m: number) => new Date(`2026-07-08T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);

    it('maps discovery / confirm / freeze / journal phases', () => {
      assert.strictEqual(getBtstWindowState(at(15, 9)), 'FROZEN');
      assert.strictEqual(getBtstWindowState(at(15, 10)), 'DISCOVERING');
      assert.strictEqual(getBtstWindowState(at(15, 14)), 'DISCOVERING');
      assert.strictEqual(getBtstWindowState(at(15, 15)), 'ACTIVE');
      assert.strictEqual(getBtstWindowState(at(15, 20)), 'ACTIVE');
      assert.strictEqual(getBtstWindowState(at(15, 24)), 'ACTIVE');
      assert.strictEqual(getBtstWindowState(at(15, 25)), 'FROZEN');

      assert.strictEqual(isBtstDiscoveryOpen(at(15, 10)), true);
      assert.strictEqual(isBtstDiscoveryOpen(at(15, 24)), true);
      assert.strictEqual(isBtstDiscoveryOpen(at(15, 25)), false);

      assert.strictEqual(isBtstConfirmOpen(at(15, 14)), false);
      assert.strictEqual(isBtstConfirmOpen(at(15, 15)), true);
      assert.strictEqual(isBtstConfirmOpen(at(15, 20)), true);
      assert.strictEqual(isBtstConfirmOpen(at(15, 25)), false);

      assert.strictEqual(isBtstJournalWindowOpen(at(15, 24)), false);
      assert.strictEqual(isBtstJournalWindowOpen(at(15, 25)), true);
      assert.strictEqual(isBtstJournalWindowOpen(at(15, 30)), true);
      assert.strictEqual(isBtstJournalWindowOpen(at(15, 31)), false);
    });

    it('identifies the 15:15–15:30 EOD liquidity window', () => {
      assert.strictEqual(isInClosingLiquidityWindow(BTST_WINDOW_MINUTES.CLOSING_WINDOW_START), true);
      assert.strictEqual(isInClosingLiquidityWindow(BTST_WINDOW_MINUTES.MARKET_CLOSE - 5), true);
      assert.strictEqual(isInClosingLiquidityWindow(BTST_WINDOW_MINUTES.CLOSING_WINDOW_START - 5), false);
      assert.strictEqual(isInClosingLiquidityWindow(BTST_WINDOW_MINUTES.MARKET_CLOSE), false);
    });
  });

  describe('getRecentNseTradingDays', () => {
    it('returns empty array when count <= 0', () => {
      assert.deepStrictEqual(getRecentNseTradingDays(0), []);
      assert.deepStrictEqual(getRecentNseTradingDays(-3), []);
    });

    it('returns 5 consecutive trading days for a standard trading week (Mon-Fri)', () => {
      // 2026-07-10 is Friday
      const friday = new Date('2026-07-10T12:00:00+05:30');
      const days = getRecentNseTradingDays(5, friday);
      assert.deepStrictEqual(days, [
        '2026-07-06',
        '2026-07-07',
        '2026-07-08',
        '2026-07-09',
        '2026-07-10',
      ]);
    });

    it('bridges across weekends omitting Saturday and Sunday', () => {
      // 2026-07-13 is Monday
      const monday = new Date('2026-07-13T12:00:00+05:30');
      const days = getRecentNseTradingDays(5, monday);
      assert.deepStrictEqual(days, [
        '2026-07-07',
        '2026-07-08',
        '2026-07-09',
        '2026-07-10',
        '2026-07-13',
      ]);
      // Verify neither Saturday 2026-07-11 nor Sunday 2026-07-12 is in the list
      assert.strictEqual(days.includes('2026-07-11'), false);
      assert.strictEqual(days.includes('2026-07-12'), false);
    });

    it('handles weekend asOf date by starting from the most recent completed Friday', () => {
      // 2026-07-12 is Sunday
      const sunday = new Date('2026-07-12T12:00:00+05:30');
      const days = getRecentNseTradingDays(3, sunday);
      assert.deepStrictEqual(days, [
        '2026-07-08',
        '2026-07-09',
        '2026-07-10',
      ]);
    });

    it('skips NSE holidays (e.g., Republic Day 2026-01-26)', () => {
      // 2026-01-26 is Republic Day (Monday). Friday was 2026-01-23. Tuesday is 2026-01-27.
      const tuesday = new Date('2026-01-27T12:00:00+05:30');
      const days = getRecentNseTradingDays(3, tuesday);
      assert.deepStrictEqual(days, [
        '2026-01-22',
        '2026-01-23',
        '2026-01-27',
      ]);
      // Republic Day Monday must be skipped
      assert.strictEqual(days.includes('2026-01-26'), false);
    });
  });
});
