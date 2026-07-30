import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eventImpactSeverity,
  EventCalendarService,
  EVENT_LOOKAHEAD_TRADING_DAYS,
} from '../../services/overnight/event.service';

test('eventImpactSeverity decays by trading session', () => {
  assert.equal(eventImpactSeverity('HIGH', 0), 100);
  assert.equal(eventImpactSeverity('HIGH', 1), 90);
  assert.equal(eventImpactSeverity('HIGH', 2), 80);
  assert.equal(eventImpactSeverity('HIGH', 3), 70); // below option gate (80)
  assert.equal(eventImpactSeverity('MEDIUM', 0), 70);
  assert.equal(eventImpactSeverity('MEDIUM', 1), 60);
  assert.equal(eventImpactSeverity('LOW', 0), 30);
  assert.equal(eventImpactSeverity('HIGH', -1), 100); // clamp negative days
});

test('EventCalendarService.daysBetween explicitly skips weekends and holidays', () => {
  assert.equal(EventCalendarService.daysBetween('2026-07-24', '2026-07-24'), 0, 'Same day should return 0');
  assert.equal(EventCalendarService.daysBetween('2026-07-22', '2026-07-23'), 1, 'Wednesday to Thursday is 1 day');
  assert.equal(EventCalendarService.daysBetween('2026-07-21', '2026-07-23'), 2, 'Tuesday to Thursday is 2 days');

  // 2026-07-24 Friday → 2026-07-27 Monday = 1 trading session
  assert.equal(EventCalendarService.daysBetween('2026-07-24', '2026-07-27'), 1, 'Friday to Monday should count as 1 trading day');

  // 2026-01-26 Republic Day Monday; Fri 23 → Tue 27 = 1 trading session (Tue)
  assert.equal(EventCalendarService.daysBetween('2026-01-23', '2026-01-27'), 1, 'Friday to Tuesday spanning a Monday holiday should be 1 trading day');
});

test('EventCalendarService.addTradingDays advances by NSE sessions (not calendar days)', () => {
  assert.equal(EventCalendarService.addTradingDays('2026-07-23', 0), '2026-07-23');
  assert.equal(EventCalendarService.addTradingDays('2026-07-23', 1), '2026-07-24', 'Thu + 1 session = Fri');
  // Thu + 3 sessions = Fri, Mon, Tue → 2026-07-28 (includes Monday earnings in window)
  assert.equal(
    EventCalendarService.addTradingDays('2026-07-23', EVENT_LOOKAHEAD_TRADING_DAYS),
    '2026-07-28',
    'Thu + 3 trading sessions must reach past the weekend to Tuesday'
  );
  assert.equal(EventCalendarService.addTradingDays('2026-07-24', 1), '2026-07-27', 'Fri + 1 session = Mon');
  assert.equal(EventCalendarService.addTradingDays('2026-01-23', 1), '2026-01-27', 'Fri + 1 session skips Republic Day Monday');
});
