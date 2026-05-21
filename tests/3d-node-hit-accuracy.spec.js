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
});
