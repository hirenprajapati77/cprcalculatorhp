import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStringToUndefined, envSchemaForTests } from '../../config/env';

describe('REDIS_URL / optional URL env (P1-4)', () => {
  it('emptyStringToUndefined maps blank strings to undefined', () => {
    assert.equal(emptyStringToUndefined(''), undefined);
    assert.equal(emptyStringToUndefined('   '), undefined);
    assert.equal(emptyStringToUndefined('redis://localhost:6379'), 'redis://localhost:6379');
  });

  it('accepts REDIS_URL="" as unset (memory/cache fallback path)', () => {
    const parsed = envSchemaForTests.safeParse({
      NODE_ENV: 'test',
      REDIS_URL: '',
      CACHE_PROVIDER: 'memory',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.REDIS_URL, undefined);
    }
  });

  it('still rejects invalid REDIS_URL values', () => {
    const parsed = envSchemaForTests.safeParse({
      NODE_ENV: 'test',
      REDIS_URL: 'not-a-url',
    });
    assert.equal(parsed.success, false);
  });

  it('accepts a valid REDIS_URL', () => {
    const parsed = envSchemaForTests.safeParse({
      NODE_ENV: 'test',
      REDIS_URL: 'redis://127.0.0.1:6379',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.REDIS_URL, 'redis://127.0.0.1:6379');
    }
  });
});
