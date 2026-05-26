import { test, expect } from '@playwright/test';
import { BASE_URL, setupMockSearch, openApp, isValidNodeIndex, projectedCanvasCandidates } from './helpers/3d-interaction-helpers.js';

async function getHoverState(page) {
  return page.evaluate(() => ({
    hoverHighlightIndex: window.__TEST_STATE__?.hoverHighlightIndex ?? null,
    stableCanvasHover: window.__TEST_STATE__?.stableCanvasHover
      ? {
          index: window.__TEST_STATE__.stableCanvasHover.index,
          source: window.__TEST_STATE__.stableCanvasHover.source || '',
          distance: window.__TEST_STATE__.stableCanvasHover.distance ?? null
        }
      : null,
    lastCanvasNodeHover: window.__lastCanvasNodeHover
      ? {
          index: window.__lastCanvasNodeHover.index,
          source: window.__lastCanvasNodeHover.source || '',
          distance: window.__lastCanvasNodeHover.distance ?? null
        }
      : null,
    canvasCursor: window.__TEST_STATE__?.renderer?.domElement?.style?.cursor ?? '',
    pointCount: window.__TEST_STATE__?.points?.length ?? 0,
    focusedNode: window.__TEST_STATE__?.focusedNode ?? null
  }));
}

async function findHoverableNode(page) {
  const candidates = await projectedCanvasCandidates(page);
  for (const candidate of candidates) {
    await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 1 });
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

async function moveUntilHoverClears(page) {
  const viewport = page.viewportSize() || { width: 1440, height: 900 };
  const points = [
    [8, 8],
    [viewport.width - 8, 8],
    [8, viewport.height - 8],
    [viewport.width - 8, viewport.height - 8],
    [viewport.width / 2, 8],
    [8, viewport.height / 2],
  ];

  let lastState = null;
  for (const [x, y] of points) {
    await page.mouse.move(x, y, { steps: 1 });
    await page.waitForTimeout(220);
    lastState = await getHoverState(page);
    const cleared = lastState.hoverHighlightIndex === -1 || lastState.hoverHighlightIndex === null;
    if (cleared && lastState.canvasCursor !== 'pointer') return lastState;
  }
  return lastState;
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

    const hoverAfter = await moveUntilHoverClears(page);
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

    await page.mouse.move(first.screenX + 220, first.screenY + 180, { steps: 1 });
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
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });

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
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 });
    await page.waitForTimeout(600);

    // Verify we are in focus
    const focusState = await getHoverState(page);
    expect(focusState.focusedNode, 'should be in focus state').not.toBeNull();

    // Press Escape to reset
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'overview', { timeout: 12000 });
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

  test('desktop: rapid mouse movements keep hover state valid and cursor accurate', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    const candidates = await projectedCanvasCandidates(page);
    expect(candidates.length, 'need multiple candidates for rapid-move test').toBeGreaterThan(1);

    let first = null;
    let second = null;
    for (const candidate of candidates) {
      await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 1 });
      await page.waitForTimeout(160);
      const resolved = await getHoverState(page);
      if (!isValidNodeIndex(resolved.hoverHighlightIndex, resolved.pointCount)) continue;
      const resolvedCandidate = { ...candidate, resolvedIndex: resolved.hoverHighlightIndex };
      if (!first) {
        first = resolvedCandidate;
      } else if (resolvedCandidate.resolvedIndex !== first.resolvedIndex) {
        second = resolvedCandidate;
        break;
      }
    }
    expect(first, 'first resolved hover target must exist').not.toBeNull();
    expect(second, 'second distinct resolved hover target must exist').not.toBeNull();

    await page.mouse.move(first.screenX, first.screenY, { steps: 1 });
    await page.waitForTimeout(40);
    await page.mouse.move(second.screenX, second.screenY, { steps: 1 });
    await page.waitForFunction((expectedIndex) => {
      const hover = window.__TEST_STATE__?.hoverHighlightIndex;
      return hover === expectedIndex;
    }, second.resolvedIndex, { timeout: 20000 });

    const state = await getHoverState(page);
    expect(state.hoverHighlightIndex, 'rapid move should settle on the last hovered node, not stale first node').toBe(second.resolvedIndex);
    expect(state.hoverHighlightIndex, 'rapid move must not leave stale first hover selected').not.toBe(first.resolvedIndex);
    expect(state.canvasCursor, 'cursor should be pointer after final hover').toBe('pointer');
  });

  test('desktop: stale hover state from rapid move clears cleanly without focus corruption', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 1440, height: 900 });

    // First establish a solid hover on one node
    const candidates = await projectedCanvasCandidates(page);
    expect(candidates.length, 'need candidates for stale-state test').toBeGreaterThan(0);

    const first = candidates[0];
    await page.mouse.move(first.screenX, first.screenY, { steps: 1 });
    await page.waitForTimeout(200);

    const initial = await getHoverState(page);
    expect(isValidNodeIndex(initial.hoverHighlightIndex, initial.pointCount), 'initial hover must be valid').toBe(true);

    // Rapid-move away — simulates losing hover before state update propagates
    await page.mouse.move(16, 16, { steps: 1 });
    await page.waitForTimeout(20); // intentionally too short for full hover settle

    const mid = await getHoverState(page);
    const midValid = isValidNodeIndex(mid.hoverHighlightIndex, mid.pointCount);
    const midCleared = mid.hoverHighlightIndex === -1 || mid.hoverHighlightIndex === null;

    // Intermediate state is allowed to be mid-transition; just ensure it's not garbage
    expect(midValid || midCleared, `mid-hover must be valid or cleared, got ${mid.hoverHighlightIndex}`).toBe(true);

    // Wait for full settle
    await page.waitForTimeout(500);

    const settled = await getHoverState(page);
    const settledCleared = settled.hoverHighlightIndex === -1 || settled.hoverHighlightIndex === null;
    expect(settledCleared, `settled hover should be null/-1 after move-away, got ${settled.hoverHighlightIndex}`).toBe(true);
    expect(settled.canvasCursor, 'cursor should not be pointer after hover clears').not.toBe('pointer');

    // Focus must NOT be corrupted by the stale hover event
    expect(settled.focusedNode, 'stale hover must not create focus').toBeNull();
  });

  test('mobile portrait: rapid hover movements keep state valid without cascading errors', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, { width: 390, height: 844 });

    const candidates = await projectedCanvasCandidates(page);
    expect(candidates.length, 'need candidates for mobile rapid-move test').toBeGreaterThan(0);

    // Rapid movement across candidates
    for (const candidate of candidates.slice(0, 4)) {
      await page.mouse.move(candidate.screenX, candidate.screenY, { steps: 1 });
    }
    await page.waitForTimeout(80);

    const state = await getHoverState(page);
    const valid = isValidNodeIndex(state.hoverHighlightIndex, state.pointCount);
    const cleared = state.hoverHighlightIndex === -1 || state.hoverHighlightIndex === null;
    expect(valid || cleared, `mobile hover state must be valid or cleared, got ${state.hoverHighlightIndex}`).toBe(true);
    expect(state.pointCount, 'pointCount must still be valid after rapid moves').toBeGreaterThan(0);
  });
});
