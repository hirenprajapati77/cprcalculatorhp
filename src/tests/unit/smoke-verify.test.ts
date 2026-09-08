import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseCliArgs, executeHttpRequest, runSmokeVerifier } from '../../../scripts/smoke-verify';

describe('ISSUE-009: Production Smoke Verification Suite', () => {
  describe('CLI Argument Parsing', () => {
    it('parses custom url, token, timeout, and quiet flags correctly', () => {
      const args = [
        '--url', 'https://example.com/api/',
        '--token', 'secret-abc',
        '--timeout', '3000',
        '--total-timeout', '15000',
        '--quiet'
      ];
      const config = parseCliArgs(args);
      assert.strictEqual(config.baseUrl, 'https://example.com/api');
      assert.strictEqual(config.appAccessToken, 'secret-abc');
      assert.strictEqual(config.probeTimeoutMs, 3000);
      assert.strictEqual(config.totalTimeoutMs, 15000);
      assert.strictEqual(config.quiet, true);
    });

    it('falls back to default configurations when arguments are omitted', () => {
      const config = parseCliArgs([]);
      assert.ok(config.baseUrl.length > 0);
      assert.strictEqual(config.probeTimeoutMs, 5000);
      assert.strictEqual(config.totalTimeoutMs, 30000);
      assert.strictEqual(config.quiet, false);
    });
  });

  describe('HTTP Execution & Timeout Handling', () => {
    it('executes a local GET request and captures status, headers, and body', async () => {
      const server = http.createServer((req, res) => {
        res.setHeader('X-Custom-Header', 'SmokeTestVal');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, msg: 'hello' }));
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      try {
        const res = await executeHttpRequest(`http://127.0.0.1:${port}/test`, { timeoutMs: 2000 });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers['x-custom-header'], 'SmokeTestVal');
        const parsed = JSON.parse(res.body);
        assert.strictEqual(parsed.ok, true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('enforces request timeout when endpoint hangs', async () => {
      const server = http.createServer((_req, _res) => {
        // Intentionally hang without responding
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      try {
        await assert.rejects(
          async () => {
            await executeHttpRequest(`http://127.0.0.1:${port}/hang`, { timeoutMs: 200 });
          },
          /timed out/i
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('Mock Server Probe Verification', () => {
    it('reports pass when all 10 mock probe endpoints return required contracts', async () => {
      const server = http.createServer((req, res) => {
        const url = req.url || '';
        if (url === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ status: 'healthy', version: 'v1.0.0' }));
        }
        if (url === '/api/market-status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ isMarketOpen: false, sessionState: 'CLOSED' }));
        }
        if (url === '/unlock') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          return res.end('<!DOCTYPE html><html><body>Unlock Page</body></html>');
        }
        if (url === '/about') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          return res.end('<!DOCTYPE html><html><body>About Page</body></html>');
        }
        if (url === '/') {
          res.writeHead(307, { Location: '/unlock' });
          return res.end();
        }
        if (url === '/api/scanner') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        if (url === '/api/market-tools/breadth') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, data: { status: 'ready', date: '2026-09-08' } }));
        }
        if (url === '/api/market-tools/breakout') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, data: { status: 'ready', date: '2026-09-08' } }));
        }
        if (url === '/api/market-tools/pattern-breakout') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, data: { status: 'ready', date: '2026-09-08' } }));
        }
        if (url === '/api/market-tools/momentum-leaders') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, data: { status: 'ready', date: '2026-09-08' } }));
        }

        res.writeHead(404);
        res.end();
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      try {
        const report = await runSmokeVerifier({
          baseUrl: `http://127.0.0.1:${port}`,
          probeTimeoutMs: 2000,
          totalTimeoutMs: 10000,
          quiet: true,
        });

        assert.strictEqual(report.allPassed, true);
        assert.strictEqual(report.results.length, 10);
        assert.ok(report.totalDurationMs >= 0);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('reports failure if any probe returns unexpected status code', async () => {
      const server = http.createServer((req, res) => {
        // Return 500 on /unlock
        if (req.url === '/unlock') {
          res.writeHead(500);
          return res.end('Internal Server Error');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', isMarketOpen: false, sessionState: 'CLOSED', success: true, data: {} }));
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      try {
        const report = await runSmokeVerifier({
          baseUrl: `http://127.0.0.1:${port}`,
          probeTimeoutMs: 1000,
          totalTimeoutMs: 5000,
          quiet: true,
        });

        assert.strictEqual(report.allPassed, false);
        const failedUnlock = report.results.find((r) => r.path === '/unlock');
        assert.ok(failedUnlock);
        assert.strictEqual(failedUnlock.passed, false);
        assert.strictEqual(failedUnlock.actualStatus, 500);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
