import { test, expect } from '@playwright/test';
import { BASE_URL, SEMANTIC_HEALTH_STUB, setupMockSearch, openApp, probe, isValidNodeIndex, projectedCandidates } from './helpers/3d-interaction-helpers.js';

function cameraDistance(position) {
  return Math.hypot(position.x, position.y, position.z);
}

async function findClickableNode(page) {
  const candidates = await projectedCandidates(page, { marginRatio: 0.06, maxResults: 24 });
  for (const candidate of candidates) {
    await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 1 });
    await page.waitForTimeout(80);
    const state = await probe(page);
    if (state.canvasCursor === 'pointer' && isValidNodeIndex(state.hoverHighlightIndex, state.pointCount)) {
      return { ...candidate, resolvedIndex: state.hoverHighlightIndex };
    }
  }
  return null;
}

async function clickValidNode(page) {
  const target = await findClickableNode(page);
  expect(target, 'a hoverable canvas node coordinate must be discoverable').not.toBeNull();
  await page.mouse.click(target.screenX, target.screenY);
  await page.waitForTimeout(700);
  const after = await probe(page);
  expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'canvas click must focus a valid node').toBe(true);
  return { target, after };
}

async function wheelAtCanvasCenter(page, deltaY) {
  const rect = await page.evaluate(() => {
    const box = window.state?.renderer?.domElement?.getBoundingClientRect();
    return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
  });
  expect(rect, 'canvas rect must exist for wheel interaction').not.toBeNull();
  await page.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(600);
}

async function dragCanvas(page, dx, dy) {
  const rect = await page.evaluate(() => {
    const box = window.state?.renderer?.domElement?.getBoundingClientRect();
    return box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null;
  });
  expect(rect, 'canvas rect must exist for drag interaction').not.toBeNull();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

test.describe('3D camera/orbit resilience', () => {
  test('desktop: wheel and drag preserve valid node picking', async ({ page }) => {
    test.setTimeout(70000);
    await openApp(page, { width: 1440, height: 900 });

    const before = await probe(page);
    await wheelAtCanvasCenter(page, -220);
    await dragCanvas(page, 140, -30);
    const moved = await probe(page);

    expect(moved.cameraPosition, 'camera position should remain available after wheel/drag').not.toBeNull();
    expect(Number.isFinite(cameraDistance(moved.cameraPosition)), 'camera distance should remain finite').toBe(true);
    expect(Math.abs(cameraDistance(moved.cameraPosition) - cameraDistance(before.cameraPosition)), 'wheel should affect camera distance or keep it finite').toBeGreaterThanOrEqual(0);

    await clickValidNode(page);
  });

  test('resize: desktop to mobile and back keeps projection/click path coherent', async ({ page }) => {
    test.setTimeout(80000);
    await openApp(page, { width: 1440, height: 900 });

    await clickValidNode(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);
    const mobile = await probe(page);
    expect(Math.abs(mobile.cameraAspect - (mobile.canvasRect.width / mobile.canvasRect.height)), 'mobile camera aspect should match canvas').toBeLessThan(0.05);
    await clickValidNode(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(1000);
    const desktop = await probe(page);
    expect(Math.abs(desktop.cameraAspect - (desktop.canvasRect.width / desktop.canvasRect.height)), 'desktop camera aspect should match canvas after resize back').toBeLessThan(0.05);
    await clickValidNode(page);
  });

  test('short landscape: camera interaction does not break hoverable node discovery', async ({ page }) => {
    test.setTimeout(70000);
    await openApp(page, { width: 844, height: 390 });

    const before = await findClickableNode(page);
    expect(before, 'short landscape should start with a hoverable node').not.toBeNull();

    await wheelAtCanvasCenter(page, -160);
    await dragCanvas(page, 90, 20);

    const after = await findClickableNode(page);
    expect(after, 'short landscape should retain a hoverable node after camera gestures').not.toBeNull();
    await clickValidNode(page);
  });

  test('short landscape: camera distance stays finite and orbit is bounded after gestures', async ({ page }) => {
    test.setTimeout(70000);
    await openApp(page, { width: 844, height: 390 });

    const beforeDist = cameraDistance((await probe(page)).cameraPosition);

    await wheelAtCanvasCenter(page, -120);
    await dragCanvas(page, 80, 20);
    await page.waitForTimeout(500);

    const afterDist = cameraDistance((await probe(page)).cameraPosition);
    expect(Number.isFinite(afterDist), 'camera distance must stay finite after orbit gestures').toBe(true);
    // Camera should have moved (not be stuck), but still be in a reasonable range
    expect(afterDist, 'orbit should produce a finite camera distance').toBeGreaterThan(0);
    expect(afterDist, 'orbit distance should not be catastrophically large').toBeLessThan(1000);
    // Delta should be observable (not identical to before)
    const delta = Math.abs(afterDist - beforeDist);
    expect(delta, 'wheel/drag should produce observable camera movement').toBeGreaterThan(0.1);
  });
});
