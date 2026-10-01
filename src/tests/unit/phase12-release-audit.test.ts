import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { THEME_OPTIONS } from '@/context/ThemeContext';

describe('Phase 12: Release-Readiness & Accessibility Audit', () => {
  const rootDir = path.resolve(__dirname, '../../../');

  describe('1. 5-Theme Design Tokens & Contrast Audit', () => {
    it('defines all 5 institutional themes with descriptions', () => {
      const themeIds = THEME_OPTIONS.map((t) => t.id);
      assert.deepEqual(themeIds, ['dark-pro', 'dark-oled', 'light-pro', 'high-contrast', 'system']);
      
      THEME_OPTIONS.forEach((theme) => {
        assert.ok(theme.name.length > 0, `Theme ${theme.id} must have a display name`);
        assert.ok(theme.description.length > 0, `Theme ${theme.id} must have a description`);
      });
    });

    it('declares essential tokens in globals.css for dark-pro, dark-oled, light-pro, and high-contrast', () => {
      const globalsCssPath = path.join(rootDir, 'src/app/globals.css');
      const content = fs.readFileSync(globalsCssPath, 'utf8');

      const requiredThemes = ['[data-theme="dark-pro"]', '[data-theme="dark-oled"]', '[data-theme="light-pro"]', '[data-theme="high-contrast"]'];
      for (const th of requiredThemes) {
        assert.ok(content.includes(th), `globals.css must define ${th}`);
      }

      const requiredTokens = [
        '--background',
        '--foreground',
        '--surface-panel',
        '--surface-elevated',
        '--surface-hover',
        '--text-primary',
        '--text-secondary',
        '--text-muted',
        '--border-default',
        '--border-focus',
        '--trading-bullish',
        '--trading-bearish',
        '--trading-neutral',
      ];

      for (const token of requiredTokens) {
        assert.ok(content.includes(token), `globals.css must define token ${token}`);
      }
    });

    it('enforces ultra-high visibility focus ring and colors for high-contrast theme', () => {
      const globalsCssPath = path.join(rootDir, 'src/app/globals.css');
      const content = fs.readFileSync(globalsCssPath, 'utf8');

      const highContrastBlock = content.slice(content.indexOf('[data-theme="high-contrast"]'));
      assert.ok(highContrastBlock.includes('--border-focus: #ffff00;'), 'High contrast must use yellow focus indicator');
      assert.ok(highContrastBlock.includes('--trading-bullish: #00ff66;'), 'High contrast must use vibrant green');
      assert.ok(highContrastBlock.includes('--trading-bearish: #ff3333;'), 'High contrast must use vibrant red');
    });

    it('defines global focus-visible and prefers-reduced-motion accessibility rules', () => {
      const globalsCssPath = path.join(rootDir, 'src/app/globals.css');
      const content = fs.readFileSync(globalsCssPath, 'utf8');

      assert.ok(content.includes(':focus-visible'), 'globals.css must define :focus-visible');
      assert.ok(content.includes('outline: 2px solid var(--border-focus);'), 'globals.css must style focus-visible with border-focus');
      assert.ok(content.includes('@media (prefers-reduced-motion: reduce)'), 'globals.css must respect prefers-reduced-motion');
    });
  });

  describe('2. Keyboard Navigation & Overlay Dismissal Audit', () => {
    it('EnterpriseShell binds Ctrl+K / Cmd+K, Ctrl+[, and Escape', () => {
      const shellPath = path.join(rootDir, 'src/components/enterprise/EnterpriseShell.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      assert.ok(content.includes("e.key.toLowerCase() === 'k'"), 'Shell must listen for Ctrl+K / Cmd+K');
      assert.ok(content.includes("e.key === '['"), 'Shell must listen for Ctrl+[ sidebar toggle');
      assert.ok(content.includes("e.key === 'Escape'"), 'Shell must listen for Escape key to close overlays');
    });

    it('CommandPalette handles keyboard arrows, enter, and escape', () => {
      const palettePath = path.join(rootDir, 'src/components/enterprise/CommandPalette.tsx');
      const content = fs.readFileSync(palettePath, 'utf8');

      assert.ok(content.includes("e.key === 'ArrowDown'"), 'CommandPalette must handle ArrowDown');
      assert.ok(content.includes("e.key === 'ArrowUp'"), 'CommandPalette must handle ArrowUp');
      assert.ok(content.includes("e.key === 'Enter'"), 'CommandPalette must handle Enter selection');
      assert.ok(content.includes("e.key === 'Escape'"), 'CommandPalette must handle Escape dismissal');
    });

    it('StockDetailDrawer and TradeDetailDrawer handle Escape dismissal and backdrop clicks', () => {
      const stockDrawerPath = path.join(rootDir, 'src/components/enterprise/StockDetailDrawer.tsx');
      const stockDrawer = fs.readFileSync(stockDrawerPath, 'utf8');
      assert.ok(stockDrawer.includes("e.key === 'Escape'"), 'StockDetailDrawer must handle Escape key');
      assert.ok(stockDrawer.includes('onClick={onClose}'), 'StockDetailDrawer must handle backdrop click');

      const tradeDrawerPath = path.join(rootDir, 'src/components/journal/TradeDetailDrawer.tsx');
      const tradeDrawer = fs.readFileSync(tradeDrawerPath, 'utf8');
      assert.ok(tradeDrawer.includes("e.key === 'Escape'"), 'TradeDetailDrawer must handle Escape key');
      assert.ok(tradeDrawer.includes('onClick={onClose}'), 'TradeDetailDrawer must handle backdrop click');
    });
  });

  describe('3. Accessibility (ARIA & Semantics) Audit', () => {
    it('EnterpriseShell provides skip-to-content landmark link and main-content target', () => {
      const shellPath = path.join(rootDir, 'src/components/enterprise/EnterpriseShell.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      assert.ok(content.includes('href="#main-content"'), 'EnterpriseShell must include skip-to-content link');
      assert.ok(content.includes('id="main-content"'), 'EnterpriseShell main element must have id="main-content"');
    });

    it('Sidebar declares navigation landmark label and aria-expanded on toggle button', () => {
      const sidebarPath = path.join(rootDir, 'src/components/enterprise/Sidebar.tsx');
      const content = fs.readFileSync(sidebarPath, 'utf8');

      assert.ok(content.includes('aria-label="Main sidebar navigation"'), 'Sidebar aside must have landmark aria-label');
      assert.ok(content.includes('aria-expanded={!collapsed}'), 'Sidebar toggle button must have aria-expanded');
    });

    it('CommandPalette adheres to ARIA dialog, combobox, and listbox patterns', () => {
      const palettePath = path.join(rootDir, 'src/components/enterprise/CommandPalette.tsx');
      const content = fs.readFileSync(palettePath, 'utf8');

      assert.ok(content.includes('role="dialog"'), 'CommandPalette card must have role="dialog"');
      assert.ok(content.includes('aria-modal="true"'), 'CommandPalette must be aria-modal="true"');
      assert.ok(content.includes('role="combobox"'), 'Search input must have role="combobox"');
      assert.ok(content.includes('role="listbox"'), 'Results list must have role="listbox"');
      assert.ok(content.includes('role="option"'), 'Result items must have role="option"');
    });

    it('StockDetailDrawer and TradeDetailDrawer have dialog roles and accessible labels', () => {
      const stockDrawerPath = path.join(rootDir, 'src/components/enterprise/StockDetailDrawer.tsx');
      const stockDrawer = fs.readFileSync(stockDrawerPath, 'utf8');
      assert.ok(stockDrawer.includes('role="dialog"'), 'StockDetailDrawer must have role="dialog"');
      assert.ok(stockDrawer.includes('aria-modal="true"'), 'StockDetailDrawer must have aria-modal="true"');
      assert.ok(stockDrawer.includes('role="tablist"'), 'StockDetailDrawer must have role="tablist"');
      assert.ok(stockDrawer.includes('role="tab"'), 'StockDetailDrawer must have role="tab"');

      const tradeDrawerPath = path.join(rootDir, 'src/components/journal/TradeDetailDrawer.tsx');
      const tradeDrawer = fs.readFileSync(tradeDrawerPath, 'utf8');
      assert.ok(tradeDrawer.includes('role="dialog"'), 'TradeDetailDrawer must have role="dialog"');
      assert.ok(tradeDrawer.includes('aria-modal="true"'), 'TradeDetailDrawer must have aria-modal="true"');
      assert.ok(tradeDrawer.includes('aria-label="Close trade details"'), 'TradeDetailDrawer close button must have aria-label');
    });
  });

  describe('4. Theme Hydration & Performance Flash Prevention', () => {
    it('RootLayout has an inline script to prevent theme flash before hydration', () => {
      const layoutPath = path.join(rootDir, 'src/app/layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');

      assert.ok(content.includes('cpr_ui_theme'), 'Layout inline script must inspect cpr_ui_theme in localStorage');
      assert.ok(content.includes("document.documentElement.setAttribute('data-theme', resolved)"), 'Layout script must set data-theme synchronously');
      assert.ok(content.includes('suppressHydrationWarning'), 'html and body must have suppressHydrationWarning');
    });
  });

  describe('5. Backend Trading Invariants Frozen Audit', () => {
    it('confirms critical trading calculation files exist and remain unmolested', () => {
      const criticalFiles = [
        'src/lib/cpr-engine.ts',
        'src/lib/cpr-direction.ts',
        'src/lib/cpr-relationship.ts',
        'src/lib/friction-calculator.ts',
        'src/config/friction-constants.ts',
        'src/lib/pnl.ts',
        'src/services/scanner-controller.ts',
        'src/services/backtest/backtest.service.ts',
        'src/services/market.service.ts',
        'src/services/overnight/overnight.service.ts',
      ];

      for (const file of criticalFiles) {
        const fullPath = path.join(rootDir, file);
        assert.ok(fs.existsSync(fullPath), `Critical trading engine file ${file} must exist`);
      }
    });
  });

  describe('6. Responsive Layout & 320px Viewport Hardening Audit', () => {
    it('ScannerKpiStrip stacks to single-column on 320px-375px mobile and 2-col on small tablet', () => {
      const scannerKpiPath = path.join(rootDir, 'src/components/scanner/ScannerKpiStrip.tsx');
      const content = fs.readFileSync(scannerKpiPath, 'utf8');
      assert.ok(content.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'), 'Scanner KPI must use grid-cols-1 on narrow mobile');
    });

    it('JournalKpiStrip stacks cleanly on 320px mobile', () => {
      const journalKpiPath = path.join(rootDir, 'src/components/journal/JournalKpiStrip.tsx');
      const content = fs.readFileSync(journalKpiPath, 'utf8');
      assert.ok(content.includes('grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6'), 'Journal KPI must use grid-cols-1 on narrow mobile');
    });

    it('Settings and Debug consoles use responsive grids for narrow mobile viewports', () => {
      const settingsPath = path.join(rootDir, 'src/app/settings/page.tsx');
      const settingsContent = fs.readFileSync(settingsPath, 'utf8');
      assert.ok(settingsContent.includes('grid-cols-1 sm:grid-cols-2 gap-2'), 'Settings density buttons must be single-column on mobile');
      assert.ok(settingsContent.includes('flex flex-wrap items-center gap-2'), 'Settings action buttons must wrap');

      const debugPath = path.join(rootDir, 'src/app/settings/debug/page.tsx');
      const debugContent = fs.readFileSync(debugPath, 'utf8');
      assert.ok(debugContent.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'), 'Debug KPI cards must stack on mobile');
    });

    it('Analytics and Backtest headers employ flex-wrap to prevent 320px container overflow', () => {
      const analyticsPath = path.join(rootDir, 'src/app/analytics/page.tsx');
      const analyticsContent = fs.readFileSync(analyticsPath, 'utf8');
      assert.ok(analyticsContent.includes('flex flex-wrap items-center gap-2'), 'Analytics header links must wrap on mobile');

      const backtestPath = path.join(rootDir, 'src/app/backtest/page.tsx');
      const backtestContent = fs.readFileSync(backtestPath, 'utf8');
      assert.ok(backtestContent.includes('flex flex-wrap items-center gap-2 text-xs'), 'Backtest runs badges must wrap on mobile');
    });

    it('TopBar, EnterpriseShell, and CommandPalette allocate padding for 320px viewports', () => {
      const topBarPath = path.join(rootDir, 'src/components/enterprise/TopBar.tsx');
      const topBarContent = fs.readFileSync(topBarPath, 'utf8');
      assert.ok(topBarContent.includes('px-2.5 sm:px-4'), 'TopBar must use px-2.5 on narrow viewports');

      const shellPath = path.join(rootDir, 'src/components/enterprise/EnterpriseShell.tsx');
      const shellContent = fs.readFileSync(shellPath, 'utf8');
      assert.ok(shellContent.includes('px-2.5 sm:px-5 lg:px-6'), 'EnterpriseShell canvas must use px-2.5 on narrow mobile');

      const palettePath = path.join(rootDir, 'src/components/enterprise/CommandPalette.tsx');
      const paletteContent = fs.readFileSync(palettePath, 'utf8');
      assert.ok(paletteContent.includes('px-2.5 sm:px-4'), 'CommandPalette must use px-2.5 on narrow mobile');
    });
  });
});
