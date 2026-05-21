import { test, expect } from '@playwright/test';
import { BASE_URL, setupMockSearch, openApp, isValidNodeIndex, projectedCanvasCandidates } from './helpers/3d-interaction-helpers.js';

async function getHoverState(page) {
  return page.evaluate(() => ({
    hoverHighlightIndex: window.state?.hoverHighlightIndex ?? null,
    stableCanvasHover: window.state?.stableCanvasHover
      ? {
          index: window.state.stableCanvasHover.index,
          source: window.state.stableCanvasHover.source || '',
          distance: window.state.stableCanvasHover.distance ?? null
        }
      : null,
    lastCanvasNodeHover: window.__lastCanvasNodeHover
      ? {
          index: window.__lastCanvasNodeHover.index,
          source: window.__lastCanvasNodeHover.source || '',
          distance: window.__lastCanvasNodeHover.distance ?? null
        }
      : null,
    canvasCursor: window.state?.renderer?.domElement?.style?.cursor ?? '',
    pointCount: window.state?.points?.length ?? 0,
    focusedNode: window.state?.focusedNode ?? null
  }));
}

async function findHoverableNode(page) {
  const candidates = await projectedCanvasCandidates(page);
  for (const candidate of candidates) {
    await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 4 });
    await page.waitForTimeout(140);
    const state = await getHoverState(page);
    if (isValidNodeIndex(state.hoverHighlightIndex, state.pointCount) && state.canvasCursor === 'pointer') {
      return {
        ...candidate,
        resolvedIndex: state.hoverHighlightIndex,
        stableCanvasHover: state.stableCanvasHover,
        lastCanvasNodeHover: state.lastCanvasNodeHover
      };
    }
  }
  return null;
}

test.describe('3D node hover affordance', () => {
  test('desktop: real mouse hover resolves a selectable node and pointer cursor', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const target = await findHoverableNode(page);
    expect(target, 'at least one projected canvas coordinate must produce node hover').not.toBeNull();

    const hoverState = await getHoverState(page);
    expect(isValidNodeIndex(hoverState.hoverHighlightIndex, hoverState.pointCount), 'hoverHighlightIndex must resolve to a valid node').toBe(true);
    expect(hoverState.canvasCursor, 'canvas cursor should indicate pointer hover').toBe('pointer');
    expect(hoverState.lastCanvasNodeHover || hoverState.stableCanvasHover, 'hover debug state should identify the resolved node').not.toBeNull();
  });

  test('desktop: moving away clears hover state and cursor affordance', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const target = await findHoverableNode(page);
    expect(target, 'a hoverable node must exist before testing clear behavior').not.toBeNull();

    await page.mouse.move(16, 16, { steps: 5 });
    await page.waitForTimeout(500);

    const hoverAfter = await getHoverState(page);
    const cleared = hoverAfter.hoverHighlightIndex === -1 || hoverAfter.hoverHighlightIndex === null;
    expect(cleared, `hoverHighlightIndex should clear after move-away, got ${hoverAfter.hoverHighlightIndex}`).toBe(true);
    expect(hoverAfter.canvasCursor, 'canvas cursor should reset after hover clear').not.toBe('pointer');
  });

  test('desktop: two hoverable coordinates keep hover valid without corrupting focus', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const first = await findHoverableNode(page);
    expect(first, 'first hoverable node must exist').not.toBeNull();
    const firstState = await getHoverState(page);

    await page.mouse.move(first.screenX + 220, first.screenY + 180, { steps: 5 });
    await page.waitForTimeout(220);
    const secondState = await getHoverState(page);

    const secondIsValid = isValidNodeIndex(secondState.hoverHighlightIndex, secondState.pointCount);
    const secondIsCleared = secondState.hoverHighlightIndex === -1 || secondState.hoverHighlightIndex === null;
    expect(secondIsValid || secondIsCleared, 'moving to another canvas coordinate should leave hover valid or cleanly cleared').toBe(true);
    expect(firstState.focusedNode, 'hover must not create focus by itself').toBeNull();
  });

  test('mobile portrait: projected coordinate hover path remains deterministic', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });

    const target = await findHoverableNode(page);
    expect(target, 'mobile portrait should expose at least one hoverable/pickable projected node').not.toBeNull();

    const hoverState = await getHoverState(page);
    expect(isValidNodeIndex(hoverState.hoverHighlightIndex, hoverState.pointCount), 'mobile hoverHighlightIndex must be valid').toBe(true);
    expect(hoverState.canvasCursor, 'mobile canvas cursor should reflect node hover in browser pointer mode').toBe('pointer');
  });

  test('desktop focus mode: hover remains separate from focused node state', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    await page.evaluate(() => {
      if (typeof window.focusOnNode === 'function') window.focusOnNode(0);
    });
    await page.waitForFunction(() => window.state?.navState?.mode === 'focus', { timeout: 15000 });

    const target = await findHoverableNode(page);
    expect(target, 'focus mode should still allow deterministic hover probing or clean hover clear').not.toBeNull();

    const hoverState = await getHoverState(page);
    expect(isValidNodeIndex(hoverState.focusedNode, hoverState.pointCount), 'focused node should remain valid').toBe(true);
    expect(typeof hoverState.hoverHighlightIndex, 'hover state should remain independently tracked').toBe('number');
  });

  test('desktop: hover state clears cleanly when focus is reset via Escape', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const target = await findHoverableNode(page);
    expect(target, 'a hoverable node must exist before testing reset').not.toBeNull();

    // Enter focus
    await page.evaluate((nodeIndex) => {
      if (typeof window.focusOnNode === 'function') window.focusOnNode(nodeIndex);
    }, target.resolvedIndex);
    await page.waitForFunction(() => window.state?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    // Verify we are in focus
    const focusState = await getHoverState(page);
    expect(focusState.focusedNode, 'should be in focus state').not.toBeNull();

    // Press Escape to reset
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.state?.navState?.mode === 'overview', { timeout: 12000 });
    await page.waitForTimeout(800);

    // Hover should be cleared (null or -1) after reset
    const afterReset = await getHoverState(page);
    const cleared = afterReset.hoverHighlightIndex === -1 || afterReset.hoverHighlightIndex === null;
    expect(cleared, `hover should clear after Escape reset, got ${afterReset.hoverHighlightIndex}`).toBe(true);
  });

  test('mobile portrait: hover resolves on a real node at 390x844', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });

    const target = await findHoverableNode(page);
    expect(target, 'mobile portrait should expose at least one hoverable node').not.toBeNull();

    const hoverState = await getHoverState(page);
    expect(isValidNodeIndex(hoverState.hoverHighlightIndex, hoverState.pointCount),
      'mobile hoverHighlightIndex must be valid').toBe(true);
    expect(hoverState.canvasCursor, 'mobile canvas cursor should be pointer').toBe('pointer');
  });
});
