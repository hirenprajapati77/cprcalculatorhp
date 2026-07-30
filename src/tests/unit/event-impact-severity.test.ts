import test from 'node:test';
import assert from 'node:assert/strict';
import { eventImpactSeverity, EventCalendarService } from '../../services/overnight/event.service';

test('eventImpactSeverity decays by calendar day', () => {
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
  // 1. Same Day
  assert.equal(EventCalendarService.daysBetween('2026-07-24', '2026-07-24'), 0, 'Same day should return 0');
  
  // 2. Normal weekday gap
  assert.equal(EventCalendarService.daysBetween('2026-07-22', '2026-07-23'), 1, 'Wednesday to Thursday is 1 day');
  assert.equal(EventCalendarService.daysBetween('2026-07-21', '2026-07-23'), 2, 'Tuesday to Thursday is 2 days');

  // 3. Friday to Monday (The critical bug)
  // 2026-07-24 is Friday. 2026-07-27 is Monday.
  // Previously this was 3. It should now be 1 (because only Monday is a trading day in the [start+1, end] range)
  assert.equal(EventCalendarService.daysBetween('2026-07-24', '2026-07-27'), 1, 'Friday to Monday should count as 1 trading day');

  // 4. Over a known NSE holiday
  // 2026-01-26 is Republic Day (Monday).
  // Friday 2026-01-23 to Tuesday 2026-01-27.
  // 24 (Sat), 25 (Sun), 26 (Holiday), 27 (Trading Day).
  // So it should also just be 1 trading day!
  assert.equal(EventCalendarService.daysBetween('2026-01-23', '2026-01-27'), 1, 'Friday to Tuesday spanning a Monday holiday should be 1 trading day');
});
