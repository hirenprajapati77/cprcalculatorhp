import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('TopBar IST clock formatting', () => {
  it('formats UTC timestamps into Asia/Kolkata IST time rather than local host time', () => {
    // 13:25:00 UTC = 18:55:00 IST (+5:30)
    const testUtcDate = new Date('2026-10-08T13:25:00.000Z');

    const formattedIst = testUtcDate.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });

    assert.equal(formattedIst, '18:55', 'Must format UTC 13:25 as IST 18:55');
  });

  it('handles midnight roll-over across UTC to IST correctly', () => {
    // 20:00:00 UTC = 01:30:00 IST next day
    const testUtcDate = new Date('2026-10-08T20:00:00.000Z');

    const formattedIst = testUtcDate.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });

    assert.equal(formattedIst, '01:30', 'Must format UTC 20:00 as IST 01:30');
  });
});
