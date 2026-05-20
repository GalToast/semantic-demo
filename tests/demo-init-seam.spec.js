/**
 * Runtime smoke for the app/demo-controller startup seam.
 *
 * Proves the canonical shell reaches window.demoController.init() during the
 * real launch path, while demo-controller.js keeps guard/readiness ownership.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');
const APP_PATH = process.env.TEST_APP_PATH || '/vector-explorer-polished.html';
const APP_URL = `${BASE_URL}${APP_PATH}`;
const STORAGE_KEY = 'moco_mycelium_demo_v1';

const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: {
    label: 'Search ready',
    detail: 'Semantic search is ready.'
  }
};

async function installDemoControllerProbe(page) {
  await page.addInitScript(({ storageKey }) => {
    localStorage.removeItem(storageKey);
    sessionStorage.clear();

    const probe = {
      assigned: false,
      initCallCount: 0,
      initCallTimestamps: [],
      apiTypes: {}
    };
    let controllerValue;

    Object.defineProperty(window, '__demoControllerProbe', {
      configurable: true,
      value: probe
    });

    Object.defineProperty(window, 'demoController', {
      configurable: true,
      get() {
        return controllerValue;
      },
      set(value) {
        controllerValue = value;
        probe.assigned = Boolean(value);
        probe.apiTypes = {
          init: typeof value?.init,
          start: typeof value?.start,
          cancel: typeof value?.cancel,
          complete: typeof value?.complete,
          isRunning: typeof value?.isRunning
        };

        if (!value || typeof value.init !== 'function' || value.__initProbeWrapped) return;
        const originalInit = value.init;
        Object.defineProperty(value, '__initProbeWrapped', {
          configurable: true,
          value: true
        });
        value.init = function initProbeWrapper(...args) {
          probe.initCallCount += 1;
          probe.initCallTimestamps.push(Date.now());
          return originalInit.apply(this, args);
        };
      }
    });
  }, { storageKey: STORAGE_KEY });
}

async function routeHealthySemanticLane(page) {
  await page.route('**/api.php?action=semantic_lane_health**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEMANTIC_HEALTH_STUB)
    });
  });
}

async function cleanupDemoState(page) {
  try {
    await page.evaluate((storageKey) => {
      localStorage.removeItem(storageKey);
      sessionStorage.clear();
    }, STORAGE_KEY);
  } catch {
    // Navigation failures can destroy the execution context; cleanup is best effort.
  }
}

test.describe('demo-controller init seam', () => {
  test.beforeEach(async ({ page }) => {
    await routeHealthySemanticLane(page);
    await installDemoControllerProbe(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupDemoState(page);
  });

  test('app load calls window.demoController.init exactly once and exposes the controller API', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(`${APP_URL}?demo=force`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => window.__demoControllerProbe?.initCallCount === 1,
      { timeout: 25000 }
    );

    await page.waitForFunction(
      () => window.demoController?.isRunning?.() === true,
      { timeout: 25000 }
    );

    await page.waitForTimeout(300);

    const probe = await page.evaluate(() => window.__demoControllerProbe);
    expect(probe.assigned).toBe(true);
    expect(probe.initCallCount).toBe(1);
    expect(probe.initCallTimestamps).toHaveLength(1);
    expect(probe.apiTypes).toEqual({
      init: 'function',
      start: 'function',
      cancel: 'function',
      complete: 'function',
      isRunning: 'function'
    });
  });

  test('repeat visit with seen flag keeps demo idle after the one app handoff', async ({ page }) => {
    test.setTimeout(60000);

    await page.addInitScript(({ storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify({
        seen: true,
        seenAt: Date.now(),
        version: 1
      }));
      sessionStorage.clear();
    }, { storageKey: STORAGE_KEY });

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => window.__demoControllerProbe?.initCallCount === 1,
      { timeout: 25000 }
    );

    const state = await page.evaluate(() => ({
      initCallCount: window.__demoControllerProbe.initCallCount,
      isRunning: window.demoController?.isRunning?.(),
      sessionStarted: sessionStorage.getItem('moco_mycelium_demo_session_v1') !== null
    }));

    expect(state.initCallCount).toBe(1);
    expect(state.isRunning).toBe(false);
    expect(state.sessionStarted).toBe(false);
  });

  test('startup recovery notice renders when semantic relationship artifacts are unavailable', async ({ page }) => {
    test.setTimeout(60000);

    await page.route('**/semantic_threads*.dat**', async route => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'test unavailable' })
      });
    });

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

    const notice = page.locator('#startup-recovery-status');
    await expect(notice).toBeVisible({ timeout: 25000 });
    await expect(notice).toContainText('Semantic relationship data');
    await expect(notice).toContainText('temporarily unavailable');

    await expect(page.locator('body')).toHaveAttribute('data-startup-recovery', 'degraded');
  });
});
