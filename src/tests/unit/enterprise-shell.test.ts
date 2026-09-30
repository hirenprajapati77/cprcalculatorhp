import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SIDEBAR_SECTIONS } from '../../components/enterprise/Sidebar';

describe('Enterprise Navigation & Shell Configuration', () => {
  it('defines all required enterprise navigation sections', () => {
    const sectionTitles = SIDEBAR_SECTIONS.map((s) => s.title);
    const expectedSections = [
      'WORKSPACE',
      'TRADING',
      'ANALYTICS',
      'MARKET TOOLS',
      'SYSTEM',
      'CONFIGURATION',
    ];

    for (const expected of expectedSections) {
      assert.ok(
        sectionTitles.includes(expected),
        `Expected section '${expected}' to be present in SIDEBAR_SECTIONS`
      );
    }
  });

  it('contains all core application routes without omissions', () => {
    const allHrefs = SIDEBAR_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
    const requiredRoutes = [
      '/',
      '/scanner',
      '/watchlist',
      '/calculate',
      '/journal',
      '/backtest',
      '/compare',
      '/market-tools/breadth',
      '/heatmap',
      '/market-tools/breakout',
      '/market-tools/pattern-breakout',
      '/market-tools/momentum-leaders',
      '/history',
      '/about',
      '/faq',
      '/settings',
    ];

    for (const route of requiredRoutes) {
      assert.ok(
        allHrefs.includes(route),
        `Route '${route}' must be present in enterprise navigation`
      );
    }
  });

  it('verifies badges and badge variants are properly styled', () => {
    const allItems = SIDEBAR_SECTIONS.flatMap((s) => s.items);
    const scannerItem = allItems.find((i) => i.href === '/scanner');
    assert.ok(scannerItem);
    assert.equal(scannerItem.badge, 'LIVE');
    assert.equal(scannerItem.badgeVariant, 'green');

    const momentumItem = allItems.find((i) => i.href === '/market-tools/momentum-leaders');
    assert.ok(momentumItem);
    assert.equal(momentumItem.badge, 'HOT');
    assert.equal(momentumItem.badgeVariant, 'amber');
  });

  it('ensures each navigation item has an icon and label', () => {
    for (const section of SIDEBAR_SECTIONS) {
      for (const item of section.items) {
        assert.ok(item.label && item.label.length > 0, `Item with href ${item.href} must have a label`);
        assert.ok(item.icon !== undefined && item.icon !== null, `Item with href ${item.href} must have an icon`);
        assert.ok(item.href.startsWith('/'), `Item href ${item.href} must be an absolute path starting with /`);
      }
    }
  });
});
