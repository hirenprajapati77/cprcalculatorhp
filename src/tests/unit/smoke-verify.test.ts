import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
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
      assert.strictEqual(config.allowInsecure, false);
    });

    it('parses --insecure and --allow-insecure flags correctly', () => {
      const config1 = parseCliArgs(['--insecure']);
      assert.strictEqual(config1.allowInsecure, true);

      const config2 = parseCliArgs(['--allow-insecure']);
      assert.strictEqual(config2.allowInsecure, true);
    });

    it('reads SMOKE_ALLOW_INSECURE environment variable when flag is omitted', () => {
      const origEnv = process.env.SMOKE_ALLOW_INSECURE;
      try {
        process.env.SMOKE_ALLOW_INSECURE = 'true';
        const config = parseCliArgs([]);
        assert.strictEqual(config.allowInsecure, true);
      } finally {
        if (origEnv === undefined) {
          delete process.env.SMOKE_ALLOW_INSECURE;
        } else {
          process.env.SMOKE_ALLOW_INSECURE = origEnv;
        }
      }
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

    it('enforces TLS certificate validation by default on HTTPS requests', async () => {
      const server = https.createServer({ key: TEST_KEY, cert: TEST_CERT }, (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      try {
        await assert.rejects(
          async () => {
            // Default options: rejectUnauthorized is true
            await executeHttpRequest(`https://127.0.0.1:${port}/test`, { timeoutMs: 2000 });
          },
          (err: Error) => {
            const msg = err.message || '';
            return /self[- ]signed|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID/i.test(msg) ||
              /certificate/i.test(msg) || (err as { code?: string }).code === 'DEPTH_ZERO_SELF_SIGNED_CERT';
          }
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('allows self-signed certificates when rejectUnauthorized is explicitly false', async () => {
      const server = https.createServer({ key: TEST_KEY, cert: TEST_CERT }, (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, secure: false }));
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      try {
        const res = await executeHttpRequest(`https://127.0.0.1:${port}/test`, {
          timeoutMs: 2000,
          rejectUnauthorized: false,
        });
        assert.strictEqual(res.status, 200);
        const parsed = JSON.parse(res.body);
        assert.strictEqual(parsed.ok, true);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUJrfpdWUwIeyAdHt+N6IuMzFHDXowDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDkwOTEyMTU1M1oXDTM2MDkw
NjEyMTU1M1owFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAv2rUIDkjUVQvDjd7J56GL1+Kg+ADPqqXmgQpm2APySN7
CTNllZj3gpgLN6IwwXzA1PkMFdxabeadFhYt0sXh2zGUeHz25CijRjik3WamcrFN
clreKK5eMZNCjaxFt5EzVIM/2GhjScf5HcelcdSJggd0lRSKToE+DmzsYXKwx/jr
VKCvM06tR6Pvz9lBm6M+b1TPlaqbzJ55GODlqH7mnSdAxAA+NSDvnHHk1/5J/Sxq
4QWGS91qvMKj+DFTuL7oAZcgqne1uDByofFPEBDjy1AU+5Uwwd9Lx8pXiAQK0e0n
VcGXX8ESolSDH5Av8dE0BjtT2CMwEOfFXTY4BmLyiwIDAQABo1MwUTAdBgNVHQ4E
FgQUT1qsSL2zh8R/FRsmGE/myysx+HIwHwYDVR0jBBgwFoAUT1qsSL2zh8R/FRsm
GE/myysx+HIwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAevhs
8NLV5w84yrQiqRnQHinCuEzmrQYfFeBkvmqcmH4EczsdTtPhMAVg64yKZskrPSw6
fFm+Fsl7gSbf5AKtg47v7KEJgZASc4zuR8BsY0xQjHVbGOvdUb9ZBhgTLptJbNnH
SPtzGKsdYdHo+Md9nrGa/YKmcg7siy+IFxSlFlX6FbiQ2KseqpFWoWpeNWrSOBf5
uvvkuv6yYAMIcYaLpn2BQpaL5eUInd7chsT3P+B/HvFMbwqSNlvvfnHrnkC4Zh02
LmFW18W0XysZE/ge9khYqOpAKrpqFfPJvaq8M3eEghfeivsvfyyfhxQWPNg4soRO
etDznc5PPN9OzHDzqA==
-----END CERTIFICATE-----`;

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC/atQgOSNRVC8O
N3snnoYvX4qD4AM+qpeaBCmbYA/JI3sJM2WVmPeCmAs3ojDBfMDU+QwV3Fpt5p0W
Fi3SxeHbMZR4fPbkKKNGOKTdZqZysU1yWt4orl4xk0KNrEW3kTNUgz/YaGNJx/kd
x6Vx1ImCB3SVFIpOgT4ObOxhcrDH+OtUoK8zTq1Ho+/P2UGboz5vVM+VqpvMnnkY
4OWofuadJ0DEAD41IO+cceTX/kn9LGrhBYZL3Wq8wqP4MVO4vugBlyCqd7W4MHKh
8U8QEOPLUBT7lTDB30vHyleIBArR7SdVwZdfwRKiVIMfkC/x0TQGO1PYIzAQ58Vd
NjgGYvKLAgMBAAECggEAElaDLPUcX5G/kk6ZY1HKDCbMh9bBqNLCBFTKwaJh0MSv
6FE+taa6a43yYSmOHzM67AxR7pQ2K5owyWlliXBAs3WcAjECnBgSkEsj7DwFzS4U
O9TdvKr7xicT9Kug4DWuY7XRO4PAo1Rfls1GGdIhPE5HinK1z1CNZ+die/F3YyjY
a1r3YmmzpapHVsZjZFt5iRqH70l1Zwb6NU3SBTnPxW5IGU58PGy7llO6oJ7rQ9WO
bblhJKh34FMs7+R1gr0sG/CvsqCRRcHwjnzSP64svdvYmGd8cY1pPdwr2C6wtoay
+5DI3sw+XSLQ0/LamSbGKsHA7J1v10gsg86h1QyehQKBgQD7nlBMugvrSe5fNZOB
aZY+/xndexEhCNIYhbHswHY1RaufWBinEw8mUTjcVdAgnaLSjGdvHCqM7E3Nth7I
DJStxjQrNzFr5z6rmGpzocIvECx0E+5wDxe9w4Mlru9hi9t9KmjbwWl1SzPVcxAZ
Pl935bvfNfhJkk9R8OWFCqoghwKBgQDCwCUsvQYVYSPMIW3i0rS/J6ZSmmkDCEiG
UfwNeZqvNisZvf/zfXIIc0+qKddmKDGnsOBvde1v4ByM5xwXNrUxEthXeo/zZxYY
KQJkmERfeJeh9G5ENqtOhTrKgxY3BBRqpyVr3G+/C4Zzs+S3mGAgvFbwbcyH1B5X
P75A3qGy3QKBgBE6IpdOOZivZCGiomm+1+mSP6wZS+/uEaxaIvdpqe41ye1L88wk
kun1r6XuPiSthkNSF5bU39jsKNuHt43MxrUrF9FJoxmXKIRJGCi4j3n3aoO8BZwo
fGCirSz8UClmkO195NX+5QCB2JepnBWOXqzvzrAWmtw2pzWd/6jfNQyrAoGADFgV
gyJwEkbX+AZearQkVMF0n2O+KD0MK8dijJAap+RtEvKiGJLo+XQlpomEZ6tAinqB
n08AP8kaxiuX8ji7f2LMZ68TFMCB/AINbsbf/pUsN03A933nmdCEC3YHoHEXwjLa
Al40jw1x9j9+zcxQu4J0mES9ZBaj3a/ipUX3RdkCgYEA0ximbMl9zBTeraI2Xarm
MOUblxMeTisl9CR7m90Aeq4rpRqt9HjN7FNpFEbUi9rdh0v9h0wSOog3ttbh8yHK
jDrDrB+mmWJECTstzJX50l4IWv4jdKx1jmXbu5rknh5KAsW3Z3Sp9TtF97suNZzD
T7Y3pEfxcfU3dlGdcxXeBuQ=
-----END PRIVATE KEY-----`;

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
