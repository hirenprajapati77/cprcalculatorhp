import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { publicApiError } from '@/lib/api-error';

describe('publicApiError (Tier 1)', () => {
  const originalEnv = process.env.NODE_ENV;

  it('returns fallback message in production / test', () => {
    (process.env as any).NODE_ENV = 'production';
    const err = new Error('Sensitive DB connection string exposed');
    assert.equal(publicApiError(err), 'Internal server error');
    assert.equal(publicApiError(err, 'Custom failure message'), 'Custom failure message');
  });

  it('returns error message in development when error is an Error instance with message', () => {
    (process.env as any).NODE_ENV = 'development';
    const err = new Error('Detailed query parse error');
    assert.equal(publicApiError(err), 'Detailed query parse error');
  });

  it('returns fallback in development when error is not Error or has empty message', () => {
    (process.env as any).NODE_ENV = 'development';
    assert.equal(publicApiError('just a string'), 'Internal server error');
    assert.equal(publicApiError(new Error('')), 'Internal server error');
    assert.equal(publicApiError(null, 'Fallback msg'), 'Fallback msg');
  });

  (process.env as any).NODE_ENV = originalEnv;
});
