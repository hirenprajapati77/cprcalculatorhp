import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../../../next.config';

describe('Market Tools Route Redirects (P3)', () => {
  it('next.config.ts defines permanent redirects for /market-tools and /market-tools/heatmap', async () => {
    assert.ok(typeof nextConfig.redirects === 'function', 'nextConfig must define redirects()');
    const redirects = await nextConfig.redirects();
    assert.ok(Array.isArray(redirects), 'redirects must return an array');

    const marketToolsRedirect = redirects.find((r) => r.source === '/market-tools');
    assert.ok(marketToolsRedirect, 'Redirect for /market-tools must exist');
    assert.strictEqual(marketToolsRedirect.destination, '/market-tools/breadth');
    assert.strictEqual(marketToolsRedirect.permanent, true);

    const heatmapRedirect = redirects.find((r) => r.source === '/market-tools/heatmap');
    assert.ok(heatmapRedirect, 'Redirect for /market-tools/heatmap must exist');
    assert.strictEqual(heatmapRedirect.destination, '/heatmap');
    assert.strictEqual(heatmapRedirect.permanent, true);
  });

  it('market-tools App Router pages invoke redirect to respective destinations', async () => {
    const marketToolsPageModule = await import('../../app/market-tools/page');
    assert.throws(
      () => {
        marketToolsPageModule.default();
      },
      (err: any) => {
        // Next.js redirect throws a NEXT_REDIRECT digest error
        return err?.digest?.startsWith('NEXT_REDIRECT') || err?.message?.includes('NEXT_REDIRECT');
      },
      'MarketToolsIndexPage must invoke Next.js redirect'
    );

    const heatmapPageModule = await import('../../app/market-tools/heatmap/page');
    assert.throws(
      () => {
        heatmapPageModule.default();
      },
      (err: any) => {
        return err?.digest?.startsWith('NEXT_REDIRECT') || err?.message?.includes('NEXT_REDIRECT');
      },
      'MarketToolsHeatmapPage must invoke Next.js redirect'
    );
  });
});
