import { test, expect } from '@playwright/test';
import { BASE_URL, focusNodeViaApp, midpointIndex } from './helpers/3d-interaction-helpers.js';
import { focusOnNode } from '@lib/orchestration/lifecycle'
import { clearSearch } from '@lib/stores/navigation.svelte'

const HEALTH_OK = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};

const SEARCH_STUB = {
  ok: true,
  count: 3,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
    { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
    { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
  ]
};

async function setupNetworkStubs(page) {
  await page.route('**/api.php?action=semantic_lane_health**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_OK) })
  );
  await page.route('**/api.php?action=semantic_search**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
  );
}

async function waitForAppReady(page) {
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return (
      typeof clearSearch === 'function' &&
      typeof (focusOnNode) === 'function' &&
      Array.isArray(s?.points) &&
      s.points.length > 0 &&
      s?.renderer?.domElement &&
      s?.camera &&
      s?.pointsMesh
    );
  }, { timeout: 25000 });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 20000 });
  // preceding waitForFunction handles settlement
}

async function openReadyApp(page, viewport = { width: 1440, height: 900 }) {
  await setupNetworkStubs(page);
  await page.setViewportSize(viewport);
  await waitForAppReady(page);
}

async function probe(page) {
  return page.evaluate(() => {
    const state = window.__TEST_STATE__ ?? window.__APP_STATE__ ?? window.state ?? {};
    return {
      hasRenderer: !!state?.renderer,
      hasScene: !!state?.scene,
      hasCamera: !!state?.camera,
      hasPointsMesh: !!state?.pointsMesh,
      pointCount: state?.points?.length ?? 0,
      rendererMemory: state?.renderer?.info?.memory ?? null,
      frameDiag: state?.focusFrameDiagnostics ?? null,
      focusedNode: state?.focusedNode ?? null,
      navMode: state?.navState?.mode || '',
      focusStage: (() => {
        const card = document.querySelector('.focus-stage-card') || document.getElementById('focus-stage');
        if (!card) return null;
        const styles = getComputedStyle(card);
        return {
          display: styles.display,
          visibility: styles.visibility,
          pointerEvents: styles.pointerEvents,
          ariaHidden: card.getAttribute('aria-hidden')
        };
      })()
    };
  });
}

test.describe('3D accessibility, fallback, and performance contracts', () => {
  test('keyboard contract: canvas stays out of tab order and focused controls expose a visible ring', async ({ page }) => {
    test.setTimeout(60000);
    await openReadyApp(page);

    const keyboardSurface = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const focusable = Array.from(document.querySelectorAll([
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(',')));
      const canvasInOrder = !!canvas && focusable.includes(canvas);
      const canvasTabIndex = canvas?.getAttribute('tabindex') ?? null;
      const search = document.getElementById('search-input');
      search?.focus();
      const styles = search ? getComputedStyle(search) : null;
      return {
        canvasInOrder,
        canvasTabIndex,
        activeId: document.activeElement?.id || '',
        outline: styles?.outline || '',
        outlineWidth: styles?.outlineWidth || '',
        boxShadow: styles?.boxShadow || ''
      };
    });

    expect(keyboardSurface.canvasInOrder, 'canvas must not be reachable through normal tab order').toBe(false);
    expect(keyboardSurface.canvasTabIndex, 'canvas tabindex must be absent or explicitly non-tabbable').not.toBe('0');
    expect(keyboardSurface.activeId, 'search input should accept keyboard focus').toBe('search-input');
    const hasVisibleFocus =
      parseFloat(keyboardSurface.outlineWidth) > 0 ||
      keyboardSurface.boxShadow !== 'none' ||
      (keyboardSurface.outline && keyboardSurface.outline !== 'none');
    expect(hasVisibleFocus, `focused search input should expose focus styling: ${JSON.stringify(keyboardSurface)}`).toBe(true);
  });

  test('reduced-motion contract: focus final state and focus-stage visibility still resolve', async ({ page }) => {
    test.setTimeout(60000);
    await setupNetworkStubs(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForAppReady(page);

    const targetIdx = await midpointIndex(page);
    expect(targetIdx, 'scene should expose at least one focus target').toBeGreaterThanOrEqual(0);
    if (targetIdx >= 0) await focusNodeViaApp(page, targetIdx);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    const state = await probe(page);
    expect(state.pointCount, 'scene must still have points under reduced motion').toBeGreaterThan(0);
    expect(state.navMode, 'reduced motion should still reach focus/trail state').toMatch(/^(focus|trail)$/);
    expect(state.focusedNode, 'reduced motion should set focusedNode').not.toBeNull();
    expect(state.focusStage, 'focus stage should exist after focus').not.toBeNull();
    expect(state.focusStage.display, 'focus stage should not be display:none').not.toBe('none');
    expect(state.focusStage.visibility, 'focus stage should not be hidden').not.toBe('hidden');
    expect(state.focusStage.ariaHidden, 'focus stage should not be aria-hidden').not.toBe('true');
  });

  test('webgl context-loss contract: renderer and point data survive loss and restore', async ({ page }) => {
    test.setTimeout(60000);
    await openReadyApp(page);

    const before = await probe(page);
    expect(before.hasRenderer, 'renderer must exist before context-loss test').toBe(true);
    expect(before.pointCount, 'point data must be loaded before context-loss test').toBeGreaterThan(0);

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_lose_context') || null;
      if (!canvas || !ext) {
        window.__webglLoseContextExt = null;
        return;
      }
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        document.body.dataset.webglContextLost = 'lost';
      }, { passive: false });
      canvas.addEventListener('webglcontextrestored', () => {
        document.body.dataset.webglContextLost = 'restored';
      }, { passive: false });
      window.__webglLoseContextExt = ext;
    });

    const extAvailable = await page.evaluate(() => !!window.__webglLoseContextExt);
    if (!extAvailable) {
      test.skip('WEBGL_lose_context extension is not available in this browser context');
      return;
    }

    await page.evaluate(() => window.__webglLoseContextExt.loseContext());
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
    const lost = await page.evaluate(() => ({
      marker: document.body.dataset.webglContextLost || '',
      rendererGone: (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).renderer === null
    }));
    expect(lost.marker, 'context loss should be observable on body dataset').toBe('lost');
    expect(lost.rendererGone, 'context loss must not null out renderer state').toBe(false);

    await page.evaluate(() => window.__webglLoseContextExt.restoreContext());
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});
    const after = await page.evaluate(() => ({
      marker: document.body.dataset.webglContextLost || '',
      pointCount: (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points?.length ?? 0
    }));
    const after2 = await probe(page);
    expect(after.marker, 'context restore should be observable on body dataset').toBe('restored');
    expect(after2.hasRenderer, 'renderer must survive context restore').toBe(true);
    expect(after2.hasScene, 'scene must survive context restore').toBe(true);
    expect(after.pointCount, 'point data must survive context restore').toBe(before.pointCount);
  });

  test('webgl unavailable contract: loading resolves to fallback/error or completes, not an endless spinner', async ({ page }) => {
    test.setTimeout(45000);
    await setupNetworkStubs(page);
    await page.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
        if (type === 'webgl' || type === 'webgl2') return null;
        return originalGetContext.call(this, type, ...args);
      };
    });

    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
    const state = await page.waitForFunction(() => {
      const overlay = document.getElementById('loading-overlay');
      const text = overlay?.textContent || '';
      const hasError = /Graph unavailable|Failed to load|WebGL|error/i.test(text);
      const loadingGone = !overlay ||
        overlay.classList.contains('hidden') ||
        getComputedStyle(overlay).display === 'none' ||
        getComputedStyle(overlay).visibility === 'hidden';
      return hasError || loadingGone ? { hasError, loadingGone, text } : false;
    }, { timeout: 20000 }).then(handle => handle.jsonValue());

    expect(state.hasError || state.loadingGone, `WebGL-unavailable state must resolve: ${JSON.stringify(state)}`).toBe(true);
  });

  test('a11y region landmark: semantic overlay layer has a region landmark inside main', async ({ page }) => {
    test.setTimeout(60000);
    await openReadyApp(page);

    // Verify the region landmark wrapper exists around the semantic overlay
    const regionExists = await page.evaluate(() => {
      const main = document.getElementById('main-content');
      if (!main) return { found: false, reason: 'no main element' };
      const region = main.querySelector('section[aria-label="Semantic overlay layer"]');
      if (!region) return { found: false, reason: 'no section[aria-label="Semantic overlay layer"]' };
      // Verify it's inside main and has the correct ARIA attributes
      const isInsideMain = main.contains(region);
      const ariaLabel = region.getAttribute('aria-label');
      return {
        found: true,
        isInsideMain,
        ariaLabel,
        tagName: region.tagName
      };
    });

    expect(regionExists.found, 'section[aria-label="Semantic overlay layer"] must exist in main').toBe(true);
    expect(regionExists.isInsideMain, 'region landmark must be inside <main>').toBe(true);
    expect(regionExists.ariaLabel, 'region landmark must have aria-label').toBe('Semantic overlay layer');
  });

  test('a11y color contrast: focus pocket secondary text meets WCAG AA 4.5:1', async ({ page }) => {
    test.setTimeout(60000);
    await openReadyApp(page);

    // Focus on a node to trigger the focus pocket
    const targetIdx = await midpointIndex(page);
    expect(targetIdx, 'scene should expose at least one focus target').toBeGreaterThanOrEqual(0);
    if (targetIdx >= 0) await focusNodeViaApp(page, targetIdx);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    // Check the computed color of secondary text elements in the focus pocket
    const contrastCheck = await page.evaluate(() => {
      // Helper to parse rgba(r, g, b, a) and compute contrast ratio
      function parseRgba(color) {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;
        return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
      }

      function relativeLuminance(r, g, b) {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function contrastRatio(rgb1, rgb2) {
        const l1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
        const l2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      // Get the focus card secondary text elements
      const focusCard = document.querySelector('.focus-card.selected-card');
      if (!focusCard) return { found: false, reason: 'focus card not visible' };

      // Check .selected-card-location and .selected-card-contact
      const locationEl = focusCard.querySelector('.selected-card-location');
      const contactEl = focusCard.querySelector('.selected-card-contact');
      const footerClusterEl = focusCard.querySelector('.footer-cluster');

      // Background of focus card
      const bg = { r: 7, g: 16, b: 24 }; // rgba(7, 16, 24, 0.92) background

      const results = [];

      if (locationEl) {
        const color = getComputedStyle(locationEl).color;
        const rgb = parseRgba(color);
        if (rgb) {
          const ratio = contrastRatio(rgb, bg);
          results.push({ element: 'selected-card-location', color, ratio, rgb });
        }
      }

      if (contactEl) {
        const color = getComputedStyle(contactEl).color;
        const rgb = parseRgba(color);
        if (rgb) {
          const ratio = contrastRatio(rgb, bg);
          results.push({ element: 'selected-card-contact', color, ratio, rgb });
        }
      }

      if (footerClusterEl) {
        const color = getComputedStyle(footerClusterEl).color;
        const rgb = parseRgba(color);
        if (rgb) {
          const ratio = contrastRatio(rgb, bg);
          results.push({ element: 'footer-cluster', color, ratio, rgb });
        }
      }

      return { found: true, results };
    });

    expect(contrastCheck.found, 'focus card should be visible after focusing a node').toBe(true);
    expect(contrastCheck.results.length, 'should find secondary text elements to check').toBeGreaterThan(0);

    // All secondary text must meet WCAG AA 4.5:1
    for (const result of contrastCheck.results) {
      expect(
        result.ratio,
        `${result.element} contrast ratio ${result.ratio.toFixed(2)}:1 must be >= 4.5:1 (color: ${result.color})`
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('performance contract: renderer diagnostics are finite and stable through repeated focus', async ({ page }) => {
    test.setTimeout(90000);
    await openReadyApp(page);
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

    const before = await probe(page);
    expect(before.rendererMemory, 'renderer.info.memory should be exposed').not.toBeNull();
    expect(before.rendererMemory.geometries, 'scene should have renderer geometries').toBeGreaterThan(0);
    expect(before.frameDiag, 'focusFrameDiagnostics should be present').not.toBeNull();
    expect(Number.isFinite(before.frameDiag.avgFrameMs), 'avgFrameMs must be finite').toBe(true);
    expect(before.frameDiag.avgFrameMs, 'avg frame time should stay above a severe-freeze floor').toBeLessThan(500);

    const pointCount = before.pointCount;
    for (let i = 0; i < 3; i += 1) {
      const idx = Math.floor((pointCount * (i + 1)) / 4);
      if (idx >= 0) await focusNodeViaApp(page, idx);
      await page.waitForFunction(() => {
      const ps = document.body?.dataset?.panelSurface;
      return ps && ps.includes('focus');
    }, { timeout: 8000 }).catch(() => {});
    }

    const after = await probe(page);
    expect(after.hasRenderer, 'renderer must survive repeated focus operations').toBe(true);
    expect(after.hasPointsMesh, 'points mesh must survive repeated focus operations').toBe(true);
    expect(after.rendererMemory.geometries, 'focus operations should not leak many geometries').toBeLessThanOrEqual(before.rendererMemory.geometries + 5);
  });
});
