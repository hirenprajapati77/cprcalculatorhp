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

  describe('NSE 2025 Holidays', () => {
    const holidays2025 = [
      '2025-02-26', // Mahashivratri (Wednesday)
      '2025-03-14', // Holi (Friday)
      '2025-03-31', // Id-Ul-Fitr (Monday)
      '2025-04-10', // Shri Mahavir Jayanti (Thursday)
      '2025-04-14', // Dr. Baba Saheb Ambedkar Jayanti (Monday)
      '2025-04-18', // Good Friday (Friday)
      '2025-05-01', // Maharashtra Day (Thursday)
      '2025-08-15', // Independence Day (Friday)
      '2025-08-27', // Ganesh Chaturthi (Wednesday)
      '2025-10-02', // Mahatma Gandhi Jayanti / Dussehra (Thursday)
      '2025-10-21', // Diwali Laxmi Pujan (Tuesday)
      '2025-10-22', // Diwali Balipratipada (Wednesday)
      '2025-11-05', // Prakash Gurpurb Sri Guru Nanak Dev (Wednesday)
      '2025-12-25', // Christmas (Thursday)
    ];

    it('identifies confirmed 2025 weekday holidays as non-trading days (14 total)', () => {
      assert.strictEqual(holidays2025.length, 14, 'Verified list must contain 14 holidays');
      for (const ymd of holidays2025) {
        const d = new Date(`${ymd}T10:00:00+05:30`);
        const ist = getISTTime(d);
        assert.strictEqual(ist.isHoliday, true, `${ymd} must be flagged as isHoliday: true`);
        assert.strictEqual(ist.isTradingDay, false, `${ymd} must not be an NSE trading day`);
      }
    });

    it('Case 2: normal trading days near holidays remain trading days (no false-positive over-adding)', () => {
      const normalTradingDays = [
        '2025-01-27', // Monday after Republic Day Sunday
        '2025-08-14', // Thursday before Independence Day
        '2025-10-01', // Wednesday before Gandhi Jayanti / Dussehra
        '2025-12-24', // Wednesday before Christmas
      ];

      for (const ymd of normalTradingDays) {
        const d = new Date(`${ymd}T10:00:00+05:30`);
        const ist = getISTTime(d);
        assert.strictEqual(ist.isHoliday, false, `${ymd} must NOT be flagged as isHoliday`);
        assert.strictEqual(ist.isTradingDay, true, `${ymd} must remain an active trading day`);
      }
    });

    it('Case 3: getRecentNseTradingDays bridges across a 2025 holiday', () => {
      // 2025-08-15 is Friday (Independence Day holiday).
      // Monday 2025-08-18 asOf date looking back 3 days should return:
      // Wednesday 2025-08-13, Thursday 2025-08-14, Monday 2025-08-18
      const monday = new Date('2025-08-18T12:00:00+05:30');
      const days = getRecentNseTradingDays(3, monday);
      assert.deepStrictEqual(days, [
        '2025-08-13',
        '2025-08-14',
        '2025-08-18',
      ]);
      assert.strictEqual(days.includes('2025-08-15'), false, '2025-08-15 holiday must be skipped');
    });

    it('Case 4: handles non-leap-year February boundary correctly (2025-02-28 -> 2025-03-01)', () => {
      // 2025 is not a leap year. Feb 28 is Friday (trading day).
      // March 1 is Saturday (weekend), March 2 is Sunday (weekend), March 3 is Monday (trading day).
      const feb28 = new Date('2025-02-28T12:00:00+05:30');
      const march3 = new Date('2025-03-03T12:00:00+05:30');
      assert.strictEqual(getISTTime(feb28).isTradingDay, true, '2025-02-28 must be a trading day');
      assert.strictEqual(getISTTime(march3).isTradingDay, true, '2025-03-03 must be a trading day');

      const recentFromMarch3 = getRecentNseTradingDays(2, march3);
      assert.deepStrictEqual(recentFromMarch3, ['2025-02-28', '2025-03-03']);
    });

    it('Case 5: fallback behavior for undefined future year preserves trading days on weekdays', () => {
      // For a year not in table (e.g. 2031-06-11 Wednesday), getISTTime should report isHoliday: false and isTradingDay: true
      const futureWeekday = new Date('2031-06-11T12:00:00+05:30');
      const ist = getISTTime(futureWeekday);
      assert.strictEqual(ist.isHoliday, false, 'Undefined year must not flag random holiday');
      assert.strictEqual(ist.isTradingDay, true, 'Undefined year weekday degrades to trading day');
    });

    it('regression guard: 2025 holiday list contains NO weekend dates via getISTTime', () => {
      for (const ymd of holidays2025) {
        const { isWeekend, weekday } = getISTTime(new Date(`${ymd}T12:00:00+05:30`));
        assert.strictEqual(
          isWeekend,
          false,
          `${ymd} (${weekday}) is a weekend and must not be in the holiday table`
        );
      }
    });
  });

  describe('NSE 2026 Holidays (Circular NSE/CMTR/71775)', () => {
    const holidays2026 = [
      '2026-01-26', // Republic Day (Monday)
      '2026-03-03', // Holi (Tuesday)
      '2026-03-26', // Shri Ram Navami (Thursday)
      '2026-03-31', // Shri Mahavir Jayanti (Tuesday)
      '2026-04-03', // Good Friday (Friday)
      '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti (Tuesday)
      '2026-05-01', // Maharashtra Day (Friday)
      '2026-05-28', // Bakri Id (Thursday)
      '2026-06-26', // Muharram (Friday)
      '2026-09-14', // Ganesh Chaturthi (Monday)
      '2026-10-02', // Mahatma Gandhi Jayanti (Friday)
      '2026-10-20', // Dussehra (Tuesday)
      '2026-11-10', // Diwali-Balipratipada (Tuesday)
      '2026-11-24', // Prakash Gurpurb Sri Guru Nanak Dev (Tuesday)
      '2026-12-25', // Christmas (Friday)
    ];

    it('identifies confirmed 2026 weekday holidays as non-trading days (15 total per NSE/CMTR/71775)', () => {
      assert.strictEqual(holidays2026.length, 15, 'Official list must contain 15 weekday holidays');
      for (const ymd of holidays2026) {
        const d = new Date(`${ymd}T10:00:00+05:30`);
        const ist = getISTTime(d);
        assert.strictEqual(ist.isHoliday, true, `${ymd} must be flagged as isHoliday: true`);
        assert.strictEqual(ist.isTradingDay, false, `${ymd} must not be an NSE trading day`);
      }
    });

    it('P1 regression guard: 2026-10-20 (Dussehra), 2026-11-10 (Balipratipada), and 2026-11-24 (Guru Nanak) are closed', () => {
      // 2026-10-20 (Tuesday, Dussehra)
      const dussehra = getISTTime(new Date('2026-10-20T10:00:00+05:30'));
      assert.strictEqual(dussehra.isHoliday, true, '2026-10-20 Dussehra must be isHoliday: true');
      assert.strictEqual(dussehra.isTradingDay, false, '2026-10-20 Dussehra must NOT be a trading day');

      // 2026-11-10 (Tuesday, Diwali-Balipratipada)
      const balipratipada = getISTTime(new Date('2026-11-10T10:00:00+05:30'));
      assert.strictEqual(balipratipada.isHoliday, true, '2026-11-10 Balipratipada must be isHoliday: true');
      assert.strictEqual(balipratipada.isTradingDay, false, '2026-11-10 Balipratipada must NOT be a trading day');

      // 2026-11-24 (Tuesday, Guru Nanak Jayanti)
      const guruNanak = getISTTime(new Date('2026-11-24T10:00:00+05:30'));
      assert.strictEqual(guruNanak.isHoliday, true, '2026-11-24 Guru Nanak must be isHoliday: true');
      assert.strictEqual(guruNanak.isTradingDay, false, '2026-11-24 Guru Nanak must NOT be a trading day');
    });

    it('P1 regression guard: 2026-11-03 and 2026-11-04 are normal active trading days (not falsely closed)', () => {
      // Nov 3 and Nov 4, 2026 are regular Tuesday and Wednesday trading sessions
      const nov3 = getISTTime(new Date('2026-11-03T10:00:00+05:30'));
      assert.strictEqual(nov3.isHoliday, false, '2026-11-03 must NOT be a holiday');
      assert.strictEqual(nov3.isTradingDay, true, '2026-11-03 must remain an active trading day');

      const nov4 = getISTTime(new Date('2026-11-04T10:00:00+05:30'));
      assert.strictEqual(nov4.isHoliday, false, '2026-11-04 must NOT be a holiday');
      assert.strictEqual(nov4.isTradingDay, true, '2026-11-04 must remain an active trading day');
    });

    it('Case: getRecentNseTradingDays bridges across 2026-10-20 Dussehra correctly', () => {
      // 2026-10-16 (Friday), 2026-10-17/18 (Weekend), 2026-10-19 (Monday), 2026-10-20 (Tuesday Dussehra Holiday)
      // 2026-10-21 (Wednesday). Looking back 3 trading days from Wednesday 2026-10-21:
      const wednesday = new Date('2026-10-21T12:00:00+05:30');
      const days = getRecentNseTradingDays(3, wednesday);
      assert.deepStrictEqual(days, [
        '2026-10-16',
        '2026-10-19',
        '2026-10-21',
      ]);
      assert.strictEqual(days.includes('2026-10-20'), false, '2026-10-20 Dussehra must be skipped');
    });

    it('regression guard: 2026 holiday list contains NO weekend dates via getISTTime', () => {
      for (const ymd of holidays2026) {
        const { isWeekend, weekday } = getISTTime(new Date(`${ymd}T12:00:00+05:30`));
        assert.strictEqual(
          isWeekend,
          false,
          `${ymd} (${weekday}) is a weekend and must not be in the weekday holiday table`
        );
      }
    });
  });
});
