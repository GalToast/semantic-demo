/**
 * critical-visual-layout-regression.spec.js
 *
 * Focused regression coverage for critical visual defects identified by QA:
 *  1. Mobile focus panel overlap - journey controls / Step Inside button at 390x844
 *  2. Short-landscape compass clipping - compass overflow at 844x390
 *  3. Low-contrast threads - thread lines meet minimum opacity/count thresholds
 *  4. Visible STATIC DEV MODE indicator - no dev-mode badge in production UI
 *
 * Uses viewport-specific geometry checks and computed style inspection rather
 * than screenshot comparison alone.
 *
 * Run:
 *   npx playwright test tests/critical-visual-layout-regression.spec.js
 *   TEST_BASE_URL=http://127.0.0.1:8795 npx playwright test tests/critical-visual-layout-regression.spec.js
 */

import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');
const APP_PATH = '/vector-explorer-polished.html';

// Helpers

/** Probe visible rect for a selector, returns null if not visible. */
async function probeRect(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

/** Returns true when two rects overlap on both axes. */
function rectsOverlap(a, b) {
  if (!a || !b) return false;
  const xOverlap = a.left < b.right && b.left < a.right;
  const yOverlap = a.top < b.bottom && b.top < a.bottom;
  return xOverlap && yOverlap;
}

// TEST 1 - Mobile focus panel overlap (390x844, trail/inside mode)

test.describe('Critical Visual Layout Regression', () => {

  // Defect 1: Mobile focus panel overlap
  test('mobile-focus-panel-no-overlap - journey block and Step Inside CTA do not overlap at 390x844', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1`, { waitUntil: 'domcontentloaded' });

    // Wait for app ready
    await page.waitForFunction(() =>
      typeof window.focusOnNode === 'function' && Boolean(window.state?.points?.length),
    { timeout: 30000 });

    // Trigger trail/inside state via JS, the state that exposes overlap.
    await page.evaluate(() => {
      // Activate trail mode with depth >= 1 to show journey controls
      document.body.dataset.panelSurface = 'focus';
      document.body.dataset.focusPanelMode = 'focus';
      if (typeof window.setTrailDepth === 'function') {
        window.setTrailDepth(1, { skipUrlSync: true });
      }
    });
    await page.waitForTimeout(1200);

    // Click a search result to enter focus + trail state
    await page.evaluate(() => {
      if (typeof window.focusOnNode === 'function') {
        // Focus a node that has trail neighbors. 4200 is historically used in overlap QA.
        window.focusOnNode(4200, { fromSearchResult: true });
      }
    });
    await page.waitForTimeout(1800);

    // Probe geometry
    const bounds = await page.evaluate(() => {
      const journey = document.querySelector('.focus-stage-journey.active');
      const diveBtn = document.querySelector('.focus-stage-dive-btn');
      const card = document.querySelector('.focus-stage-card');
      const kicker = document.querySelector('.focus-stage-kicker');

      const rectOf = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return null;
        if (r.width === 0 && r.height === 0) return null;
        return { top: r.top, bottom: r.bottom, height: r.height };
      };

      return {
        journey: rectOf(journey),
        diveBtn: rectOf(diveBtn),
        card: rectOf(card),
        kicker: rectOf(kicker),
        viewportHeight: innerHeight,
        panelSurface: document.body?.dataset?.panelSurface,
      };
    });

    // Assertions
    const { journey, diveBtn, card, kicker, viewportHeight } = bounds;

    if (journey && diveBtn) {
      // Journey bottom must not intrude into dive button top
      expect(journey.bottom, 'journey bottom should not overlap dive button top').toBeLessThanOrEqual(diveBtn.top);
      // Journey top should not clip above card top
      if (card) {
        expect(journey.top, 'journey top should not clip above card top').toBeGreaterThanOrEqual(card.top - 2);
      }
    }

    if (kicker && card) {
      // Selected-match kicker should not be clipped at card top (top padding must accommodate it)
      expect(kicker.top, 'kicker top should be at or below card top').toBeGreaterThanOrEqual(card.top - 2);
    }

    if (diveBtn && card) {
      // Dive button must stay within card bounds (with safe-area tolerance of 8px)
      expect(diveBtn.bottom, 'dive-btn bottom should be within card bottom + 8px tolerance').toBeLessThanOrEqual(card.bottom + 8);
    }
  });

  // Defect 2: Short-landscape compass clipping (844x390)
  test('short-landscape-compass-no-clip - journey-compass stays within viewport at 844x390', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() =>
      Boolean(window.state?.points?.length && window.state?.renderer),
    { timeout: 30000 });

    await page.evaluate(() => {
      document.body.classList.add('is-active');
      document.body.dataset.activeView = 'galaxy';
    });
    await page.waitForTimeout(1500);

    const compassState = await page.evaluate(() => ({
      activeView: document.body.dataset.activeView,
      panelSurface: document.body.dataset.panelSurface || '',
    }));
    expect(compassState.activeView, 'short-landscape contract must exercise real galaxy view ownership').toBe('galaxy');

    const compass = await probeRect(page, '.journey-compass');
    expect(compass, 'journey compass should stay visible in short-landscape galaxy view').not.toBeNull();

    // Compass should be within viewport bounds if visible
    expect(compass.top, 'compass top should be >= 0').toBeGreaterThanOrEqual(-1);
    expect(compass.left, 'compass left should be >= 0').toBeGreaterThanOrEqual(-1);
    expect(compass.right, 'compass right should be <= viewport width').toBeLessThanOrEqual(844);
    expect(compass.bottom, 'compass bottom should be <= viewport height').toBeLessThanOrEqual(390);
    expect(compass.height, 'compass should be compact in short landscape').toBeLessThanOrEqual(72);
    const overflowRight = Math.max(0, compass.right - 844);
    const overflowBottom = Math.max(0, compass.bottom - 390);
    expect(overflowRight, 'compass should not overflow right edge').toBe(0);
    expect(overflowBottom, 'compass should not overflow bottom edge').toBe(0);
  });

  // Defect 3: Low-contrast threads
  test('thread-contrast-adequate - WebGL thread lines have sufficient opacity at common viewports', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() =>
      Boolean(window.state?.renderer && window.state?.pointsMesh),
    { timeout: 30000 });

    await page.evaluate(() => {
      document.body.dataset.activeView = 'galaxy';
      if (typeof window.focusOnNode === 'function') {
        window.focusOnNode(4200, { fromSearchResult: true });
      }
    });
    await page.waitForFunction(() => window.state?.focusedNode !== null && window.state?.focusedNode !== undefined, { timeout: 15000 });
    await page.waitForTimeout(1800);

    const threadState = await page.evaluate(() => {
      const state = window.state || {};
      const readLine = (line) => ({
        count: line?.geometry?.attributes?.position?.count || 0,
        opacity: Number(line?.material?.opacity ?? 0),
        visible: line?.visible !== false,
      });
      return {
        core: readLine(state.myceliumCoreLines),
        wispy: readLine(state.myceliumWispyLines),
        bridge: readLine(state.myceliumBridgeLines),
        graphicsMode: document.body.dataset.graphicsMode,
      };
    });

    expect(threadState.graphicsMode, 'scene should run in WebGL mode for thread contract').toBe('webgl');
    expect(threadState.core.count, 'core thread geometry should be populated').toBeGreaterThan(0);
    expect(threadState.core.opacity, 'core thread opacity should be legible').toBeGreaterThanOrEqual(0.24);
    expect(threadState.core.opacity, 'core thread opacity should not flood the scene').toBeLessThanOrEqual(0.55);
    if (threadState.wispy.count > 0) {
      expect(threadState.wispy.opacity, 'wispy thread opacity should be legible when rendered').toBeGreaterThanOrEqual(0.10);
    }
    if (threadState.bridge.count > 0) {
      expect(threadState.bridge.opacity, 'bridge thread opacity should be legible when rendered').toBeGreaterThanOrEqual(0.15);
    }
  });

  // Defect 4: Visible STATIC DEV MODE indicator
  test('no-static-dev-mode-indicator - no dev-mode badge visible in production UI', async ({ page }) => {
    test.setTimeout(30000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => Boolean(window.state?.renderer), { timeout: 20000 });
    await page.waitForTimeout(1000);

    // Search entire DOM tree for any element containing "STATIC DEV MODE" text
    const devModeElements = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      const found = [];
      for (const el of all) {
        if (el.children.length > 0) continue; // Only leaf nodes
        const text = el.textContent || '';
        if (text.includes('STATIC DEV MODE') || text.includes('Static Dev Mode') || text.includes('static dev mode')) {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          found.push({
            tag: el.tagName,
            class: el.className,
            id: el.id,
            text: text.trim().slice(0, 80),
            visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          });
        }
      }
      return found;
    });

    const visibleDevMode = devModeElements.filter(e => e.visible);
    expect(visibleDevMode, 'no visible STATIC DEV MODE indicator should be present in UI').toHaveLength(0);

    // Also check for any indicator badge with class/id suggesting dev mode
    const devIndicatorSelectors = [
      '#dev-mode-indicator',
      '.dev-mode-indicator',
      '#static-dev-indicator',
      '.static-dev-indicator',
      '[class*="dev-mode"]',
      '[class*="static-dev"]',
      '[id*="dev-mode"]',
      '[id*="static-dev"]',
    ];

    for (const sel of devIndicatorSelectors) {
      const el = await page.$(sel);
      if (el) {
        const isVisible = await el.isVisible().catch(() => false);
        expect(isVisible, `dev-mode indicator element (${sel}) should not be visible`).toBe(false);
      }
    }
  });

  // Defect 5: Short-landscape thread overlay no overflow at 844x390
  test('short-landscape-thread-overlay-no-overflow - thread overlay stays within viewport at 844x390', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() =>
      Boolean(window.state?.renderer && window.state?.points?.length),
    { timeout: 30000 });

    await page.evaluate(() => {
      document.body.classList.add('is-active');
      document.body.dataset.activeView = 'galaxy';
    });
    await page.waitForTimeout(1500);

    const overflowResults = await page.evaluate(() => {
      const selectors = [
        '.thread-canvas-overlay',
        '.trail-thread-overlay',
        '.thread-overlay',
        '#thread-canvas',
        '.thread-line',
        '.trail-line',
        '.neighbor-thread',
      ];
      const issues = [];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const overflowRight = Math.max(0, rect.right - innerWidth);
          const overflowBottom = Math.max(0, rect.bottom - innerHeight);
          if (overflowRight > 0 || overflowBottom > 0) {
            issues.push({ selector: sel, overflowRight, overflowBottom, rect: { w: rect.width, h: rect.height } });
          }
        }
      }
      return issues;
    });

    expect(overflowResults, 'thread overlay elements should not overflow viewport at 844x390').toHaveLength(0);
  });
});
