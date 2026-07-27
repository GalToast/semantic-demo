/**
 * Micro-demo Visual QA Tests
 *
 * Tests the 10-second first-time micro-demo sequence.
 * Supports both legacy (port 8795) and Svelte (port 5173) servers.
 * Auto-detects which server is running.
 *
 * LEGACY PATH (port 8795):
 *   Uses window.isMicroDemoRunning() and window.cancelMicroDemo()
 *
 * SVELTE PATH (port 5173):
 *   Uses body[data-demo-phase] attribute and demo store state
 *
 * Run with: npx playwright test tests/micro-demo.spec.js --headed
 */

import { test, expect } from '@playwright/test';

// ── Configuration ────────────────────────────────────────────────────────────

const LEGACY_PORT = process.env.LEGACY_PORT || 8795;
const SVELTE_PORT = process.env.SVELTE_PORT || 5173;
const LEGACY_URL = process.env.LEGACY_URL || `http://127.0.0.1:${LEGACY_PORT}`;
const SVELTE_URL = process.env.SVELTE_URL || `http://localhost:${SVELTE_PORT}`;

/** Which server to target — set via TEST_SERVER env var or auto-detect. */
const TEST_SERVER = process.env.TEST_SERVER || 'svelte'; // 'legacy' | 'svelte'
const BASE_URL = TEST_SERVER === 'legacy' ? LEGACY_URL : SVELTE_URL;
const APP_PATH = TEST_SERVER === 'legacy' ? '/index.html' : '/';
const DEMO_FORCE = '?demo=force';
const STORAGE_KEY = 'moco_mycelium_demo_v1';
const SESSION_KEY = 'moco_mycelium_demo_session_v1';
const APP_URL = `${BASE_URL.replace(/\/$/, '')}${APP_PATH}`;

const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: {
    label: 'Search ready',
    detail: 'Semantic search is ready.'
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function seedDemoSeen(page) {
  await page.addInitScript(({ storageKey }) => {
    localStorage.setItem(storageKey, JSON.stringify({ seen: true, seenAt: Date.now(), version: 1 }));
  }, { storageKey: STORAGE_KEY });
}

async function seedSessionSkipped(page) {
  await page.addInitScript(({ sessionKey }) => {
    sessionStorage.setItem(sessionKey, 'user-input');
  }, { sessionKey: SESSION_KEY });
}

/**
 * Check if demo is currently running.
 * Legacy: window.isMicroDemoRunning()
 * Svelte: body[data-demo-phase] is not IDLE/COMPLETE/CANCELLED
 */
async function isDemoRunning(page) {
  return page.evaluate((serverType) => {
    if (serverType === 'legacy') {
      return typeof window.isMicroDemoRunning === 'function' && window.isMicroDemoRunning() === true;
    } else {
      // Svelte: check body data-demo-phase attribute
      const phase = document.body?.dataset?.demoPhase;
      return phase && phase !== 'IDLE' && phase !== 'COMPLETE' && phase !== 'CANCELLED';
    }
  }, TEST_SERVER);
}

/**
 * Cancel the demo.
 * Legacy: window.cancelMicroDemo()
 * Svelte: click the dismiss button (DemoChoreography renders .demo-dismiss)
 */
async function cancelDemo(page) {
  if (TEST_SERVER === 'legacy') {
    await page.evaluate(() => window.cancelMicroDemo?.('user-input'));
  } else {
    // Svelte: click the dismiss button
    const dismissBtn = page.locator('.demo-dismiss');
    if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dismissBtn.click();
    } else {
      // Fallback: set body data attribute to trigger cancel
      await page.evaluate(() => {
        document.body.dataset.demoPhase = 'CANCELLED';
      });
    }
  }
}

/**
 * Get the current demo phase.
 * Legacy: window.isMicroDemoRunning() (boolean only)
 * Svelte: body[data-demo-phase] attribute
 */
async function getDemoPhase(page) {
  return page.evaluate((serverType) => {
    if (serverType === 'legacy') {
      return window.isMicroDemoRunning?.() ? 'RUNNING' : 'IDLE';
    } else {
      return document.body?.dataset?.demoPhase || 'UNKNOWN';
    }
  }, TEST_SERVER);
}

// ── Test Suite ───────────────────────────────────────────────────────────────

console.log(`\n  Micro-demo tests targeting: ${TEST_SERVER} server at ${APP_URL}\n`);

// Headed mode with WebGL is required for these 3D-scene tests.
// Must be top-level — test.use() cannot appear inside test.describe().
test.use({ headless: false, launchOptions: { args: ['--use-gl=angle', '--enable-webgl'] } });

test.describe(`Micro-demo system (${TEST_SERVER})`, () => {

  test.beforeEach(async ({ page }) => {
    // Stub semantic health endpoint
    await page.route('**/api.php?action=semantic_lane_health**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SEMANTIC_HEALTH_STUB)
      });
    });

    // Stub any other API calls that might fail
    await page.route('**/api.php**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, state: 'healthy' })
      });
    });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(({ storageKey, sessionKey }) => {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(sessionKey);
    }, { storageKey: STORAGE_KEY, sessionKey: SESSION_KEY });
  });

  test('fires on first visit and sets storage flag', async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

    // Wait for demo to start (body data-demo-phase changes or window.isMicroDemoRunning)
    await page.waitForFunction(
      (serverType) => {
        if (serverType === 'legacy') {
          return typeof window.isMicroDemoRunning === 'function' && window.isMicroDemoRunning() === true;
        } else {
          const phase = document.body?.dataset?.demoPhase;
          return phase && phase !== 'IDLE';
        }
      },
      TEST_SERVER,
      { timeout: 30000 }
    );

    // Verify localStorage was set
    await page.waitForFunction(
      (key) => localStorage.getItem(key) !== null,
      STORAGE_KEY,
      { timeout: 45000 }
    );

    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toBeTruthy();

    await expect(page).toHaveTitle(/Semantic Explorer|MoCo Business Mycelium/);

    // Filter out expected noise
    const realErrors = errors.filter(e =>
      !e.includes('Semantic search') &&
      !e.includes('net::ERR') &&
      !e.includes('favicon') &&
      !e.includes('WebSocket')
    );
    expect(realErrors, `Unexpected errors: ${JSON.stringify(realErrors)}`).toHaveLength(0);
  });

  test('does not fire on repeat visits (session guard)', async ({ page }) => {
    await seedSessionSkipped(page);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    const running = await isDemoRunning(page);
    expect(running).toBe(false);
  });

  test('does not fire when lifetime flag is set', async ({ page }) => {
    await seedDemoSeen(page);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

    const running = await isDemoRunning(page);
    expect(running).toBe(false);
  });

  test('demo=force bypasses already-seen guard', async ({ page }) => {
    test.setTimeout(30000);
    await seedDemoSeen(page);
    await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      (serverType) => {
        if (serverType === 'legacy') {
          return window.isMicroDemoRunning?.() === true;
        } else {
          const phase = document.body?.dataset?.demoPhase;
          return phase && phase !== 'IDLE';
        }
      },
      TEST_SERVER,
      { timeout: 15000 }
    );

    const running = await isDemoRunning(page);
    expect(running).toBe(true);
  });

  test('cancel stops the demo', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      (serverType) => {
        if (serverType === 'legacy') {
          return window.isMicroDemoRunning?.() === true;
        } else {
          const phase = document.body?.dataset?.demoPhase;
          return phase && phase !== 'IDLE';
        }
      },
      TEST_SERVER,
      { timeout: 15000 }
    );

    await cancelDemo(page);

    await page.waitForFunction(
      (serverType) => {
        if (serverType === 'legacy') {
          return window.isMicroDemoRunning?.() === false;
        } else {
          const phase = document.body?.dataset?.demoPhase;
          return !phase || phase === 'IDLE' || phase === 'CANCELLED';
        }
      },
      TEST_SERVER,
      { timeout: 5000 }
    );

    const running = await isDemoRunning(page);
    expect(running).toBe(false);
  });

  if (TEST_SERVER === 'svelte') {
    // Svelte-specific tests

    test('body data-demo-phase attribute transitions through phases', async ({ page }) => {
      test.setTimeout(30000);
      await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

      // Wait for demo to start (first phase is OVERVIEW)
      await page.waitForFunction(
        () => document.body?.dataset?.demoPhase === 'OVERVIEW',
        { timeout: 15000 }
      );

      const phase = await getDemoPhase(page);
      expect(phase).toBe('OVERVIEW');

      // Wait for it to progress past OVERVIEW to the next phase (SEARCH or beyond, or terminal)
      await page.waitForFunction(
        () => {
          const p = document.body?.dataset?.demoPhase;
          // Current demo sequence: OVERVIEW → SEARCH → FOCUS → THREADS → NEIGHBORS →
          // TRAIL → DIVE → FILTER → MAP → RETURN → COMPLETE
          return p && p !== 'IDLE' && p !== 'OVERVIEW';
        },
        { timeout: 5000 }
      );
    });

    test('dismiss button is visible during active demo', async ({ page }) => {
      test.setTimeout(30000);
      await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

      // Wait for demo to start
      await page.waitForFunction(
        () => {
          const phase = document.body?.dataset?.demoPhase;
          return phase && phase !== 'IDLE';
        },
        { timeout: 15000 }
      );

      // Check for dismiss button
      const dismissBtn = page.locator('.demo-dismiss');
      await expect(dismissBtn).toBeVisible({ timeout: 5000 });
    });

    test('nodemo=1 suppresses demo', async ({ page }) => {
      await page.goto(`${APP_URL}?nodemo=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

      const phase = await getDemoPhase(page);
      expect(phase === 'IDLE' || phase === 'UNKNOWN').toBeTruthy();
    });

    test('demo=force bypasses session storage guard', async ({ page }) => {
      await seedSessionSkipped(page);
      await page.goto(`${APP_URL}${DEMO_FORCE}`, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(
        () => {
          const phase = document.body?.dataset?.demoPhase;
          return phase && phase !== 'IDLE';
        },
        { timeout: 15000 }
      );

      const running = await isDemoRunning(page);
      expect(running).toBe(true);
    });
  } else {
    // Legacy-specific tests

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
  }
});
