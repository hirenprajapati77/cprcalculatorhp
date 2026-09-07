import assert from 'node:assert/strict';
import test from 'node:test';

import {
  matchesExpectedTradingSessions,
  isValidHistoricalReturnCandle,
  isValidHistoricalWindow,
  isValidOhlcvGeometry,
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

test('isValidOhlcvGeometry validates standard bullish and bearish candles', () => {
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 105, low: 98, close: 103, volume: 50000, prevClose: 99 }),
    true,
  );
  assert.equal(
    isValidOhlcvGeometry({ open: 103, high: 105, low: 98, close: 100, volume: BigInt(50000), prevClose: 104 }),
    true,
  );
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 105, low: 98, close: 103 }),
    true,
  );
});

test('isValidOhlcvGeometry accepts valid flat and doji candles', () => {
  // Perfect 4-price doji
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 100, low: 100, close: 100, volume: 0 }),
    true,
  );
  // High equals open, low equals close
  assert.equal(
    isValidOhlcvGeometry({ open: 105, high: 105, low: 95, close: 95, volume: 1000 }),
    true,
  );
});

test('isValidOhlcvGeometry rejects geometrically inverted or inconsistent high/low prices', () => {
  // High < Low
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 95, low: 98, close: 96 }),
    false,
  );
  // High < Open
  assert.equal(
    isValidOhlcvGeometry({ open: 105, high: 100, low: 95, close: 98 }),
    false,
  );
  // High < Close
  assert.equal(
    isValidOhlcvGeometry({ open: 98, high: 100, low: 95, close: 105 }),
    false,
  );
  // Low > Open
  assert.equal(
    isValidOhlcvGeometry({ open: 95, high: 105, low: 98, close: 102 }),
    false,
  );
  // Low > Close
  assert.equal(
    isValidOhlcvGeometry({ open: 102, high: 105, low: 98, close: 95 }),
    false,
  );
});

test('isValidOhlcvGeometry rejects zero, negative, and non-finite price values', () => {
  assert.equal(isValidOhlcvGeometry({ open: 0, high: 105, low: 98, close: 103 }), false);
  assert.equal(isValidOhlcvGeometry({ open: 100, high: 0, low: 0, close: 100 }), false);
  assert.equal(isValidOhlcvGeometry({ open: 100, high: 105, low: -5, close: 103 }), false);
  assert.equal(isValidOhlcvGeometry({ open: 100, high: 105, low: 98, close: -10 }), false);
  assert.equal(isValidOhlcvGeometry({ open: Number.NaN, high: 105, low: 98, close: 103 }), false);
  assert.equal(isValidOhlcvGeometry({ open: 100, high: Number.POSITIVE_INFINITY, low: 98, close: 103 }), false);
});

test('isValidOhlcvGeometry rejects negative volume or invalid prevClose when supplied', () => {
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 105, low: 98, close: 103, volume: -1 }),
    false,
  );
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 105, low: 98, close: 103, volume: Number.NaN }),
    false,
  );
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 105, low: 98, close: 103, prevClose: 0 }),
    false,
  );
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 105, low: 98, close: 103, prevClose: -50 }),
    false,
  );
  assert.equal(
    isValidOhlcvGeometry({ open: 100, high: 105, low: 98, close: 103, prevClose: Number.NaN }),
    false,
  );
});
