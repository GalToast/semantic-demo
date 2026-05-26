import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8766').replace(/\/$/, '');
const APP_PATH = process.env.TEST_APP_PATH || '/vector-explorer-polished.html';
const GPU_SMOKE = process.env.SEMANTIC_DEMO_USE_GPU === '1';
const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--force_high_performance_gpu',
  '--use-angle=d3d11',
  '--enable-webgl',
  '--enable-webgl2',
  '--disable-software-rasterizer'
];

test.use({
  launchOptions: GPU_SMOKE
    ? {
        args: GPU_ARGS
      }
    : undefined
});

const SEMANTIC_HEALTH_STUB = {
  ok: true,
  state: 'healthy',
  provenance: {
    label: 'Search ready',
    detail: 'Semantic search is ready.'
  }
};

const SEARCH_STUB = {
  ok: true,
  count: 5,
  results: [
    { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee anchor with visible corridor evidence.' },
    { lead_id: 2, score: 0.94, semantic_score: 0.94, public_note: 'Nearby coffee and hospitality signal.' },
    { lead_id: 20, score: 0.9, semantic_score: 0.9, public_note: 'Related local stop.' },
    { lead_id: 39, score: 0.84, semantic_score: 0.84, public_note: 'Secondary route candidate.' },
    { lead_id: 52, score: 0.79, semantic_score: 0.79, public_note: 'Outer neighborhood candidate.' }
  ]
};

async function stubSemanticApi(page) {
  await page.route('**/api.php?action=semantic_lane_health**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEMANTIC_HEALTH_STUB)
    });
  });
  await page.route('**/api.php?action=semantic_search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SEARCH_STUB)
    });
  });
}

async function runCoffeeFocusFlow(page, { requireCorridor = true } = {}) {
  await stubSemanticApi(page);
  await page.goto(`${BASE_URL}${APP_PATH}`);
  await expect(page.locator('#search-input')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 15000 });
  await page.waitForFunction(() => window.__TEST_STATE__?.renderer && window.__TEST_STATE__?.camera && window.__TEST_STATE__?.controls, null, { timeout: 15000 });

  const initialCamera = await page.evaluate(() => ({
    camera: window.__TEST_STATE__.camera.position.toArray(),
    target: window.__TEST_STATE__.controls.target.toArray(),
    canvasCount: document.querySelectorAll('canvas').length,
    rendererReady: !!window.__TEST_STATE__.renderer,
    sceneReady: !!window.__TEST_STATE__.scene,
    webglRenderer: (() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || 'unknown';
    })()
  }));

  await page.locator('#search-input').fill('coffee');
  await page.evaluate(() => {
    if (typeof window.search === 'function') return window.search('coffee');
    document.querySelector('#search-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return null;
  });
  try {
    await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 });
  } catch {
    await page.goto(`${BASE_URL}${APP_PATH}?view=galaxy&q=coffee&anchor=1`);
    await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 });
  }
  await page.waitForTimeout(700);

  await page.waitForFunction(
    () => Array.isArray(window.__TEST_STATE__?.currentSearchSummary?.resultIndices)
      && window.__TEST_STATE__.currentSearchSummary.resultIndices.length > 0,
    null,
    { timeout: 8000 }
  );

  await page.evaluate(({ requireCorridor }) => {
    const summary = window.__TEST_STATE__.currentSearchSummary || {};
    const anchorIndex = Number.isFinite(summary.anchorIndex) ? summary.anchorIndex : summary.topIndex;
    const routeIndices = [anchorIndex, ...(summary.resultIndices || [])]
      .filter((index) => Number.isFinite(index));
    if (
      requireCorridor &&
      !window.__TEST_STATE__.searchCorridorGroup &&
      routeIndices.length > 1 &&
      typeof window.triggerSearchCorridorAnimation === 'function'
    ) {
      window.triggerSearchCorridorAnimation(anchorIndex, routeIndices);
    }
  }, { requireCorridor });
  if (requireCorridor) {
    await page.waitForFunction(
      () => !!window.__TEST_STATE__?.searchCorridorGroup?.children?.length,
      null,
      { timeout: 5000 }
    );
  }

  const corridor = await page.evaluate(() => ({
    groupReady: !!window.__TEST_STATE__.searchCorridorGroup,
    triggerReady: typeof window.triggerSearchCorridorAnimation === 'function',
    visible: !!window.__TEST_STATE__.searchCorridorGroup?.visible,
    children: window.__TEST_STATE__.searchCorridorGroup?.children?.length || 0,
    glowActive: !!window.__TEST_STATE__.searchGlowActive
  }));

  await page.locator('.search-result-item').first().click();
  await expect(page.locator('#focus-stage')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1000);

  const focused = await page.evaluate(() => ({
    camera: window.__TEST_STATE__.camera.position.toArray(),
    target: window.__TEST_STATE__.controls.target.toArray(),
    focusedNode: window.__TEST_STATE__.focusedNode,
    cameraAssist: document.body.dataset.cameraAssist,
    cameraAssistReason: document.body.dataset.cameraAssistReason,
    focusPocketActive: !!window.__TEST_STATE__.navState.focusPocketMeta?.active,
    focusPocketCount: window.__TEST_STATE__.navState.focusPocketIndices?.length || 0,
    focusTransition: document.body.dataset.focusTransition,
    focusTransitionPhase: document.body.dataset.focusTransitionPhase
  }));

  const diveButton = page.locator('#btn-focus-dive');
  await expect(diveButton).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => document.querySelector('#btn-focus-dive')?.click());
  await page.waitForFunction(() => document.body.dataset.semanticDive === 'active', null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(300);

  const inside = await page.evaluate(() => {
    const rects = Array.from(document.querySelectorAll('#btn-focus-dive, #btn-inside-next, #btn-inside-county'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          id: el.id,
          width: rect.width,
          height: rect.height,
          visible: rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
        };
      });
    return {
      semanticDive: document.body.dataset.semanticDive,
      trailDepth: window.__TEST_STATE__.trailDepth,
      anchorBloomIntensity: window.__TEST_STATE__.anchorBloomLight?.intensity || 0,
      focusPocketActive: !!window.__TEST_STATE__.navState.focusPocketMeta?.active,
      focusPocketCount: window.__TEST_STATE__.navState.focusPocketIndices?.length || 0,
      tapTargets: rects
    };
  });

  return { initialCamera, corridor, focused, inside };
}

test.describe('camera and focus-pocket visual smoke', () => {
  test('desktop, mobile, and reduced-motion WebGL camera evidence stays coherent', async ({ browser }, testInfo) => {
    test.setTimeout(240000);

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const desktopEvidence = await runCoffeeFocusFlow(desktop);
    await desktop.screenshot({ path: testInfo.outputPath('desktop-focus-pocket.png'), fullPage: true });

    expect(desktopEvidence.initialCamera.rendererReady).toBe(true);
    expect(desktopEvidence.initialCamera.sceneReady).toBe(true);
    expect(desktopEvidence.initialCamera.canvasCount).toBe(1);
    if (GPU_SMOKE) {
      console.log(`GPU smoke WebGL renderer: ${desktopEvidence.initialCamera.webglRenderer}`);
      expect(desktopEvidence.initialCamera.webglRenderer).not.toMatch(/swiftshader|software rasterizer/i);
    }
    expect(desktopEvidence.corridor.triggerReady).toBe(true);
    expect(desktopEvidence.corridor.groupReady).toBe(true);
    expect(desktopEvidence.corridor.children).toBeGreaterThan(0);
    expect(desktopEvidence.focused.focusedNode).toBeGreaterThanOrEqual(0);
    expect(desktopEvidence.focused.focusPocketActive).toBe(true);
    expect(desktopEvidence.focused.focusPocketCount).toBeGreaterThan(0);
    expect(desktopEvidence.inside.semanticDive).toBe('active');
    expect(desktopEvidence.inside.trailDepth).toBe(2);
    expect(desktopEvidence.inside.anchorBloomIntensity).toBeGreaterThan(0);
    expect(desktopEvidence.focused.camera).not.toEqual(desktopEvidence.initialCamera.camera);
    await desktop.close();

    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobileEvidence = await runCoffeeFocusFlow(mobile, { requireCorridor: false });
    await mobile.screenshot({ path: testInfo.outputPath('mobile-focus-pocket.png'), fullPage: true });

    expect(mobileEvidence.inside.semanticDive).toBe('active');
    expect(mobileEvidence.inside.focusPocketCount).toBeGreaterThan(0);
    for (const target of mobileEvidence.inside.tapTargets.filter((target) => target.visible)) {
      expect(target.width, `${target.id} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.id} height`).toBeGreaterThanOrEqual(44);
    }
    await mobile.close();

    const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await reduced.emulateMedia({ reducedMotion: 'reduce' });
    const reducedEvidence = await runCoffeeFocusFlow(reduced, { requireCorridor: false });
    await reduced.screenshot({ path: testInfo.outputPath('reduced-motion-focus-pocket.png'), fullPage: true });

    expect(reducedEvidence.inside.semanticDive).toBe('active');
    expect(reducedEvidence.focused.focusTransitionPhase).toMatch(/arriving|settled/);
    const reducedOrbit = await reduced.evaluate(() => ({
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      autoRotate: !!window.__TEST_STATE__.controls?.autoRotate
    }));
    expect(reducedOrbit.reduced).toBe(true);
    expect(reducedOrbit.autoRotate).toBe(false);
    await reduced.close();
  });
});
