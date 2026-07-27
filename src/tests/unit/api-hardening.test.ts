import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldFreshDiscoverBtst } from '../../lib/btst-discover-gate';
import { maskSecretTail } from '../../lib/mask-secret';
import { publicApiError } from '../../lib/api-error';

describe('shouldFreshDiscoverBtst', () => {
  it('does not discover outside the window without bypass', () => {
    assert.equal(
      shouldFreshDiscoverBtst({
        executionWindowOpen: false,
        bypassQuery: false,
        hasCache: false,
      }),
      false
    );
  });

  it('serves cache on bypass (no fresh discover)', () => {
    assert.equal(
      shouldFreshDiscoverBtst({
        executionWindowOpen: true,
        bypassQuery: true,
        hasCache: true,
      }),
      false
    );
  });

  it('fresh-discovers on bypass when cache is empty', () => {
    assert.equal(
      shouldFreshDiscoverBtst({
        executionWindowOpen: true,
        bypassQuery: true,
        hasCache: false,
      }),
      true
    );
  });

  it('fresh-discovers when the execution window is open', () => {
    assert.equal(
      shouldFreshDiscoverBtst({
        executionWindowOpen: true,
        bypassQuery: false,
        hasCache: true,
      }),
      true
    );
  });
});

describe('maskSecretTail', () => {
  it('masks leaving the last 4 characters', () => {
    assert.equal(maskSecretTail('-1001234567890'), '**********7890');
  });

  it('returns **** for short values', () => {
    assert.equal(maskSecretTail('12'), '****');
    assert.equal(maskSecretTail(''), '');
  });
});

describe('publicApiError', () => {
  it('hides internal messages outside development', () => {
    const prev = process.env.NODE_ENV;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = 'production';
    try {
      assert.equal(publicApiError(new Error('secret db detail')), 'Internal server error');
      assert.equal(publicApiError(new Error('x'), 'Failed'), 'Failed');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.env as any).NODE_ENV = prev;
    }
  });
});
