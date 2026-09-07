import assert from 'node:assert/strict';
import test from 'node:test';

import {
  matchesExpectedTradingSessions,
  isValidHistoricalReturnCandle,
  isValidHistoricalWindow,
} from '@/services/market-tools/historical-window-validation';

function candle(date: string, close = 100, prevClose = 99) {
  return { date, close, prevClose };
}

const sessions = [
  '2026-08-28',
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
];

test('accepts a window whose dates match canonical trading sessions', () => {
  assert.equal(
    matchesExpectedTradingSessions(
      sessions.map((date) => candle(date)),
      sessions,
      5,
    ),
    true,
  );
});

test('rejects a symbol with a missing historical trading session', () => {
  const candles = [
    candle('2026-08-28'),
    candle('2026-08-31'),
    candle('2026-09-02'),
    candle('2026-09-03'),
  ];

  assert.equal(
    matchesExpectedTradingSessions(candles, sessions, 5),
    false,
  );
});

test('rejects a window with count matching windowSize but an internal date misaligned', () => {
  // Count matches windowSize (5), but middle date is out of sequence
  const candles = [
    candle('2026-08-28'),
    candle('2026-08-31'),
    candle('2026-08-27'),
    candle('2026-09-02'),
    candle('2026-09-03'),
  ];

  assert.equal(
    matchesExpectedTradingSessions(candles, sessions, 5),
    false,
  );
});

test('rejects insufficient history instead of treating it as a valid zero return window', () => {
  assert.equal(
    matchesExpectedTradingSessions(
      [candle('2026-09-02'), candle('2026-09-03')],
      sessions,
      5,
    ),
    false,
  );
});

test('rejects invalid OHLCV values', () => {
  assert.equal(isValidHistoricalReturnCandle(candle('2026-09-03', 0, 99)), false);
  assert.equal(isValidHistoricalReturnCandle(candle('2026-09-03', 100, 0)), false);
  assert.equal(isValidHistoricalReturnCandle(candle('2026-09-03', Number.NaN, 99)), false);
});

test('validates both session continuity and candle values', () => {
  assert.equal(
    isValidHistoricalWindow(
      sessions.map((date) => candle(date)),
      sessions,
      5,
    ),
    true,
  );

  assert.equal(
    isValidHistoricalWindow(
      [
        candle('2026-08-28'),
        candle('2026-08-31'),
        candle('2026-09-01', 0, 99),
        candle('2026-09-02'),
        candle('2026-09-03'),
      ],
      sessions,
      5,
    ),
    false,
  );
});
