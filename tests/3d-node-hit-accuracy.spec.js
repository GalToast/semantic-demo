import { test, expect } from '@playwright/test';
import { BASE_URL, setupMockSearch, openApp, probe, isValidNodeIndex, projectedCanvasCandidates } from './helpers/3d-interaction-helpers.js';

async function findClickableNode(page) {
  const candidates = await projectedCanvasCandidates(page);
  for (const candidate of candidates) {
    await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 4 });
    await page.waitForTimeout(150);
    const state = await probe(page);
    if (state.canvasCursor === 'pointer' && isValidNodeIndex(state.hoverHighlightIndex, state.pointCount)) {
      return {
        ...candidate,
        resolvedIndex: state.hoverHighlightIndex,
        stableCanvasHover: state.stableCanvasHover
      };
    }
  }
  return null;
}

async function clickResolvedNode(page) {
  const target = await findClickableNode(page);
  expect(target, 'a real hoverable canvas node coordinate must be discoverable before click').not.toBeNull();

  await page.mouse.click(target.screenX, target.screenY);
  await page.waitForTimeout(700);
  return { target, after: await probe(page) };
}

test.describe('3D canvas node hit accuracy', () => {
  test('desktop: clicking a real hoverable canvas node focuses a valid node', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const { after } = await clickResolvedNode(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'focusedNode must be valid after real canvas node click').toBe(true);
    expect(after.navMode, 'canvas node click should enter focus mode').toBe('focus');
    expect(after.lastCanvasNodePick || after.lastCanvasNodeFocusPick, 'click should record canvas pick evidence').not.toBeNull();
  });

  test('desktop: click pick evidence stays near the pointer coordinate', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const { target, after } = await clickResolvedNode(page);
    const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
    expect(pick, 'last canvas focus pick must be recorded').not.toBeNull();
    expect(isValidNodeIndex(pick.index, after.pointCount), 'pick index must be valid').toBe(true);
    expect(Number.isFinite(pick.screenX), 'pick screenX must be finite').toBe(true);
    expect(Number.isFinite(pick.screenY), 'pick screenY must be finite').toBe(true);

    const pickDist = Math.hypot(pick.screenX - target.screenX, pick.screenY - target.screenY);
    expect(pickDist, `pick should stay near clicked coordinate, distance=${Math.round(pickDist)}px`).toBeLessThanOrEqual(64);
  });

  test('desktop: clicking away from projected nodes does not create invalid focus state', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    await page.mouse.move(18, 18, { steps: 4 });
    await page.waitForTimeout(300);
    await page.mouse.click(18, 18);
    await page.waitForTimeout(400);

    const after = await probe(page);
    const noFocus = after.focusedNode === null;
    const validFocus = isValidNodeIndex(after.focusedNode, after.pointCount);
    expect(noFocus || validFocus, 'away click may do nothing, but must not create garbage focusedNode').toBe(true);
  });

  test('mobile portrait: tapping a real hoverable canvas node focuses a valid node', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });

    const { after } = await clickResolvedNode(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'mobile canvas tap must focus a valid node').toBe(true);
    expect(after.navMode, 'mobile canvas tap should enter focus mode').toBe('focus');
  });

  test('short landscape: tapping a real hoverable canvas node focuses a valid node', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });

    const { after } = await clickResolvedNode(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'short-landscape canvas tap must focus a valid node').toBe(true);
  });

  test('desktop: edge-region click yields a valid pick within tolerance', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const candidates = await projectedCanvasCandidates(page);
    expect(candidates.length, 'need at least one hoverable candidate').toBeGreaterThan(0);

    // Find the candidate nearest to any canvas edge
    const canvasRect = await page.evaluate(() => {
      const c = window.state?.renderer?.domElement;
      const r = c?.getBoundingClientRect?.();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
    });
    expect(canvasRect, 'canvas rect must be available').not.toBeNull();

    const edgeMargin = 36; // px — simulate edge-region click
    const edgeCandidates = candidates.filter(c =>
      c.screenX <= canvasRect.left + edgeMargin ||
      c.screenX >= canvasRect.right - edgeMargin ||
      c.screenY <= canvasRect.top + edgeMargin ||
      c.screenY >= canvasRect.bottom - edgeMargin
    );

    const target = (edgeCandidates.length > 0 ? edgeCandidates : candidates)[0];

    await page.mouse.move(target.screenX, target.screenY, { steps: 4 });
    await page.waitForTimeout(150);

    // Confirm hover is live before clicking
    const pre = await probe(page);
    expect(pre.canvasCursor, 'canvas cursor should be pointer at candidate').toBe('pointer');

    await page.mouse.click(target.screenX, target.screenY);
    await page.waitForTimeout(700);

    const after = await probe(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'edge-region click must focus a valid node').toBe(true);
    expect(after.navMode, 'edge-region click should enter focus mode').toBe('focus');

    const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
    expect(pick, 'edge-region click must record pick evidence').not.toBeNull();
    expect(isValidNodeIndex(pick.index, after.pointCount), 'edge-region pick index must be valid').toBe(true);

    const pickDist = Math.hypot(pick.screenX - target.screenX, pick.screenY - target.screenY);
    expect(pickDist, `edge-region pick should stay near click coordinate, distance=${Math.round(pickDist)}px`).toBeLessThanOrEqual(64);
  });

  test('mobile portrait: edge-region tap yields valid pick within tolerance', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });

    const candidates = await projectedCanvasCandidates(page);
    expect(candidates.length, 'need at least one hoverable candidate on mobile').toBeGreaterThan(0);

    const canvasRect = await page.evaluate(() => {
      const c = window.state?.renderer?.domElement;
      const r = c?.getBoundingClientRect?.();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    });
    expect(canvasRect, 'canvas rect must be available').not.toBeNull();

    const edgeMargin = 28;
    const edgeCandidates = candidates.filter(c =>
      c.screenX <= canvasRect.left + edgeMargin ||
      c.screenX >= canvasRect.right - edgeMargin ||
      c.screenY <= canvasRect.top + edgeMargin ||
      c.screenY >= canvasRect.bottom - edgeMargin
    );

    const target = (edgeCandidates.length > 0 ? edgeCandidates : candidates)[0];

    await page.mouse.move(target.screenX, target.screenY, { steps: 4 });
    await page.waitForTimeout(150);

    const pre = await probe(page);
    expect(pre.canvasCursor, 'canvas cursor should be pointer before mobile edge tap').toBe('pointer');

    await page.mouse.click(target.screenX, target.screenY);
    await page.waitForTimeout(700);

    const after = await probe(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'mobile edge tap must focus a valid node').toBe(true);

    const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
    expect(pick, 'mobile edge tap must record pick evidence').not.toBeNull();

    const pickDist = Math.hypot(pick.screenX - target.screenX, pick.screenY - target.screenY);
    expect(pickDist, `mobile edge pick distance=${Math.round(pickDist)}px`).toBeLessThanOrEqual(64);
  });

  test('short landscape: edge-region click yields valid pick within tolerance', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 844, height: 390 });

    const candidates = await projectedCanvasCandidates(page, { maxResultsOverride: 6 });
    expect(candidates.length, 'need at least one candidate in short landscape').toBeGreaterThan(0);

    const canvasRect = await page.evaluate(() => {
      const c = window.state?.renderer?.domElement;
      const r = c?.getBoundingClientRect?.();
      return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    });
    expect(canvasRect, 'canvas rect must be available').not.toBeNull();

    const edgeMargin = 24;
    const edgeCandidates = candidates.filter(c =>
      c.screenX <= canvasRect.left + edgeMargin ||
      c.screenX >= canvasRect.right - edgeMargin ||
      c.screenY <= canvasRect.top + edgeMargin ||
      c.screenY >= canvasRect.bottom - edgeMargin
    );

    const target = (edgeCandidates.length > 0 ? edgeCandidates : candidates)[0];

    await page.mouse.move(target.screenX, target.screenY, { steps: 4 });
    await page.waitForTimeout(150);

    await page.mouse.click(target.screenX, target.screenY);
    await page.waitForTimeout(700);

    const after = await probe(page);
    expect(isValidNodeIndex(after.focusedNode, after.pointCount), 'short-landscape edge click must focus a valid node').toBe(true);

    const pick = after.lastCanvasNodeFocusPick || after.lastCanvasNodePick;
    expect(pick, 'short-landscape edge click must record pick evidence').not.toBeNull();

    const pickDist = Math.hypot(pick.screenX - target.screenX, pick.screenY - target.screenY);
    expect(pickDist, `short-landscape edge pick distance=${Math.round(pickDist)}px`).toBeLessThanOrEqual(64);
  });
});
