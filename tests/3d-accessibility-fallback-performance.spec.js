import { test, expect } from '@playwright/test';
import { BASE_URL, setupMockSearch, openApp } from './helpers/3d-interaction-helpers.js';

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
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    typeof window.focusOnNode === 'function' &&
    Array.isArray(window.state?.points) &&
    window.state.points.length > 0 &&
    window.state?.renderer?.domElement &&
    window.state?.camera &&
    window.state?.pointsMesh
  ), { timeout: 25000 });
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, { timeout: 20000 });
  await page.waitForTimeout(900);
}

async function openReadyApp(page, viewport = { width: 1440, height: 900 }) {
  await setupNetworkStubs(page);
  await page.setViewportSize(viewport);
  await waitForAppReady(page);
}

async function probe(page) {
  return page.evaluate(() => {
    const { state } = window;
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

    const targetIdx = await page.evaluate(() => {
      const idx = Math.floor((window.state?.points?.length ?? 0) / 2);
      if (idx >= 0 && typeof window.focusOnNode === 'function') window.focusOnNode(idx);
      return idx;
    });
    expect(targetIdx, 'scene should expose at least one focus target').toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(1200);

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
    await page.waitForTimeout(500);
    const lost = await page.evaluate(() => ({
      marker: document.body.dataset.webglContextLost || '',
      rendererGone: window.state?.renderer === null
    }));
    expect(lost.marker, 'context loss should be observable on body dataset').toBe('lost');
    expect(lost.rendererGone, 'context loss must not null out renderer state').toBe(false);

    await page.evaluate(() => window.__webglLoseContextExt.restoreContext());
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({
      marker: document.body.dataset.webglContextLost || '',
      hasRenderer: !!window.state?.renderer,
      hasScene: !!window.state?.scene,
      pointCount: window.state?.points?.length ?? 0
    }));
    expect(after.marker, 'context restore should be observable on body dataset').toBe('restored');
    expect(after.hasRenderer, 'renderer must survive context restore').toBe(true);
    expect(after.hasScene, 'scene must survive context restore').toBe(true);
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

  test('performance contract: renderer diagnostics are finite and stable through repeated focus', async ({ page }) => {
    test.setTimeout(90000);
    await openReadyApp(page);
    await page.waitForTimeout(1500);

    const before = await probe(page);
    expect(before.rendererMemory, 'renderer.info.memory should be exposed').not.toBeNull();
    expect(before.rendererMemory.geometries, 'scene should have renderer geometries').toBeGreaterThan(0);
    expect(before.frameDiag, 'focusFrameDiagnostics should be present').not.toBeNull();
    expect(Number.isFinite(before.frameDiag.avgFrameMs), 'avgFrameMs must be finite').toBe(true);
    expect(before.frameDiag.avgFrameMs, 'avg frame time should stay above a severe-freeze floor').toBeLessThan(500);

    const pointCount = before.pointCount;
    for (let i = 0; i < 3; i += 1) {
      const idx = Math.floor((pointCount * (i + 1)) / 4);
      await page.evaluate(targetIdx => window.focusOnNode?.(targetIdx), idx);
      await page.waitForTimeout(500);
    }

    const after = await probe(page);
    expect(after.hasRenderer, 'renderer must survive repeated focus operations').toBe(true);
    expect(after.hasPointsMesh, 'points mesh must survive repeated focus operations').toBe(true);
    expect(after.rendererMemory.geometries, 'focus operations should not leak many geometries').toBeLessThanOrEqual(before.rendererMemory.geometries + 5);
  });
});
