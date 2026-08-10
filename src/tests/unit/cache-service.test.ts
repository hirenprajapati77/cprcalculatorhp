import test from 'node:test';
import assert from 'node:assert';
import { CacheService, getRedisReconnectDelay, shouldKeepRedisRetrying, autoScanResultCacheKey } from '../../services/cache.service';

test('autoScanResultCacheKey is universe+market scoped', () => {
  assert.strictEqual(autoScanResultCacheKey('NIFTY_FNO', 'NSE'), 'AUTO_SCAN_RESULT:NIFTY_FNO:NSE');
  assert.strictEqual(autoScanResultCacheKey('ALL_NSE'), 'AUTO_SCAN_RESULT:ALL_NSE:NSE');
  assert.notEqual(
    autoScanResultCacheKey('NIFTY_FNO', 'NSE'),
    autoScanResultCacheKey('ALL_NSE', 'NSE')
  );
});

test('CacheService Falsy values', async (_t) => {
  const metricsBefore = await CacheService.getMetrics();
  const hitsBefore = metricsBefore.hits;
  
  await CacheService.set('falsy_zero', 0, 10);
  const zero = await CacheService.get('falsy_zero');
  assert.strictEqual(zero, 0, 'Should return literal 0');

  await CacheService.set('falsy_false', false, 10);
  const falsyFalse = await CacheService.get('falsy_false');
  assert.strictEqual(falsyFalse, false, 'Should return literal false');
  
  await CacheService.set('falsy_empty', '', 10);
  const falsyEmpty = await CacheService.get('falsy_empty');
  assert.strictEqual(falsyEmpty, '', 'Should return literal empty string');

  const metricsAfter = await CacheService.getMetrics();
  assert.ok(metricsAfter.hits >= hitsBefore + 3, 'Hits counter should increment for falsy values');
});

test('Redis reconnect delay keeps retrying with a capped backoff', () => {
  assert.strictEqual(getRedisReconnectDelay(1), 1000);
  assert.strictEqual(getRedisReconnectDelay(3), 3000);
  assert.strictEqual(getRedisReconnectDelay(30), 30000);
  assert.strictEqual(getRedisReconnectDelay(31), 30000);
  assert.strictEqual(shouldKeepRedisRetrying('production'), true);
  assert.strictEqual(shouldKeepRedisRetrying('development', 'redis://localhost:6379'), true);
  assert.strictEqual(shouldKeepRedisRetrying('development'), false);
  // Unit-test runs must never keep a reconnect timer alive.
  assert.strictEqual(shouldKeepRedisRetrying('test', 'redis://localhost:6379'), false);
});
