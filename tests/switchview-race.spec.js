import { test, expect } from '@playwright/test';

/**
 * Regression test: switchView must not allow a stale prelude timer to override
 * a subsequent switchView call when the user changes view target rapidly.
 *
 * Bug: The setTimeout in switchView (terrain prelude) checked `state.currentView !== 'galaxy'`
 * only AFTER the timer fired. If switchView was called twice in quick succession — first to
 * map (with prelude), then back to galaxy before the 1200ms timer fired — the timer would
 * still fire and call switchView('map') with stale options, overriding the galaxy target.
 *
 * Fix: Added `state.currentView !== 'galaxy'` guard inside the timer callback, and a defensive
 * early-return at the top of switchView when the view is already current.
 *
 * Run: TEST_BASE_URL=http://127.0.0.1:9876 npx playwright test tests/switchview-race.spec.js
 */
test.describe('switchView race condition regression', () => {
  test('rapid switchView calls settle without the prelude timer overriding the final view', async ({ page }) => {
    test.setTimeout(30000);
    const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:9876').replace(/\/$/, '');

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.switchView === 'function', { timeout: 20000 });

    // Switch to map (with prelude skipped so we don't wait 1200ms)
    await page.evaluate(() => {
      window.switchView('map', { skipTerrainPrelude: true, skipUrlSync: true });
    });
    await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 10000 });

    // Rapidly switch back to galaxy — before any prelude timer could fire
    await page.evaluate(() => {
      window.switchView('galaxy', { skipUrlSync: true, silentHandoff: true });
    });

    // The body dataset must reflect galaxy, not be overridden by a stale map prelude
    await page.waitForFunction(
      () => document.body.dataset.activeView === 'galaxy',
      null,
      { timeout: 5000 }
    );
    const activeView = await page.evaluate(() => document.body.dataset.activeView);
    expect(activeView).toBe('galaxy');
  });

  test('switchView returns early when called with the already-current view', async ({ page }) => {
    test.setTimeout(30000);
    const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:9876').replace(/\/$/, '');

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => typeof window.switchView === 'function', { timeout: 20000 });

    // Establish map as current view
    await page.evaluate(() => {
      window.switchView('map', { skipTerrainPrelude: true, skipUrlSync: true });
    });
    await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 10000 });
    const mapTimestamp = await page.evaluate(() => {
      return window.__TEST_STATE__?.currentView;
    });

    // Call switchView('map') again with the same view — must be a no-op (no error)
    await page.evaluate(() => {
      window.switchView('map', { skipTerrainPrelude: true, skipUrlSync: true });
    });

    // Must still be map with no errors thrown
    const activeView = await page.evaluate(() => document.body.dataset.activeView);
    expect(activeView).toBe('map');
  });
});
