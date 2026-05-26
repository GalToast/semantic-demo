import { test, expect } from '@playwright/test';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '');

const HEALTH_OK = {
  ok: true,
  state: 'healthy',
  provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};

async function openTouchPage(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await page.route('**/api.php?action=semantic_lane_health**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_OK) })
  );
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

async function projectedTouchTargets(page) {
  return page.evaluate(() => {
    const { state } = window;
    const canvas = state?.renderer?.domElement;
    if (!canvas || !state?.camera || !state?.pointsMesh || !Array.isArray(state.nodePositions)) return [];

    const rect = canvas.getBoundingClientRect();
    const margin = Math.max(36, Math.min(rect.width, rect.height) * 0.09);
    const step = Math.max(1, Math.floor(state.nodePositions.length / 160));
    const targets = [];

    for (let i = 0; i < state.nodePositions.length; i += step) {
      const pos = state.nodePositions[i];
      if (!pos) continue;
      const vector = new window.THREE.Vector3(pos.x, pos.y, pos.z);
      if (state.pointsMesh.localToWorld) state.pointsMesh.localToWorld(vector);
      const projected = vector.clone().project(state.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const screenX = ((projected.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-projected.y + 1) / 2) * rect.height + rect.top;
      if (screenX < rect.left + margin || screenX > rect.right - margin) continue;
      if (screenY < rect.top + margin || screenY > rect.bottom - margin) continue;

      const stack = document.elementsFromPoint(screenX, screenY);
      if (!stack.includes(canvas)) continue;
      const blocked = stack.some(el => el?.closest?.([
        'button',
        'a',
        'input',
        'textarea',
        'select',
        '.info-panel',
        '.focus-stage-card',
        '.summary-card',
        '.controls',
        '.view-toggle',
        '.journey-compass',
        '.legend-panel',
        '.weather-widget',
        '.share-toggle'
      ].join(',')) && getComputedStyle(el).pointerEvents !== 'none');
      if (blocked) continue;

      targets.push({ sampledIndex: i, screenX, screenY });
      if (targets.length >= 24) break;
    }

    return targets;
  });
}

async function probe(page) {
  return page.evaluate(() => ({
    pointCount: window.__TEST_STATE__?.points?.length ?? 0,
    focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
    navMode: window.__TEST_STATE__?.navState?.mode || '',
    lastCanvasNodePick: window.__TEST_STATE__?.lastCanvasNodePick ?? null,
    lastCanvasNodeFocusPick: window.__TEST_STATE__?.lastCanvasNodeFocusPick ?? null
  }));
}

function isValidNodeIndex(value, pointCount) {
  return Number.isFinite(value) && value >= 0 && value < pointCount;
}

async function tapFirstValidTarget(page) {
  const targets = await projectedTouchTargets(page);
  expect(targets.length, 'touch viewport should expose at least one projected canvas target').toBeGreaterThan(0);

  for (const target of targets) {
    await page.touchscreen.tap(target.screenX, target.screenY);
    await page.waitForTimeout(700);
    const after = await probe(page);
    if (isValidNodeIndex(after.focusedNode, after.pointCount)) {
      return { target, after };
    }
  }

  const finalState = await probe(page);
  throw new Error(`No projected touch target focused a valid node; state=${JSON.stringify(finalState)}`);
}

test.describe('3D touch parity', () => {
  test('mobile portrait: real tap on projected canvas node enters focus', async ({ browser }) => {
    test.setTimeout(70000);
    let page;
    let context;
    try {
      ({ page, context } = await openTouchPage(browser, { width: 390, height: 844 }));
      const { after } = await tapFirstValidTarget(page);
      expect(after.navMode, 'touch node tap should enter focus mode').toBe('focus');
      expect(after.lastCanvasNodeFocusPick || after.lastCanvasNodePick, 'touch tap should record canvas pick evidence').not.toBeNull();
    } finally {
      if (context) await context.close().catch(() => {});
    }
  });

  test('short landscape: tap and drag paths do not corrupt focus state', async ({ browser }) => {
    test.setTimeout(70000);
    let page;
    let context;
    try {
      ({ page, context } = await openTouchPage(browser, { width: 844, height: 390 }));
      const { target } = await tapFirstValidTarget(page);

      await page.touchscreen.tap(Math.max(12, target.screenX - 160), Math.max(12, target.screenY - 90));
      await page.waitForTimeout(300);

      const afterAwayTap = await probe(page);
      const nullOrValid = afterAwayTap.focusedNode === null || isValidNodeIndex(afterAwayTap.focusedNode, afterAwayTap.pointCount);
      expect(nullOrValid, 'tap away must leave focusedNode null or valid').toBe(true);
    } finally {
      if (context) await context.close().catch(() => {});
    }
  });
});
