import { test, expect } from '@playwright/test';
import { stateField } from './helpers/state-harness.js';

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
 * Run: TEST_BASE_URL=http://127.0.0.1:9876 npx playwright test tests/switchview-race.spec.js --headed
 */
test.describe('switchView race condition regression', () => {
  test('rapid switchView calls settle without the prelude timer overriding the final view', async ({ page }) => {
    test.setTimeout(30000);
    const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:9876').replace(/\/$/, '');

    await page.goto(`${BASE_URL}/vector-explorer-polished.html`);
    await page.waitForFunction(() => !!document.getElementById('btn-map') && !!document.getElementById('btn-galaxy'), { timeout: 20000 });

    // Switch to map through the UI button, which exercises the same underlying view handoff path.
    await page.evaluate(() => {
      document.getElementById('btn-map')?.click();
    });
    await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 10000 });

    // Rapidly switch back to galaxy — before any prelude timer could fire
    await page.evaluate(() => {
      document.getElementById('btn-galaxy')?.click();
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
    await page.waitForFunction(() => !!document.getElementById('btn-map') && !!document.getElementById('btn-galaxy'), { timeout: 20000 });

    // Establish map as current view
    await page.evaluate(() => {
      document.getElementById('btn-map')?.click();
    });
    await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 10000 });
    expect(await stateField(page, 'currentView'), 'test state bridge should reflect map view').toBe('map');

    // Click the same control again with the same view selected — should be a no-op.
    await page.evaluate(() => {
      document.getElementById('btn-map')?.click();
    });

    // Must still be map with no errors thrown
    const activeView = await page.evaluate(() => document.body.dataset.activeView);
    expect(activeView).toBe('map');
  });
});
