import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetActiveMarketProfileForTests } from '../../config/market-profile';
import {
  isSymbolFrozenForScanner,
  isUniverseLiveForScanner,
} from '../../lib/scanner-session';

function istDate(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 7, 4, hour - 5, minute - 30));
}

test('scanner mixed universes stay live past 15:15 in CLOSING_AUCTION', () => {
  __resetActiveMarketProfileForTests('CLOSING_AUCTION');
  try {
    // NIFTY50 can become effectively F&O-heavy over time; NIFTY200/ALL guarantee
    // mixed cash + F&O membership in this codebase universe definition.
    assert.equal(isUniverseLiveForScanner('NIFTY200', istDate(15, 20)), true);
    assert.equal(isUniverseLiveForScanner('ALL', istDate(15, 20)), true);
  } finally {
    __resetActiveMarketProfileForTests(null);
  }
});

test('NIFTY_FNO universe remains closed after 15:15 in CLOSING_AUCTION', () => {
  __resetActiveMarketProfileForTests('CLOSING_AUCTION');
  try {
    assert.equal(isUniverseLiveForScanner('NIFTY_FNO', istDate(15, 14)), true);
    assert.equal(isUniverseLiveForScanner('NIFTY_FNO', istDate(15, 20)), false);
  } finally {
    __resetActiveMarketProfileForTests(null);
  }
});

test('per-symbol freeze only applies to F&O names in CLOSING_AUCTION', () => {
  __resetActiveMarketProfileForTests('CLOSING_AUCTION');
  try {
    assert.equal(isSymbolFrozenForScanner('INFY', true, istDate(15, 20)), true);
    assert.equal(isSymbolFrozenForScanner('MGL', false, istDate(15, 20)), false);
  } finally {
    __resetActiveMarketProfileForTests(null);
  }
});
