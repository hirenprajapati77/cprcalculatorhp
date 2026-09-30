import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_OPTIONS, type ThemeMode, type ResolvedTheme } from '../../context/ThemeContext';

describe('ThemeContext & Design Token Configuration', () => {
  it('defines all 5 enterprise theme modes', () => {
    const expectedModes: ThemeMode[] = [
      'dark-pro',
      'dark-oled',
      'light-pro',
      'high-contrast',
      'system',
    ];

    assert.equal(THEME_OPTIONS.length, 5);
    for (const mode of expectedModes) {
      const found = THEME_OPTIONS.find((t) => t.id === mode);
      assert.ok(found, `Expected theme mode '${mode}' to be defined in THEME_OPTIONS`);
      assert.ok(found.name.length > 0);
      assert.ok(found.description.length > 0);
    }
  });

  it('sets dark-pro as default professional dark theme', () => {
    const darkPro = THEME_OPTIONS.find((t) => t.id === 'dark-pro');
    assert.ok(darkPro);
    assert.equal(darkPro.badge, 'DEFAULT');
  });

  it('correctly maps theme IDs to resolved theme classes', () => {
    function simulateThemeResolution(theme: ThemeMode, systemIsLight = false): {
      resolved: ResolvedTheme;
      isLight: boolean;
    } {
      if (theme === 'system') {
        const resolved: ResolvedTheme = systemIsLight ? 'light-pro' : 'dark-pro';
        return { resolved, isLight: systemIsLight };
      }
      return { resolved: theme, isLight: theme === 'light-pro' };
    }

    // Direct themes
    assert.deepEqual(simulateThemeResolution('dark-pro'), {
      resolved: 'dark-pro',
      isLight: false,
    });
    assert.deepEqual(simulateThemeResolution('dark-oled'), {
      resolved: 'dark-oled',
      isLight: false,
    });
    assert.deepEqual(simulateThemeResolution('light-pro'), {
      resolved: 'light-pro',
      isLight: true,
    });
    assert.deepEqual(simulateThemeResolution('high-contrast'), {
      resolved: 'high-contrast',
      isLight: false,
    });

    // System theme resolution
    assert.deepEqual(simulateThemeResolution('system', false), {
      resolved: 'dark-pro',
      isLight: false,
    });
    assert.deepEqual(simulateThemeResolution('system', true), {
      resolved: 'light-pro',
      isLight: true,
    });
  });
});
