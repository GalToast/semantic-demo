import { test, expect } from '@playwright/test';
import { BASE_URL, setupMockSearch } from './helpers/3d-interaction-helpers.js';

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

async function openPage(browser, { width, height, deviceScaleFactor = 1 }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor
  });
  const page = await context.newPage();

  await setupMockSearch(page);

  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    Array.isArray(window.__TEST_STATE__?.nodePositions) &&
    window.__TEST_STATE__.nodePositions.length > 0 &&
    window.__TEST_STATE__?.renderer?.domElement &&
    window.__TEST_STATE__?.camera &&
    window.__TEST_STATE__?.pointsMesh
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

  return { page, context };
}

async function probeViewport(page) {
  return page.evaluate(() => {
    const { state } = window;
    const canvas = state?.renderer?.domElement;
    const camera = state?.camera;
    if (!canvas || !camera) return { ok: false, reason: 'missing-renderer-or-camera' };

    const rect = canvas.getBoundingClientRect();
    const positions = Array.isArray(state.nodePositions) ? state.nodePositions : [];
    const step = Math.max(1, Math.floor(positions.length / 80));
    const projected = [];
    let finite = 0;
    let inside = 0;

    for (let i = 0; i < positions.length; i += step) {
      const pos = positions[i];
      if (!pos) continue;
      const vector = new window.THREE.Vector3(pos.x, pos.y, pos.z);
      if (state.pointsMesh?.localToWorld) state.pointsMesh.localToWorld(vector);
      const ndc = vector.clone().project(camera);
      if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z)) continue;

      finite += 1;
      const screenX = ((ndc.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-ndc.y + 1) / 2) * rect.height + rect.top;
      const inFront = ndc.z >= -1 && ndc.z <= 1;
      const inBounds = inFront &&
        screenX >= rect.left &&
        screenX <= rect.right &&
        screenY >= rect.top &&
        screenY <= rect.bottom;
      if (inBounds) inside += 1;
      projected.push({ screenX, screenY, inBounds });
    }

    const xs = projected.map(item => item.screenX).filter(Number.isFinite);
    const ys = projected.map(item => item.screenY).filter(Number.isFinite);

    return {
      ok: true,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      canvasCSS: { width: rect.width, height: rect.height },
      backing: { width: canvas.width, height: canvas.height },
      cameraAspect: camera.aspect,
      cameraFov: camera.fov,
      finite,
      inside,
      insideRatio: finite ? inside / finite : 0,
      spreadX: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      spreadY: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
      rendererMemory: state.renderer?.info?.memory || null
    };
  });
}

function assertViewportHealth(diag, label) {
  expect(diag.ok, `${label}: renderer/camera should be present, got ${diag.reason || 'ok'}`).toBe(true);
  expect(diag.canvasCSS.width, `${label}: canvas CSS width should be substantial`).toBeGreaterThan(200);
  expect(diag.canvasCSS.height, `${label}: canvas CSS height should be substantial`).toBeGreaterThan(260);
  expect(Math.abs(diag.cameraAspect - (diag.canvasCSS.width / diag.canvasCSS.height)), `${label}: camera aspect should match canvas`).toBeLessThan(0.04);
  expect(diag.backing.width, `${label}: backing width should not undershoot CSS width`).toBeGreaterThanOrEqual(Math.floor(diag.canvasCSS.width));
  expect(diag.backing.height, `${label}: backing height should not undershoot CSS height`).toBeGreaterThanOrEqual(Math.floor(diag.canvasCSS.height));
  expect(diag.finite, `${label}: should project a useful node sample`).toBeGreaterThan(12);
  expect(diag.insideRatio, `${label}: most sampled nodes should be in front/in-bounds; diag=${JSON.stringify(diag)}`).toBeGreaterThanOrEqual(0.65);
  expect(diag.spreadX, `${label}: projected X spread should not collapse`).toBeGreaterThan(80);
  expect(diag.spreadY, `${label}: projected Y spread should not collapse`).toBeGreaterThan(80);
}

test.describe('3D viewport and DPR resilience', () => {
  const cases = [
    { label: 'desktop DPR 1', width: 1440, height: 900, deviceScaleFactor: 1 },
    { label: 'desktop DPR 2', width: 1440, height: 900, deviceScaleFactor: 2 },
    { label: 'mobile portrait DPR 2', width: 390, height: 844, deviceScaleFactor: 2 },
    { label: 'short landscape DPR 2', width: 844, height: 390, deviceScaleFactor: 2 }
  ];

  for (const scenario of cases) {
    test(`${scenario.label}: canvas, camera, and projection stay coherent`, async ({ browser }) => {
      test.setTimeout(60000);
      let page;
      let context;
      try {
        ({ page, context } = await openPage(browser, scenario));
        const diag = await probeViewport(page);
        expect(Math.abs(diag.devicePixelRatio - scenario.deviceScaleFactor), `${scenario.label}: browser context DPR should match`).toBeLessThan(0.05);
        assertViewportHealth(diag, scenario.label);

        if (scenario.deviceScaleFactor > 1) {
          const minWidth = diag.canvasCSS.width * Math.min(1.5, scenario.deviceScaleFactor);
          const minHeight = diag.canvasCSS.height * Math.min(1.5, scenario.deviceScaleFactor);
          expect(diag.backing.width, `${scenario.label}: backing width should reflect high-DPI context`).toBeGreaterThanOrEqual(Math.floor(minWidth));
          expect(diag.backing.height, `${scenario.label}: backing height should reflect high-DPI context`).toBeGreaterThanOrEqual(Math.floor(minHeight));
        }
      } finally {
        if (context) await context.close().catch(() => {});
      }
    });
  }

  test('resize: camera aspect follows canvas after desktop-to-mobile resize', async ({ browser }) => {
    test.setTimeout(60000);
    let page;
    let context;
    try {
      ({ page, context } = await openPage(browser, { width: 1280, height: 820, deviceScaleFactor: 1 }));
      const before = await probeViewport(page);
      assertViewportHealth(before, 'before resize');

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(900);

      const after = await probeViewport(page);
      assertViewportHealth(after, 'after resize');
      expect(after.canvasCSS.width, 'canvas should follow resized viewport width').toBeLessThan(before.canvasCSS.width);
      expect(after.cameraAspect, 'camera aspect should change after resize').not.toBeCloseTo(before.cameraAspect, 2);
    } finally {
      if (context) await context.close().catch(() => {});
    }
  });
});
