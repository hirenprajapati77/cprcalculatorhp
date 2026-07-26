import test from 'node:test';
import assert from 'node:assert';
import { FyersAuthService } from '../../services/fyers-auth.service';

const originalFetch = global.fetch;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalGetCredentials = FyersAuthService.getCredentials;

function setupMocks() {
  global.fetch = async () => ({}) as any;
  console.warn = () => {};
  console.log = () => {};
  console.error = () => {};
  
  FyersAuthService.getCredentials = () => ({
    appId: 'TEST_APP_ID',
    secretId: 'TEST_SECRET_ID',
    redirectUrl: 'http://localhost:3000',
    appIdHash: 'TEST_HASH'
  });
}

function restoreMocks() {
  global.fetch = originalFetch;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  FyersAuthService.getCredentials = originalGetCredentials;
}

test('FyersAuthService Diagnostic Logging', async (t) => {
  t.beforeEach(setupMocks);
  t.afterEach(restoreMocks);

  await t.test('direct call non-2xx status logs status and body text, then falls back', async () => {
    let warnArgs: any[] = [];
    console.warn = (...args: any[]) => warnArgs.push(args);

    let fetchCount = 0;
    global.fetch = async (url: string | Request | URL) => {
      fetchCount++;
      if (url.toString().includes('api-t1.fyers.in')) {
        return {
          ok: false,
          status: 403,
          text: async () => '{"error":"IP not whitelisted"}'
        } as any;
      }
      return { ok: false, status: 500, text: async () => 'Proxy failed' } as any;
    };

    const res = await FyersAuthService.generateToken('authcode123');

    assert.strictEqual(fetchCount, 1, 'Should have only called direct fetch, since no proxy is configured in test env');
    assert.strictEqual(res.success, false);
    
    // Check diagnostic log
    assert.ok(warnArgs.some(args => 
      args[0].includes('Direct token exchange HTTP 403') && 
      args[0].includes('IP not whitelisted')
    ), 'Should log status and body text on non-2xx');
  });

  await t.test('direct call 200 with { s: "error" } logs full body, then falls back', async () => {
    let warnArgs: any[] = [];
    console.warn = (...args: any[]) => warnArgs.push(args);

    global.fetch = async (url: string | Request | URL) => {
      if (url.toString().includes('api-t1.fyers.in')) {
        return {
          ok: true,
          json: async () => ({ s: 'error', code: -300, message: 'Invalid auth code' })
        } as any;
      }
      return { ok: false, status: 500, text: async () => 'Proxy failed' } as any;
    };

    const res = await FyersAuthService.generateToken('authcode123');
    
    assert.strictEqual(res.success, false);
    assert.ok(warnArgs.some(args => 
      args[0].includes('Direct token exchange returned non-ok status') && 
      args[1].includes('Invalid auth code')
    ), 'Should log full body when s !== ok');
  });

  await t.test('direct call 200 with { s: "ok" } but missing token logs full body, then falls back', async () => {
    let warnArgs: any[] = [];
    console.warn = (...args: any[]) => warnArgs.push(args);

    global.fetch = async (url: string | Request | URL) => {
      if (url.toString().includes('api-t1.fyers.in')) {
        return {
          ok: true,
          json: async () => ({ s: 'ok', data: { missing_token: 'yes' } }) // no access_token
        } as any;
      }
      return { ok: false, status: 500, text: async () => 'Proxy failed' } as any;
    };

    const res = await FyersAuthService.generateToken('authcode123');
    
    assert.strictEqual(res.success, false);
    assert.ok(warnArgs.some(args => 
      args[0].includes('Direct token exchange succeeded but no token in response') && 
      args[1].includes('missing_token')
    ), 'Should log full body when token is missing');
  });
});
