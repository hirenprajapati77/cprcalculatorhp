import test from 'node:test';
import assert from 'node:assert';
import { CacheService } from '../../services/cache.service';

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
