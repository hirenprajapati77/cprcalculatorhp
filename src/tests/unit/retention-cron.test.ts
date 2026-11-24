import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/retention/route';
import { RetentionService } from '@/services/retention/retention.service';
import { VolumeTelemetryService } from '@/services/retention/volume-telemetry.service';
import { env } from '@/config/env';

test('Retention Cron Route (/api/cron/retention)', async (t) => {
  const originalMarkExpired = RetentionService.markExpired;
  const originalPurgeExpired = RetentionService.purgeExpired;
  const originalPurge = VolumeTelemetryService.purge;
  const originalCronSecret = env.CRON_SECRET;

  t.afterEach(() => {
    RetentionService.markExpired = originalMarkExpired;
    RetentionService.purgeExpired = originalPurgeExpired;
    VolumeTelemetryService.purge = originalPurge;
    env.CRON_SECRET = originalCronSecret;
  });

  await t.test('rejects unauthorized cron requests with 401', async () => {
    env.CRON_SECRET = 'valid-cron-secret';
    const req = new NextRequest('http://localhost/api/cron/retention', {
      headers: { 'x-cron-secret': 'wrong-secret' },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'Unauthorized');
  });

  await t.test('returns 400 Bad Request for malformed telemetryMaxRows parameter', async () => {
    env.CRON_SECRET = 'valid-cron-secret';

    const malformedInputs = ['50000junk', '1e5', '-500', 'abc', '10.5', ''];
    for (const input of malformedInputs) {
      const req = new NextRequest(`http://localhost/api/cron/retention?telemetryMaxRows=${input}`, {
        headers: { 'x-cron-secret': 'valid-cron-secret' },
      });
      const res = await GET(req);
      assert.strictEqual(res.status, 400, `Expected 400 for input: ${input}`);
      const data = await res.json();
      assert.strictEqual(data.error, 'Invalid telemetryMaxRows: must be an integer between 1,000 and 100,000');
    }
  });

  await t.test('returns 400 Bad Request for out-of-range telemetryMaxRows parameter', async () => {
    env.CRON_SECRET = 'valid-cron-secret';

    const outOfRangeInputs = ['500', '999', '100001', '9999999'];
    for (const input of outOfRangeInputs) {
      const req = new NextRequest(`http://localhost/api/cron/retention?telemetryMaxRows=${input}`, {
        headers: { 'x-cron-secret': 'valid-cron-secret' },
      });
      const res = await GET(req);
      assert.strictEqual(res.status, 400, `Expected 400 for input: ${input}`);
      const data = await res.json();
      assert.strictEqual(data.error, 'Invalid telemetryMaxRows: must be an integer between 1,000 and 100,000');
    }
  });

  await t.test('returns 200 and status SUCCESS on happy path without error properties', async () => {
    env.CRON_SECRET = 'valid-cron-secret';
    RetentionService.markExpired = async () => 5;
    RetentionService.purgeExpired = async () => ({ wouldDelete: 3, hardDeleted: 3, duration: 10 });
    VolumeTelemetryService.purge = async () => ({ deleted: 1500, batches: 3, capped: false });

    const req = new NextRequest('http://localhost/api/cron/retention', {
      headers: { 'x-cron-secret': 'valid-cron-secret' },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'SUCCESS');
    assert.strictEqual(data.softDeleted, 5);
    assert.strictEqual(data.hardDeleted, 3);
    assert.strictEqual(data.telemetryDeleted, 1500);
    assert.strictEqual(data.failedSteps, undefined);
    assert.strictEqual(data.error, undefined);
  });

  await t.test('returns HTTP 500, PARTIAL_ERROR, sanitized failedSteps, and partial counts on single step failure', async () => {
    env.CRON_SECRET = 'valid-cron-secret';
    RetentionService.markExpired = async () => 10;
    RetentionService.purgeExpired = async () => ({ wouldDelete: 8, hardDeleted: 8, duration: 12 });
    VolumeTelemetryService.purge = async () => {
      // Internal error message should be logged on server but sanitized from client payload
      throw new Error('FATAL: connection to postgres-shard-03 failed at ssl handshake');
    };

    const req = new NextRequest('http://localhost/api/cron/retention', {
      headers: { 'x-cron-secret': 'valid-cron-secret' },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 500);
    const data = await res.json();
    assert.strictEqual(data.status, 'PARTIAL_ERROR');
    // Verifies partial progress from steps 1 and 2 is preserved and observable
    assert.strictEqual(data.softDeleted, 10);
    assert.strictEqual(data.hardDeleted, 8);
    assert.strictEqual(data.telemetryDeleted, 0);
    // Verifies safe sanitized error reporting without DB/infrastructure leakage
    assert.deepStrictEqual(data.failedSteps, ['volumeTelemetryPurge']);
    assert.strictEqual(data.error, 'One or more retention purge steps failed');
    assert.strictEqual(JSON.stringify(data).includes('postgres-shard-03'), false);
  });

  await t.test('returns HTTP 500, status ERROR, and lists all failedSteps when all steps fail', async () => {
    env.CRON_SECRET = 'valid-cron-secret';
    RetentionService.markExpired = async () => {
      throw new Error('Lock timeout on backtest_runs');
    };
    RetentionService.purgeExpired = async () => {
      throw new Error('Foreign key cascade violation');
    };
    VolumeTelemetryService.purge = async () => {
      throw new Error('Disk full on volume_telemetry');
    };

    const req = new NextRequest('http://localhost/api/cron/retention', {
      headers: { 'x-cron-secret': 'valid-cron-secret' },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 500);
    const data = await res.json();
    assert.strictEqual(data.status, 'ERROR');
    assert.deepStrictEqual(data.failedSteps, ['markExpired', 'purgeExpired', 'volumeTelemetryPurge']);
    assert.strictEqual(data.error, 'All retention purge steps failed');
    assert.strictEqual(JSON.stringify(data).includes('Lock timeout'), false);
  });

  await t.test('passes strictly validated telemetryMaxRows to VolumeTelemetryService.purge', async () => {
    env.CRON_SECRET = 'valid-cron-secret';
    let capturedOptions: { batchSize?: number; maxRows?: number } | undefined;
    RetentionService.markExpired = async () => 0;
    RetentionService.purgeExpired = async () => ({ wouldDelete: 0, hardDeleted: 0, duration: 1 });
    VolumeTelemetryService.purge = async (_cutoff, _client, options) => {
      capturedOptions = options;
      return { deleted: 0, batches: 0, capped: false };
    };

    // Valid custom catch-up limit (50,000)
    const req1 = new NextRequest('http://localhost/api/cron/retention?telemetryMaxRows=50000', {
      headers: { 'x-cron-secret': 'valid-cron-secret' },
    });
    const res1 = await GET(req1);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(capturedOptions?.maxRows, 50000);

    // Valid minimum limit (1,000)
    const req2 = new NextRequest('http://localhost/api/cron/retention?telemetryMaxRows=1000', {
      headers: { 'x-cron-secret': 'valid-cron-secret' },
    });
    const res2 = await GET(req2);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(capturedOptions?.maxRows, 1000);

    // Valid maximum limit (100,000)
    const req3 = new NextRequest('http://localhost/api/cron/retention?telemetryMaxRows=100000', {
      headers: { 'x-cron-secret': 'valid-cron-secret' },
    });
    const res3 = await GET(req3);
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(capturedOptions?.maxRows, 100000);

    // Default without parameter is 25000
    const req4 = new NextRequest('http://localhost/api/cron/retention', {
      headers: { 'x-cron-secret': 'valid-cron-secret' },
    });
    const res4 = await GET(req4);
    assert.strictEqual(res4.status, 200);
    assert.strictEqual(capturedOptions?.maxRows, 25000);
  });
});
