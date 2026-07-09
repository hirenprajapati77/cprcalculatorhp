import { describe, it } from 'node:test';
import { strict as assert } from 'assert';
import { getISTDateString, getISTTime, isTodayCandleClosed, isMarketOpen } from '../lib/market-hours';

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
      // 2026-07-09T10:00:00.000Z = 2026-07-09T15:30:00.000+05:30 (IST)
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
      // 2026-07-09T09:00:00.000Z = 2026-07-09T14:30:00.000+05:30 (IST) - Market is Open
      const liveMarketDate = new Date('2026-07-09T09:00:00.000Z');
      assert.strictEqual(isTodayCandleClosed(liveMarketDate), false);
      assert.strictEqual(isMarketOpen(liveMarketDate), true);
    });

    it('returns false right before market close (15:29 IST)', () => {
      // 2026-07-09T09:59:00.000Z = 2026-07-09T15:29:00.000+05:30 (IST)
      const justBeforeClose = new Date('2026-07-09T09:59:00.000Z');
      assert.strictEqual(isTodayCandleClosed(justBeforeClose), false);
    });

    it('returns true exactly at market close (15:30 IST)', () => {
      // 2026-07-09T10:00:00.000Z = 2026-07-09T15:30:00.000+05:30 (IST)
      const exactlyAtClose = new Date('2026-07-09T10:00:00.000Z');
      assert.strictEqual(isTodayCandleClosed(exactlyAtClose), true);
    });

    it('returns true after market close (e.g., 4:00 PM IST)', () => {
      // 2026-07-09T10:30:00.000Z = 2026-07-09T16:00:00.000+05:30 (IST) - Market is Closed
      const postMarketDate = new Date('2026-07-09T10:30:00.000Z');
      assert.strictEqual(isTodayCandleClosed(postMarketDate), true);
      assert.strictEqual(isMarketOpen(postMarketDate), false);
    });
  });
});
