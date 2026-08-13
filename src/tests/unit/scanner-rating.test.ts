import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  btstRowHighlightClass,
  cprRatingLabel,
  inferScannerBadgeDirection,
} from '@/lib/scanner-rating';
import { cprDirectionToOptionBias } from '@/lib/cpr-direction';

describe('inferScannerBadgeDirection', () => {
  it('returns SHORT when entry is pinned to BC (bearish CPR)', () => {
    assert.equal(
      inferScannerBadgeDirection({ entry: 100, bc: 100, tc: 105, sl: 106, target: 95 }),
      'SHORT'
    );
  });

  it('returns LONG when entry is pinned to TC (bullish CPR)', () => {
    assert.equal(
      inferScannerBadgeDirection({ entry: 105, bc: 100, tc: 105, sl: 99, target: 110 }),
      'LONG'
    );
  });

  it('returns null for RANGE pivot (do not invent Buy/Sell)', () => {
    assert.equal(
      inferScannerBadgeDirection({ entry: 102.5, bc: 100, tc: 105, sl: 102.5, target: 102.5 }),
      null
    );
  });
});

describe('cprRatingLabel', () => {
  it('bearish strong tier renders Strong Sell (not Strong Buy)', () => {
    assert.equal(cprRatingLabel('strong', 'SHORT', false), 'Strong Sell');
  });

  it('bullish strong tier renders Strong Buy', () => {
    assert.equal(cprRatingLabel('strong', 'LONG', false), 'Strong Buy');
  });

  it('RANGE / null direction renders Strong only', () => {
    assert.equal(cprRatingLabel('strong', null, false), 'Strong');
  });

  it('ready tier is direction-aware the same way', () => {
    assert.equal(cprRatingLabel('ready', 'LONG', false), 'Opportunity Buy');
    assert.equal(cprRatingLabel('ready', 'SHORT', false), 'Opportunity Sell');
    assert.equal(cprRatingLabel('ready', null, false), 'Opportunity');
  });
});

describe('btstRowHighlightClass', () => {
  it('STRONG_STBT uses red tint, not green', () => {
    const stbt = btstRowHighlightClass('STRONG_STBT');
    assert.match(stbt, /accent-red/);
    assert.doesNotMatch(stbt, /accent-green/);
  });

  it('STRONG_BTST stays green', () => {
    const btst = btstRowHighlightClass('STRONG_BTST');
    assert.match(btst, /accent-green/);
    assert.doesNotMatch(btst, /accent-red/);
  });

  it('STBT_READY uses red tint (not shared blue with BTST_READY)', () => {
    assert.match(btstRowHighlightClass('STBT_READY'), /accent-red/);
    assert.match(btstRowHighlightClass('BTST_READY'), /accent-blue/);
  });
});

describe('cprDirectionToOptionBias', () => {
  it('maps LONG to BULLISH and SHORT to BEARISH', () => {
    assert.equal(cprDirectionToOptionBias('LONG'), 'BULLISH');
    assert.equal(cprDirectionToOptionBias('SHORT'), 'BEARISH');
  });
});
