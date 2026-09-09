#!/usr/bin/env node
/**
 * Production Smoke Verification Script (ISSUE-009)
 *
 * Lightweight, zero-dependency probe suite for post-deployment verification.
 * Verifies core routing, public page rendering, auth boundaries, and Market Tools API contracts
 * without triggering any heavy compute, backtest, live scan, or cache rebuild.
 *
 * Usage:
 *   npx tsx scripts/smoke-verify.ts [--url <baseUrl>] [--token <appAccessToken>] [--timeout <ms>] [--total-timeout <ms>] [--quiet]
 */

import http from 'node:http';
import https from 'node:https';

export interface SmokeConfig {
  baseUrl: string;
  appAccessToken?: string | undefined;
  probeTimeoutMs: number;
  totalTimeoutMs: number;
  quiet: boolean;
  allowInsecure?: boolean;
}

export interface ProbeResult {
  name: string;
  path: string;
  expectedStatus: number | number[];
  actualStatus: number;
  durationMs: number;
  passed: boolean;
  error?: string | undefined;
  details?: string | undefined;
}

export function parseCliArgs(args: string[]): SmokeConfig {
  let baseUrl = process.env.DEPLOY_PROD_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || 'http://127.0.0.1:3000';
  let appAccessToken = process.env.APP_ACCESS_TOKEN;
  let probeTimeoutMs = 5000;
  let totalTimeoutMs = 30000;
  let quiet = false;
  let allowInsecure = process.env.SMOKE_ALLOW_INSECURE === 'true' || process.env.ALLOW_INSECURE_TLS === 'true';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && i + 1 < args.length) {
      baseUrl = args[++i]!;
    } else if (arg === '--token' && i + 1 < args.length) {
      appAccessToken = args[++i]!;
    } else if (arg === '--timeout' && i + 1 < args.length) {
      probeTimeoutMs = parseInt(args[++i]!, 10) || 5000;
    } else if (arg === '--total-timeout' && i + 1 < args.length) {
      totalTimeoutMs = parseInt(args[++i]!, 10) || 30000;
    } else if (arg === '--quiet') {
      quiet = true;
    } else if (arg === '--insecure' || arg === '--allow-insecure') {
      allowInsecure = true;
    }
  }

  // Normalize baseUrl (strip trailing slash)
  baseUrl = baseUrl.replace(/\/+$/, '');

  return {
    baseUrl,
    appAccessToken,
    probeTimeoutMs,
    totalTimeoutMs,
    quiet,
    allowInsecure,
  };
}

export async function executeHttpRequest(
  targetUrl: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    redirect?: 'follow' | 'manual';
    timeoutMs?: number;
    rejectUnauthorized?: boolean;
  } = {}
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const rejectUnauthorized = options.rejectUnauthorized ?? true;
  const parsed = new URL(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    let completed = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    const req = transport.request(
      parsed,
      {
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'CPR-Platform-Smoke-Verifier/1.0',
          Accept: '*/*',
          ...(options.headers || {}),
        },
        // Enforce TLS verification by default; opt-out only via explicit configuration
        rejectUnauthorized,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          if (completed) return;
          completed = true;
          cleanup();

          const resHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v) resHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
          }

          resolve({
            status: res.statusCode || 0,
            headers: resHeaders,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      }
    );

    req.on('error', (err) => {
      if (completed) return;
      completed = true;
      cleanup();
      reject(err);
    });

    timer = setTimeout(() => {
      if (completed) return;
      completed = true;
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.end();
  });
}

export async function runSmokeVerifier(config: SmokeConfig): Promise<{
  allPassed: boolean;
  totalDurationMs: number;
  results: ProbeResult[];
}> {
  const results: ProbeResult[] = [];
  const startAll = Date.now();

  const runProbe = async (
    name: string,
    path: string,
    expectedStatus: number | number[],
    probeFn: () => Promise<{ status: number; body: string; headers: Record<string, string> }>,
    validator?: (res: { status: number; body: string; headers: Record<string, string> }) => string | null
  ) => {
    const t0 = Date.now();
    try {
      const res = await probeFn();
      const durationMs = Date.now() - t0;
      const expectedArray = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      let passed = expectedArray.includes(res.status);
      let details: string | undefined;

      if (passed && validator) {
        const valErr = validator(res);
        if (valErr) {
          passed = false;
          details = valErr;
        }
      }

      results.push({
        name,
        path,
        expectedStatus,
        actualStatus: res.status,
        durationMs,
        passed,
        details,
      });
    } catch (err) {
      const durationMs = Date.now() - t0;
      results.push({
        name,
        path,
        expectedStatus,
        actualStatus: 0,
        durationMs,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const requestOptions = {
    timeoutMs: config.probeTimeoutMs,
    rejectUnauthorized: !config.allowInsecure,
  };

  // ── Probe 1: Healthcheck & DB ping ─────────────────────────────
  await runProbe(
    'Healthcheck Probe',
    '/api/health',
    [200, 503],
    () => executeHttpRequest(`${config.baseUrl}/api/health`, requestOptions),
    (res) => {
      try {
        const json = JSON.parse(res.body);
        if (!json.status || (json.status !== 'healthy' && json.status !== 'degraded')) {
          return `Invalid health status: ${JSON.stringify(json)}`;
        }
        return null;
      } catch {
        return 'Response is not valid JSON';
      }
    }
  );

  // ── Probe 2: Market Hours & Session State ──────────────────────
  await runProbe(
    'Market Status Runtime',
    '/api/market-status',
    200,
    () => executeHttpRequest(`${config.baseUrl}/api/market-status`, requestOptions),
    (res) => {
      try {
        const json = JSON.parse(res.body);
        if (typeof json.isMarketOpen !== 'boolean' || !json.sessionState) {
          return `Missing isMarketOpen or sessionState: ${res.body.slice(0, 100)}`;
        }
        return null;
      } catch {
        return 'Response is not valid JSON';
      }
    }
  );

  // ── Probe 3: Public Page /unlock ───────────────────────────────
  await runProbe(
    'Public Page: /unlock',
    '/unlock',
    200,
    () => executeHttpRequest(`${config.baseUrl}/unlock`, requestOptions),
    (res) => {
      if (!res.body.includes('<html') && !res.body.includes('<!DOCTYPE')) {
        return 'Body does not appear to be HTML';
      }
      return null;
    }
  );

  // ── Probe 4: Public Page /about ────────────────────────────────
  await runProbe(
    'Public Page: /about',
    '/about',
    200,
    () => executeHttpRequest(`${config.baseUrl}/about`, requestOptions),
    (res) => {
      if (!res.body.includes('<html') && !res.body.includes('<!DOCTYPE')) {
        return 'Body does not appear to be HTML';
      }
      return null;
    }
  );

  // ── Probe 5: Page Auth Protection (Root redirect) ──────────────
  await runProbe(
    'Auth Guard: Page Root Redirect',
    '/',
    307,
    () => executeHttpRequest(`${config.baseUrl}/`, { ...requestOptions, redirect: 'manual' }),
    (res) => {
      const location = res.headers['location'] || '';
      if (!location.includes('/unlock')) {
        return `Expected redirect to /unlock, got Location: ${location}`;
      }
      return null;
    }
  );

  // ── Probe 6: API Auth Protection (/api/scanner) ────────────────
  await runProbe(
    'Auth Guard: API 401 Rejection',
    '/api/scanner',
    401,
    () => executeHttpRequest(`${config.baseUrl}/api/scanner`, requestOptions),
    (res) => {
      try {
        const json = JSON.parse(res.body);
        if (json.error !== 'Unauthorized') {
          return `Expected error='Unauthorized', got: ${res.body.slice(0, 100)}`;
        }
        return null;
      } catch {
        return 'Response is not valid JSON';
      }
    }
  );

  // ── Probe 7: Market Breadth API Contract ───────────────────────
  await runProbe(
    'Market Tools: Breadth Contract',
    '/api/market-tools/breadth',
    200,
    () => executeHttpRequest(`${config.baseUrl}/api/market-tools/breadth`, requestOptions),
    (res) => {
      try {
        const json = JSON.parse(res.body);
        if (json.success !== true || !json.data) {
          return `Invalid breadth contract: ${res.body.slice(0, 100)}`;
        }
        return null;
      } catch {
        return 'Response is not valid JSON';
      }
    }
  );

  // ── Probe 8: Breakout API Contract ────────────────────────────
  await runProbe(
    'Market Tools: Breakout Contract',
    '/api/market-tools/breakout',
    200,
    () => executeHttpRequest(`${config.baseUrl}/api/market-tools/breakout`, requestOptions),
    (res) => {
      try {
        const json = JSON.parse(res.body);
        if (json.success !== true || !json.data) {
          return `Invalid breakout contract: ${res.body.slice(0, 100)}`;
        }
        return null;
      } catch {
        return 'Response is not valid JSON';
      }
    }
  );

  // ── Probe 9: Pattern Breakout API Contract ─────────────────────
  await runProbe(
    'Market Tools: Pattern Breakout Contract',
    '/api/market-tools/pattern-breakout',
    200,
    () => executeHttpRequest(`${config.baseUrl}/api/market-tools/pattern-breakout`, requestOptions),
    (res) => {
      try {
        const json = JSON.parse(res.body);
        if (json.success !== true || !json.data) {
          return `Invalid pattern breakout contract: ${res.body.slice(0, 100)}`;
        }
        return null;
      } catch {
        return 'Response is not valid JSON';
      }
    }
  );

  // ── Probe 10: Momentum Leaders API Contract ───────────────────
  await runProbe(
    'Market Tools: Momentum Leaders Contract',
    '/api/market-tools/momentum-leaders',
    200,
    () => executeHttpRequest(`${config.baseUrl}/api/market-tools/momentum-leaders`, requestOptions),
    (res) => {
      try {
        const json = JSON.parse(res.body);
        if (json.success !== true || !json.data) {
          return `Invalid momentum leaders contract: ${res.body.slice(0, 100)}`;
        }
        return null;
      } catch {
        return 'Response is not valid JSON';
      }
    }
  );

  // ── Optional Probe: Authenticated Diagnostic (if token provided)
  if (config.appAccessToken) {
    await runProbe(
      'Optional: Authenticated Diagnostic Probe',
      '/api/health (Bearer)',
      200,
      () =>
        executeHttpRequest(`${config.baseUrl}/api/health`, {
          ...requestOptions,
          headers: {
            Authorization: `Bearer ${config.appAccessToken}`,
          },
        }),
      (res) => {
        try {
          const json = JSON.parse(res.body);
          if (!json.checks || !json.version) {
            return `Missing detailed diagnostic checks/version: ${res.body.slice(0, 100)}`;
          }
          return null;
        } catch {
          return 'Response is not valid JSON';
        }
      }
    );
  }

  const totalDurationMs = Date.now() - startAll;
  const allPassed = results.every((r) => r.passed);

  return {
    allPassed,
    totalDurationMs,
    results,
  };
}

export function printSmokeSummary(
  baseUrl: string,
  results: ProbeResult[],
  totalDurationMs: number
): void {
  console.log('\n========================================================================');
  console.log(`  CPR PLATFORM PRODUCTION SMOKE VERIFICATION — ${baseUrl}`);
  console.log('========================================================================');
  console.log(
    '  Status | Latency | Probe Name                        | Target Path'
  );
  console.log('------------------------------------------------------------------------');

  for (const r of results) {
    const statusIcon = r.passed ? '✅ PASS' : '❌ FAIL';
    const latencyStr = `${r.durationMs}ms`.padStart(7);
    const probeNameStr = r.name.padEnd(33);
    const pathStr = r.path;
    console.log(`  ${statusIcon} | ${latencyStr} | ${probeNameStr} | ${pathStr}`);
    if (!r.passed) {
      if (r.error) {
        console.log(`         ↳ Error: ${r.error}`);
      }
      if (r.details) {
        console.log(`         ↳ Detail: ${r.details}`);
      }
      if (r.actualStatus !== 0) {
        const expected = Array.isArray(r.expectedStatus) ? r.expectedStatus.join('/') : r.expectedStatus;
        console.log(`         ↳ Expected HTTP ${expected}, received HTTP ${r.actualStatus}`);
      }
    }
  }

  console.log('========================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(
    `  SUMMARY: ${passedCount}/${totalCount} probes passed in ${(totalDurationMs / 1000).toFixed(2)}s`
  );
  console.log('========================================================================\n');
}

// Direct CLI Invocation Execution
function isInvokedDirectly(): boolean {
  if (typeof process === 'undefined' || !process.argv || !process.argv[1]) return false;
  // If running via node --test or jest or vitest, do not run CLI
  if (process.argv.some(a => a.includes('--test') || a.includes('node:test'))) return false;
  const scriptPath = process.argv[1].replace(/\\/g, '/');
  return scriptPath.endsWith('/smoke-verify.ts') || scriptPath.endsWith('/smoke-verify.js') || scriptPath.endsWith('/smoke-verify');
}

if (isInvokedDirectly()) {
  const config = parseCliArgs(process.argv.slice(2));

  // Global fail-safe timeout guard to ensure the process NEVER hangs
  const globalTimer = setTimeout(() => {
    console.error(`\n[CRITICAL ERROR] Smoke verification exceeded total timeout of ${config.totalTimeoutMs}ms! Aborting.`);
    process.exit(1);
  }, config.totalTimeoutMs);
  if (globalTimer.unref) globalTimer.unref();

  runSmokeVerifier(config)
    .then((result) => {
      clearTimeout(globalTimer);
      if (!config.quiet) {
        printSmokeSummary(config.baseUrl, result.results, result.totalDurationMs);
      }
      if (result.allPassed) {
        console.log('✅ All production smoke verification probes passed successfully.\n');
        process.exit(0);
      } else {
        console.error('❌ Production smoke verification FAILED. See probe details above.\n');
        process.exit(1);
      }
    })
    .catch((err) => {
      clearTimeout(globalTimer);
      console.error('\n[FATAL] Smoke verification crashed with unhandled exception:', err);
      process.exit(1);
    });
}
