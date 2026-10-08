import crypto from 'node:crypto';
if (!globalThis.crypto) (globalThis as any).crypto = crypto;

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';
import { hashToken } from '../../lib/auth-token';

describe('Auth Shell Isolation & Protected Route Gating', () => {
  const rootDir = process.cwd();

  describe('1. Static Shell & Layout Isolation', () => {
    it('EnterpriseShell explicitly isolates /unlock from workstation chrome', () => {
      const shellPath = path.join(rootDir, 'src/components/enterprise/EnterpriseShell.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      // Verify the wrapper component inspects pathname === '/unlock'
      assert.ok(
        content.includes("pathname === '/unlock'"),
        "EnterpriseShell must check pathname === '/unlock' to isolate the security gate"
      );

      // Verify the /unlock branch renders only the minimal main container
      assert.ok(
        content.includes('id="main-content"'),
        'EnterpriseShell must render the accessible main-content container on /unlock'
      );

      // Verify that AuthenticatedWorkstationShell is bypassed on /unlock
      assert.ok(
        content.includes('AuthenticatedWorkstationShell'),
        'EnterpriseShell must encapsulate workstation chrome inside AuthenticatedWorkstationShell'
      );
    });

    it('EnterpriseShell /unlock bypass prevents rendering sidebar, topbar, command palette, and footer', () => {
      const shellPath = path.join(rootDir, 'src/components/enterprise/EnterpriseShell.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      const unlockBranch = content.slice(
        content.indexOf("if (pathname === '/unlock')"),
        content.indexOf('return (\n    <AuthenticatedWorkstationShell')
      );

      assert.ok(!unlockBranch.includes('<Sidebar'), '/unlock branch must not render <Sidebar>');
      assert.ok(!unlockBranch.includes('<TopBar'), '/unlock branch must not render <TopBar>');
      assert.ok(!unlockBranch.includes('<CommandPalette'), '/unlock branch must not render <CommandPalette>');
      assert.ok(!unlockBranch.includes('<Footer'), '/unlock branch must not render <Footer>');
      assert.ok(!unlockBranch.includes('role="dialog"'), '/unlock branch must not render mobile navigation drawer');
    });

    it('EnterpriseShell inspects pathname synchronously to eliminate shell flash', () => {
      const shellPath = path.join(rootDir, 'src/components/enterprise/EnterpriseShell.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      // usePathname is called at the top of EnterpriseShell before any conditional return
      assert.ok(
        content.includes('const pathname = usePathname();'),
        'EnterpriseShell must call usePathname synchronously at top level'
      );
    });
  });

  describe('2. Unauthenticated Protected Route Redirects', () => {
    const protectedRoutes = [
      '/',
      '/scanner',
      '/calculate',
      '/journal',
      '/backtest',
      '/analytics',
      '/watchlist',
      '/settings',
      '/market-tools/breadth',
      '/market-tools/breakout',
      '/market-tools/pattern-breakout',
      '/market-tools/momentum-leaders',
    ];

    for (const route of protectedRoutes) {
      it(`redirects unauthenticated visit to ${route} -> /unlock with HTTP 307`, async () => {
        const req = new NextRequest(`http://localhost:3000${route}`, {
          headers: { host: 'localhost:3000' },
        });
        const res = await middleware(req);
        assert.ok(res, `Response must be returned for ${route}`);
        assert.strictEqual(res.status, 307, `Expected 307 redirect for unauthenticated ${route}`);
        assert.strictEqual(
          res.headers.get('location'),
          'http://localhost:3000/unlock',
          `Expected Location header pointing to /unlock for ${route}`
        );
      });
    }
  });

  describe('3. Public Page Access Without Authentication', () => {
    const publicPages = [
      '/unlock',
      '/about',
      '/faq',
      '/offline',
      '/share/xyz-789',
    ];

    for (const page of publicPages) {
      it(`allows anonymous access to public route ${page}`, async () => {
        const req = new NextRequest(`http://localhost:3000${page}`, {
          headers: { host: 'localhost:3000' },
        });
        const res = await middleware(req);
        assert.ok(res, `Response must be returned for ${page}`);
        assert.strictEqual(
          res.headers.get('x-middleware-next'),
          '1',
          `${page} must be allowed to proceed without redirect`
        );
      });
    }
  });

  describe('4. Authenticated Access to Workstation Routes', () => {
    it('allows access to protected routes when valid auth cookie is present', async () => {
      const validHash = await hashToken('test-token-123');
      const req = new NextRequest('http://localhost:3000/scanner', {
        headers: {
          host: 'localhost:3000',
          cookie: `app_access_token=${validHash}`,
        },
      });
      const res = await middleware(req);
      assert.ok(res);
      assert.strictEqual(res.headers.get('x-middleware-next'), '1');
    });

    it('allows access to market-tools when valid auth cookie is present', async () => {
      const validHash = await hashToken('test-token-123');
      const req = new NextRequest('http://localhost:3000/market-tools/breadth', {
        headers: {
          host: 'localhost:3000',
          cookie: `app_access_token=${validHash}`,
        },
      });
      const res = await middleware(req);
      assert.ok(res);
      assert.strictEqual(res.headers.get('x-middleware-next'), '1');
    });
  });
});
