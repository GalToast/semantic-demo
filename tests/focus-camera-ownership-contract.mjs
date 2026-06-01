/**
 * Focus camera ownership contract.
 *
 * Surface/layout contracts prove drawers fit. This contract proves the camera
 * owner keeps the focused node and at least part of its traversal neighborhood
 * inside the usable canvas area for cramped focus states.
 */

import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html?view=galaxy&nodemo=1';
const TARGET_URL = process.env.FOCUS_CAMERA_OWNERSHIP_URL || DEFAULT_URL;
const FOCUS_INDEX = Number(process.env.FOCUS_CAMERA_OWNERSHIP_INDEX || 3060);

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function withCacheBust(url, tag) {
  const parsed = new URL(url);
  parsed.searchParams.set('nodemo', '1');
  parsed.searchParams.set('cameraowner', `${tag}-${Date.now()}`);
  return parsed.href;
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return Array.isArray(state.points) &&
      state.points.length > 100 &&
      state.renderer &&
      state.camera &&
      state.controls &&
      typeof window.__APP_ACTIONS__?.focusOnNode === 'function' &&
      typeof window.__APP_ACTIONS__?.setSemanticDiveMode === 'function' &&
      state.applyingUrlState === false &&
      window.history.state?.semanticDemo &&
      state.sceneRevealActive === false &&
      document.body.dataset.sceneReveal === 'inactive';
  }, null, { timeout: 45000 });
}

async function focusNode(page, index, { dive = false } = {}) {
  await page.evaluate(({ targetIndex, shouldDive }) => {
    const actions = window.__APP_ACTIONS__ || {};
    actions.focusOnNode?.(targetIndex, { fromSearchResult: true, skipUrlSync: true });
    if (shouldDive) {
      actions.setSemanticDiveMode?.(true);
      actions.setTrailDepth?.(2, { fromUserGesture: true, skipUrlSync: true });
    } else {
      actions.setTrailDepth?.(1, { skipUrlSync: true });
    }
    actions.refreshCompositionState?.();
  }, { targetIndex: index, shouldDive: dive });

  await page.waitForFunction(({ targetIndex, shouldDive }) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const focused = state.navState?.focusedIndex ?? state.focusedNode;
    if (focused !== targetIndex) return false;
    if (shouldDive) {
      return state.trailDepth === 2 &&
        state.semanticDiveMode === true &&
        document.body.dataset.panelSurface === 'semantic-dive';
    }
    return ['focus', 'focus-search'].includes(document.body.dataset.panelSurface);
  }, { targetIndex: index, shouldDive: dive }, { timeout: 15000 });

  await page.waitForTimeout(dive ? 2200 : 1800);
}

async function cameraSnapshot(page) {
  return page.evaluate(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.01;
      return {
        selector,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        visible,
      };
    };
    const visiblePanelBoxes = [
      box('#journey-compass'),
      box('#focus-stage'),
      box('#info-panel'),
      box('.controls'),
      box('.legend-panel'),
      box('.weather-widget'),
    ].filter((item) => item?.visible && item.width >= 20 && item.height >= 20);

    const canvasRect = state.renderer?.domElement?.getBoundingClientRect?.() || {
      left: 0,
      top: 0,
      right: viewport.width,
      bottom: viewport.height,
      width: viewport.width,
      height: viewport.height,
    };
    let left = canvasRect.left;
    let right = canvasRect.right;
    let top = canvasRect.top;
    let bottom = canvasRect.bottom;
    const canvasCenterX = canvasRect.left + canvasRect.width / 2;
    for (const rect of visiblePanelBoxes) {
      const intersects = rect.x < canvasRect.right &&
        rect.right > canvasRect.left &&
        rect.y < canvasRect.bottom &&
        rect.bottom > canvasRect.top;
      if (!intersects) continue;
      const width = Math.min(rect.right, canvasRect.right) - Math.max(rect.x, canvasRect.left);
      const height = Math.min(rect.bottom, canvasRect.bottom) - Math.max(rect.y, canvasRect.top);
      if (width < 20 || height < 20) continue;
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      if (width <= canvasRect.width * 0.65 && height >= canvasRect.height * 0.35) {
        if (centerX <= canvasCenterX) left = Math.max(left, rect.right);
        else right = Math.min(right, rect.x);
      } else if (centerY < viewport.height * 0.5) {
        top = Math.max(top, rect.bottom);
      } else {
        bottom = Math.min(bottom, rect.y);
      }
    }
    const region = {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.max(1, Math.round(right - left)),
      height: Math.max(1, Math.round(bottom - top)),
      right: Math.round(right),
      bottom: Math.round(bottom),
    };

    const project = (index) => {
      const pos = Number.isFinite(index) ? state.nodePositions?.[index] || state.originalPositions?.[index] : null;
      if (!pos || !state.camera || !state.renderer || !window.THREE) return null;
      const vector = new window.THREE.Vector3(pos.x, pos.y, pos.z);
      state.pointsMesh?.localToWorld?.(vector);
      vector.project(state.camera);
      if (vector.z < -1 || vector.z > 1) return null;
      const x = ((vector.x + 1) / 2) * viewport.width;
      const y = ((-vector.y + 1) / 2) * viewport.height;
      return {
        index,
        x: Math.round(x),
        y: Math.round(y),
        inViewport: x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height,
        inUsableRegion: x >= region.x && x <= region.right && y >= region.y && y <= region.bottom,
      };
    };

    const focusIndex = state.navState?.focusedIndex ?? state.focusedNode ?? null;
    const neighbors = (state.navState?.focusPocketIndices || [])
      .filter((index) => Number.isFinite(index) && index !== focusIndex)
      .slice(0, 12)
      .map(project)
      .filter(Boolean);
    const focusScreen = project(focusIndex);
    return {
      viewport,
      bodyDataset: { ...document.body.dataset },
      cameraDistance: state.camera && state.controls ? state.camera.position.distanceTo(state.controls.target) : null,
      focusIndex,
      focusScreen,
      focusCoreScale: state.focusCore?.scale?.x ?? null,
      focusHaloScale: state.focusHalo?.scale?.x ?? null,
      focusWake: state.pointsMaterial?.userData?.shader?.uniforms?.uFocusWake?.value ?? null,
      focusRadius: state.pointsMaterial?.userData?.shader?.uniforms?.uFocusRadius?.value ?? null,
      region,
      visiblePanelBoxes,
      neighborCount: neighbors.length,
      neighborsInViewport: neighbors.filter((item) => item.inViewport).length,
      neighborsInUsableRegion: neighbors.filter((item) => item.inUsableRegion).length,
      sampleNeighbors: neighbors.slice(0, 6),
    };
  });
}

function assertCameraOwnership(name, snap, {
  expectedSurface,
  minDistance,
  maxDistance,
  minNeighborsInRegion,
  maxCoreScale,
  maxHaloScale,
}) {
  if (expectedSurface) {
    assert(snap.bodyDataset.panelSurface === expectedSurface,
      `${name}: expected panelSurface=${expectedSurface}, got ${snap.bodyDataset.panelSurface}`);
  } else {
    assert(['focus', 'focus-search'].includes(snap.bodyDataset.panelSurface),
      `${name}: expected focus/focus-search, got ${snap.bodyDataset.panelSurface}`);
  }
  assert(snap.cameraDistance >= minDistance,
    `${name}: camera too close/overzoomed, distance=${snap.cameraDistance}`);
  assert(snap.cameraDistance <= maxDistance,
    `${name}: camera too detached, distance=${snap.cameraDistance}`);
  assert(snap.focusScreen?.inUsableRegion,
    `${name}: focused node should land in usable canvas region, got ${JSON.stringify(snap.focusScreen)} region=${JSON.stringify(snap.region)}`);
  assert(snap.neighborsInUsableRegion >= minNeighborsInRegion,
    `${name}: expected at least ${minNeighborsInRegion} neighbors in usable region, got ${snap.neighborsInUsableRegion}; sample=${JSON.stringify(snap.sampleNeighbors)}`);
  assert(snap.focusCoreScale <= maxCoreScale,
    `${name}: selected-node core scale is too large, got ${snap.focusCoreScale}`);
  assert(snap.focusHaloScale <= maxHaloScale,
    `${name}: selected-node halo scale is too large, got ${snap.focusHaloScale}`);
}

const browser = await chromium.launch({ headless: true });

try {
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await mobile.goto(withCacheBust(TARGET_URL, 'semantic-dive'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitReady(mobile);
  await focusNode(mobile, FOCUS_INDEX, { dive: true });
  const diveSnap = await cameraSnapshot(mobile);
  assertCameraOwnership('mobile semantic-dive', diveSnap, {
    expectedSurface: 'semantic-dive',
    minDistance: 0.94,
    maxDistance: 1.42,
    minNeighborsInRegion: 2,
    maxCoreScale: 0.042,
    maxHaloScale: 0.1,
  });
  await mobile.close();

  const shortLandscape = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await shortLandscape.goto(withCacheBust(TARGET_URL, 'short-landscape'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitReady(shortLandscape);
  await focusNode(shortLandscape, FOCUS_INDEX, { dive: false });
  const shortSnap = await cameraSnapshot(shortLandscape);
  assertCameraOwnership('short-landscape focus', shortSnap, {
    expectedSurface: null,
    minDistance: 0.98,
    maxDistance: 1.38,
    minNeighborsInRegion: 1,
    maxCoreScale: 0.042,
    maxHaloScale: 0.1,
  });
  await shortLandscape.close();

  console.log(JSON.stringify({ diveSnap, shortSnap }, null, 2));
  console.log('Focus camera ownership contract passed.');
} finally {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

process.exit(0);
