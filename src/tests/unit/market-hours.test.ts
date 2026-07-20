import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import {
  getISTDateString,
  getISTTime,
  isTodayCandleClosed,
  isMarketOpen,
  getCompletedHistory,
  getBtstWindowState,
  isBtstDiscoveryOpen,
  isBtstConfirmOpen,
  isBtstJournalWindowOpen,
  isInClosingLiquidityWindow,
  BTST_WINDOW_MINUTES,
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
});
