import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerCacheClearHandler, clearNavigationCaches } from '@/lib/navigation-cache';

describe('navigation-cache (Tier 1)', () => {
  it('registers handlers and invokes them on clearNavigationCaches', () => {
    let calledA = false;
    let calledB = false;

    const unregA = registerCacheClearHandler(() => {
      calledA = true;
    });
    const unregB = registerCacheClearHandler(() => {
      calledB = true;
    });

    clearNavigationCaches();
    assert.equal(calledA, true);
    assert.equal(calledB, true);

    // Unregister A and verify it is not called again
    unregA();
    calledA = false;
    calledB = false;

    clearNavigationCaches();
    assert.equal(calledA, false);
    assert.equal(calledB, true);

    unregB();
  });

  it('safely handles throwing callbacks without breaking other handlers', () => {
    let secondCalled = false;
    const unregThrowing = registerCacheClearHandler(() => {
      throw new Error('Callback boom');
    });
    const unregSecond = registerCacheClearHandler(() => {
      secondCalled = true;
    });

    assert.doesNotThrow(() => {
      clearNavigationCaches();
    });
    assert.equal(secondCalled, true);

    unregThrowing();
    unregSecond();
  });
});
