import { test, expect } from '@playwright/test';
import {
  openApp,
  isValidNodeIndex,
  projectedCandidates
} from './helpers/3d-interaction-helpers.js';

/**
 * Real-pointer proof for 3D interaction at short-landscape 844x390.
 *
 * Gap: previous MCP synthetic MouseEvent did not flip hoverHighlightIndex,
 * while Playwright contracts passed. This test uses real Playwright
 * page.mouse APIs (move/click/wheel/down/up) to prove hover/click/drag/wheel
 * at 844x390 and verify hoverHighlightIndex, canvas cursor, and last pick.
 */

const SHORT_LANDSCAPE = { width: 844, height: 390 };

async function getInteractionState(page) {
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
    lastCanvasNodePick: window.__lastCanvasNodePick
      ? {
          index: window.__lastCanvasNodePick.index,
          source: window.__lastCanvasNodePick.source || '',
          screenX: window.__lastCanvasNodePick.screenX,
          screenY: window.__lastCanvasNodePick.screenY,
          distance: window.__lastCanvasNodePick.distance ?? null
        }
      : null,
    lastCanvasNodeFocusPick: window.__lastCanvasNodeFocusPick
      ? {
          index: window.__lastCanvasNodeFocusPick.index,
          source: window.__lastCanvasNodeFocusPick.source || '',
          screenX: window.__lastCanvasNodeFocusPick.screenX,
          screenY: window.__lastCanvasNodeFocusPick.screenY,
          distance: window.__lastCanvasNodeFocusPick.distance ?? null
        }
      : null,
    canvasCursor: window.state?.renderer?.domElement?.style?.cursor ?? '',
    pointCount: window.state?.points?.length ?? 0,
    focusedNode: window.state?.focusedNode ?? null,
    navMode: window.state?.navState?.mode ?? '',
    canvasRect: window.state?.renderer?.domElement
      ? {
          width: window.state.renderer.domElement.clientWidth,
          height: window.state.renderer.domElement.clientHeight
        }
      : null
  }));
}

/**
 * Move mouse in steps to simulate real pointer travel.
 */
async function realMouseMoveTo(page, x, y, { steps = 6 } = {}) {
  await page.mouse.move(x, y, { steps });
}

test.describe('3D real-pointer playthrough - short-landscape 844x390', () => {

  // -------------------------------------------------------------------------
  // HOVER - page.mouse.move must flip hoverHighlightIndex
  // -------------------------------------------------------------------------

  test('real mouse.move to canvas node flips hoverHighlightIndex at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, SHORT_LANDSCAPE);
    await page.waitForTimeout(800);

    const initial = await getInteractionState(page);
    expect(initial.pointCount, 'scene must have loaded with points').toBeGreaterThan(0);

    // Find projected candidates: nodes that project onto visible canvas area.
    const candidates = await projectedCandidates(page, { marginRatio: 0.08, maxResults: 12 });
    expect(candidates.length, 'at least one node must project into visible canvas at 844x390')
      .toBeGreaterThan(0);

    // Sort by distance from center to get a stable first target
    const target = candidates.sort((a, b) => a.centerDistance - b.centerDistance)[0];

    // Real mouse move: no synthetic MouseEvent dispatch.
    await realMouseMoveTo(page, target.screenX, target.screenY);
    await page.waitForTimeout(300);

    const hovered = await getInteractionState(page);

    // Critical assertions: hoverHighlightIndex must be valid and cursor must reflect pointer
    expect(
      isValidNodeIndex(hovered.hoverHighlightIndex, hovered.pointCount),
      `hoverHighlightIndex=${hovered.hoverHighlightIndex} must be valid (0-${hovered.pointCount - 1})`
    ).toBe(true);

    expect(
      hovered.canvasCursor,
      `canvas cursor must be 'pointer' when hovering a node at (${target.screenX|0}, ${target.screenY|0})`
    ).toBe('pointer');

    // stableCanvasHover or lastCanvasNodeHover should also be set
    const hoverDebugSet = hovered.stableCanvasHover || hovered.lastCanvasNodeHover;
    expect(hoverDebugSet, 'hover debug state (stableCanvasHover or lastCanvasNodeHover) must be set').not.toBeNull();
  });

  test('real mouse.move off canvas clears hoverHighlightIndex at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, SHORT_LANDSCAPE);
    await page.waitForTimeout(800);

    // First find and hover a node
    const candidates = await projectedCandidates(page, { marginRatio: 0.08, maxResults: 12 });
    expect(candidates.length).toBeGreaterThan(0);
    const target = candidates.sort((a, b) => a.centerDistance - b.centerDistance)[0];

    await realMouseMoveTo(page, target.screenX, target.screenY);
    await page.waitForTimeout(300);

    const whileHovering = await getInteractionState(page);
    expect(isValidNodeIndex(whileHovering.hoverHighlightIndex, whileHovering.pointCount)).toBe(true);

    // Move off to top-left corner (safe non-canvas area in short landscape)
    await realMouseMoveTo(page, 16, 16);
    await page.waitForTimeout(500);

    const afterMoveOff = await getInteractionState(page);
    const cleared = afterMoveOff.hoverHighlightIndex === null || afterMoveOff.hoverHighlightIndex === -1;
    expect(cleared, `hoverHighlightIndex should clear after move-off, got ${afterMoveOff.hoverHighlightIndex}`).toBe(true);
    expect(afterMoveOff.canvasCursor, 'cursor should no longer be pointer').not.toBe('pointer');
  });

  // -------------------------------------------------------------------------
  // CLICK - page.mouse.click must update lastCanvasNodePick
  // -------------------------------------------------------------------------

  test('real mouse.click on a node sets lastCanvasNodePick at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, SHORT_LANDSCAPE);
    await page.waitForTimeout(800);

    const candidates = await projectedCandidates(page, { marginRatio: 0.08, maxResults: 12 });
    expect(candidates.length).toBeGreaterThan(0);
    const target = candidates.sort((a, b) => a.centerDistance - b.centerDistance)[0];

    // Hover first (hover state must be established before reliable click pick)
    await realMouseMoveTo(page, target.screenX, target.screenY);
    await page.waitForTimeout(350);

    // Real click: not page.dispatchEvent with synthetic MouseEvent.
    await page.mouse.click(target.screenX, target.screenY);
    await page.waitForTimeout(400);

    const afterClick = await getInteractionState(page);

    // Click pick must be recorded
    expect(afterClick.lastCanvasNodePick, 'lastCanvasNodePick must be set after real click').not.toBeNull();
    expect(
      isValidNodeIndex(afterClick.lastCanvasNodePick.index, afterClick.pointCount),
      `lastCanvasNodePick.index=${afterClick.lastCanvasNodePick.index} must be valid`
    ).toBe(true);

    // Canvas cursor should still reflect pointer (hover + click combo is valid)
    expect(afterClick.canvasCursor).toBe('pointer');
  });

  // -------------------------------------------------------------------------
  // DRAG - page.mouse.down/move/up must not corrupt hover or pick state
  // -------------------------------------------------------------------------

  test('real mouse drag on canvas preserves state integrity at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, SHORT_LANDSCAPE);
    await page.waitForTimeout(800);

    const candidates = await projectedCandidates(page, { marginRatio: 0.08, maxResults: 12 });
    expect(candidates.length).toBeGreaterThan(0);
    const target = candidates.sort((a, b) => a.centerDistance - b.centerDistance)[0];

    // Hover first
    await realMouseMoveTo(page, target.screenX, target.screenY);
    await page.waitForTimeout(300);

    const preDrag = await getInteractionState(page);
    expect(isValidNodeIndex(preDrag.hoverHighlightIndex, preDrag.pointCount)).toBe(true);

    // Small real drag: 40px right, 20px down.
    await page.mouse.move(target.screenX, target.screenY);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.move(target.screenX + 40, target.screenY + 20, { steps: 5 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const postDrag = await getInteractionState(page);

    // After a small drag the hover may or may not be on a node (depends on destination)
    // The critical invariant: state must not be corrupted (no exceptions, no NaN)
    expect(Number.isFinite(postDrag.hoverHighlightIndex) || postDrag.hoverHighlightIndex === null, 'hoverHighlightIndex must be finite or null after drag').toBe(true);
    expect(postDrag.pointCount, 'pointCount must remain stable').toBe(preDrag.pointCount);
    expect(postDrag.canvasRect, 'canvasRect must remain available').not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // WHEEL - page.mouse.wheel must not break hover or camera state
  // -------------------------------------------------------------------------

  test('real mouse.wheel on canvas does not corrupt hoverHighlightIndex at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, SHORT_LANDSCAPE);
    await page.waitForTimeout(800);

    const candidates = await projectedCandidates(page, { marginRatio: 0.08, maxResults: 12 });
    expect(candidates.length).toBeGreaterThan(0);
    const target = candidates.sort((a, b) => a.centerDistance - b.centerDistance)[0];

    // Establish hover
    await realMouseMoveTo(page, target.screenX, target.screenY);
    await page.waitForTimeout(300);

    const preWheel = await getInteractionState(page);
    expect(isValidNodeIndex(preWheel.hoverHighlightIndex, preWheel.pointCount)).toBe(true);

    // Real wheel: scroll down (negative deltaY).
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(500);

    const postWheel = await getInteractionState(page);

    // State must not be corrupted
    expect(postWheel.pointCount, 'pointCount must be stable after wheel').toBe(preWheel.pointCount);
    expect(
      Number.isFinite(postWheel.hoverHighlightIndex) || postWheel.hoverHighlightIndex === null,
      'hoverHighlightIndex must remain valid or null after wheel'
    ).toBe(true);
    expect(postWheel.canvasRect, 'canvas must still have dimensions after wheel').not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // SEQUENTIAL: hover, click, move, wheel - state must be coherent throughout.
  // -------------------------------------------------------------------------

  test('sequential real-pointer actions maintain coherent state at 844x390', async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, SHORT_LANDSCAPE);
    await page.waitForTimeout(800);

    const candidates = await projectedCandidates(page, { marginRatio: 0.08, maxResults: 12 });
    expect(candidates.length).toBeGreaterThan(0);

    // Use two distinct targets
    const [t1, t2] = candidates.sort((a, b) => a.centerDistance - b.centerDistance).slice(0, 2);
    const snapshot = [];

    // Step 1: hover t1
    await realMouseMoveTo(page, t1.screenX, t1.screenY);
    await page.waitForTimeout(350);
    snapshot.push({ step: 'hover-t1', ...await getInteractionState(page) });

    // Step 2: click t1
    await page.mouse.click(t1.screenX, t1.screenY);
    await page.waitForTimeout(400);
    snapshot.push({ step: 'click-t1', ...await getInteractionState(page) });

    // Step 3: move to t2 (hover t2)
    await realMouseMoveTo(page, t2.screenX, t2.screenY);
    await page.waitForTimeout(350);
    snapshot.push({ step: 'hover-t2', ...await getInteractionState(page) });

    // Step 4: wheel
    await page.mouse.wheel(0, -80);
    await page.waitForTimeout(400);
    snapshot.push({ step: 'wheel', ...await getInteractionState(page) });

    // Assertions: each step's state must be coherent
    for (const s of snapshot) {
      expect(
        Number.isFinite(s.pointCount) && s.pointCount > 0,
        `${s.step}: pointCount must be positive finite`
      ).toBe(true);
      expect(
        s.canvasRect && s.canvasRect.width > 0 && s.canvasRect.height > 0,
        `${s.step}: canvasRect must have positive dimensions`
      ).toBe(true);
      expect(
        s.hoverHighlightIndex === null || s.hoverHighlightIndex === -1 || isValidNodeIndex(s.hoverHighlightIndex, s.pointCount),
        `${s.step}: hoverHighlightIndex=${s.hoverHighlightIndex} must be null, -1, or valid`
      ).toBe(true);
    }

    // Step 2 (click) must have recorded lastCanvasNodePick
    const clickStep = snapshot.find(s => s.step === 'click-t1');
    expect(clickStep?.lastCanvasNodePick, 'lastCanvasNodePick must be set after click').not.toBeNull();
    expect(
      isValidNodeIndex(clickStep?.lastCanvasNodePick?.index, clickStep?.pointCount),
      'click pick index must be valid'
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // CANVAS CURSOR - always reflects current hover mode
  // -------------------------------------------------------------------------

  test('canvas cursor is pointer only when hovering a valid node at 844x390', async ({ page }) => {
    test.setTimeout(60000);
    await openApp(page, SHORT_LANDSCAPE);
    await page.waitForTimeout(800);

    // When not hovering a node, cursor should not be pointer
    const offCanvasX = 16, offCanvasY = 16;
    await realMouseMoveTo(page, offCanvasX, offCanvasY);
    await page.waitForTimeout(400);

    const offState = await getInteractionState(page);
    expect(offState.canvasCursor, 'cursor should not be pointer when mouse is off canvas').not.toBe('pointer');

    // When hovering a node, cursor must be pointer
    const candidates = await projectedCandidates(page, { marginRatio: 0.08, maxResults: 12 });
    expect(candidates.length).toBeGreaterThan(0);
    const target = candidates.sort((a, b) => a.centerDistance - b.centerDistance)[0];

    await realMouseMoveTo(page, target.screenX, target.screenY);
    await page.waitForTimeout(350);

    const onState = await getInteractionState(page);
    expect(onState.canvasCursor, 'cursor must be pointer when hovering a valid node').toBe('pointer');
    expect(isValidNodeIndex(onState.hoverHighlightIndex, onState.pointCount)).toBe(true);
  });
});
