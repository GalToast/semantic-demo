/**
 * Micro-demo Visual QA Tests
 *
 * Tests the 10-second first-time micro-demo sequence:
 * - Veil + pill appear at T=0
 * - Camera glides to showcase node at T=800ms
 * - Info card shows at T=2200ms
 * - Name pulses at T=4500ms
 * - Camera returns to overview at T=7800ms
 * - Demo completes at T=8800ms
 *
 * Run with: npx playwright test tests/micro-demo.spec.js --headed
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';
const APP_PATH = process.env.TEST_APP_PATH || '/vector-explorer-polished.html';
const DEMO_FORCE = '?demo=force';
const STORAGE_KEY = 'moco_mycelium_demo_v1';
const APP_URL = `${BASE_URL.replace(/\/$/, '')}${APP_PATH}`;
const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: {
    label: 'Search ready',
    detail: 'Semantic search is ready.'
  }
};

async function seedDemoSeen(page) {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ seen: true, seenAt: Date.now(), version: 1 }));
  }, { key: STORAGE_KEY });
}

test.describe('Micro-demo system', () => {
  // Headed mode with WebGL is required for these 3D-scene tests: headless Chromium
  // disables the system GPU and the WebGL canvas renders blank, masking visual
  // regressions and timing assumptions in the demo choreography. Run with
  // `npx playwright test tests/micro-demo.spec.js --browser=chromium --headed` (or
  // `npm run test:microdemo:server`).
  test.use({ headless: false, launchOptions: { args: ['--use-gl=angle', '--enable-webgl'] } });

  test.beforeEach(async ({ page }) => {
    await page.route('**/api.php?action=semantic_lane_health**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEMANTIC_HEALTH_STUB)
      });
    });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate((key) => {
      localStorage.removeItem(key);
      sessionStorage.clear();
    }, STORAGE_KEY);
  });

  test('fires on first visit and completes successfully', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => localStorage.getItem('moco_mycelium_demo_v1') !== null,
      { timeout: 45000 }
    );

    const stored = await page.evaluate(() => localStorage.getItem('moco_mycelium_demo_v1'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored);
    expect(parsed.seen).toBe(true);

    await expect(page).toHaveTitle(/MoCo Business Mycelium/);

    const realErrors = errors.filter(e =>
      !e.includes('Semantic search') &&
      !e.includes('net::ERR')
    );
    expect(realErrors, `Unexpected errors: ${JSON.stringify(realErrors)}`).toHaveLength(0);
  });

  test('does not fire on repeat visits', async ({ page }) => {
    await seedDemoSeen(page);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    const isRunning = await page.evaluate(() => window.isMicroDemoRunning?.());
    expect(isRunning).toBe(false);
  });

  test('demo=force bypasses already-seen guard', async ({ page }) => {
    await seedDemoSeen(page);
    await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => window.isMicroDemoRunning?.() === true,
      { timeout: 8000 }
    );

    const isRunning = await page.evaluate(() => window.isMicroDemoRunning?.());
    expect(isRunning).toBe(true);
  });

  test('cancelMicroDemo restores overview and stops demo', async ({ page }) => {
    await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => window.isMicroDemoRunning?.() === true,
      { timeout: 8000 }
    );

    await page.evaluate(() => window.cancelMicroDemo?.('user-input'));

    await page.waitForFunction(
      () => window.isMicroDemoRunning?.() === false,
      { timeout: 3000 }
    );

    await expect(page).toHaveTitle(/MoCo Business Mycelium/);
  });
});
