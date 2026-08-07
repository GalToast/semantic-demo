/**
 * Focus camera/readability contract.
 *
 * A focused business should anchor the constellation without turning into an
 * oversized glow mass. This ratchets the camera pullback and selected-node
 * sprite/shader intensity for the mobile focus path.
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const DEFAULT_URL = 'http://127.0.0.1:8795/dist/svelte/index.html?view=galaxy&nodemo=1';
const TARGET_URL = process.env.FOCUS_CAMERA_URL || DEFAULT_URL;
const KNOWN_FOCUS_INDEX = Number(process.env.FOCUS_CAMERA_INDEX || 42);
const OUT_DIR = path.resolve(process.cwd(), 'tmp', 'focus-readability-contract');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function withCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('nodemo', '1');
  parsed.searchParams.set('cameracheck', `focus-readability-${Date.now()}`);
  return parsed.href;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function parsePngRgba(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('invalid PNG signature');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
  }

  const sourceBytesPerPixel = colorType === 6 ? 4 : 3;
  const sourceStride = width * sourceBytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  const rawRows = Buffer.alloc(width * height * sourceBytesPerPixel);
  const rgba = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * sourceStride;
    const prevRowStart = rowStart - sourceStride;
    for (let x = 0; x < sourceStride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= sourceBytesPerPixel ? rawRows[rowStart + x - sourceBytesPerPixel] : 0;
      const up = y > 0 ? rawRows[prevRowStart + x] : 0;
      const upLeft = y > 0 && x >= sourceBytesPerPixel ? rawRows[prevRowStart + x - sourceBytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, up, upLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter: ${filter}`);
      rawRows[rowStart + x] = value & 255;
    }
    sourceOffset += sourceStride;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (y * width + x) * sourceBytesPerPixel;
      const targetIndex = (y * width + x) * 4;
      rgba[targetIndex] = rawRows[sourceIndex];
      rgba[targetIndex + 1] = rawRows[sourceIndex + 1];
      rgba[targetIndex + 2] = rawRows[sourceIndex + 2];
      rgba[targetIndex + 3] = colorType === 6 ? rawRows[sourceIndex + 3] : 255;
    }
  }
  return { width, height, rgba };
}

function analyzeFocusScene(buffer) {
  const { width, height, rgba } = parsePngRgba(buffer);
  const region = { left: 0.05, top: 0.17, right: 0.95, bottom: 0.63 };
  const x0 = Math.max(0, Math.floor(width * region.left));
  const y0 = Math.max(0, Math.floor(height * region.top));
  const x1 = Math.min(width, Math.ceil(width * region.right));
  const y1 = Math.min(height, Math.ceil(height * region.bottom));
  const luminance = [];
  let bright = 0;
  let white = 0;
  let saturated = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const luma = Math.round((r * 299 + g * 587 + b * 114) / 1000);
      luminance.push(luma);
      if (luma >= 210) bright += 1;
      if (luma >= 236) white += 1;
      if (r >= 248 && g >= 248 && b >= 248) saturated += 1;
    }
  }
  luminance.sort((a, b) => a - b);
  const count = luminance.length || 1;
  const percentile = (p) => luminance[Math.min(luminance.length - 1, Math.max(0, Math.floor((luminance.length - 1) * p)))] || 0;
  return {
    region,
    samples: count,
    p90: percentile(0.9),
    p95: percentile(0.95),
    p99: percentile(0.99),
    brightRatio: Number((bright / count).toFixed(4)),
    whiteRatio: Number((white / count).toFixed(4)),
    saturatedRatio: Number((saturated / count).toFixed(4)),
  };
}

// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

try {
  await page.addInitScript(() => {
    window.__PLAYWRIGHT__ = true;
  });
  await page.goto(withCacheBust(TARGET_URL), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return Array.isArray(state.points) &&
      state.points.length > 100 &&
      state.renderer &&
      state.camera &&
      state.controls &&
      state.pointsMaterial?.userData?.shader &&
      document.body.dataset.sceneReady === 'true' &&
      document.body.dataset.loadingOverlay === 'hidden';
  }, null, { timeout: 45000 });

  await page.evaluate((index) => {
    window.__APP_ACTIONS__?.focusOnNode(index, { fromSearchResult: true, skipUrlSync: true });
    window.__APP_ACTIONS__?.setTrailDepth(1, { skipUrlSync: true });
    window.__APP_ACTIONS__?.refreshCompositionState?.();
  }, KNOWN_FOCUS_INDEX);

  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return (document.body.dataset.panelSurface === 'focus' ||
        document.body.dataset.panelSurface === 'focus-search') &&
      Number.isFinite(state.navState?.focusedIndex ?? state.focusedNode);
  }, null, { timeout: 12000 });

  await page.waitForTimeout(2200);
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

  const snap = await page.evaluate(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const shader = state.pointsMaterial?.userData?.shader;
    const cameraDistance = state.camera && state.controls
      ? state.camera.position.distanceTo(state.controls.target)
      : null;
    const focusIndex = state.navState?.focusedIndex ?? state.focusedNode ?? null;
    const focusPos = Number.isFinite(focusIndex) ? state.nodePositions?.[focusIndex] : null;
    const screen = (() => {
      if (!focusPos || !state.camera || !state.renderer || !window.THREE) return null;
      const vector = new window.THREE.Vector3(focusPos.x, focusPos.y, focusPos.z);
      state.pointsMesh?.localToWorld?.(vector);
      vector.project(state.camera);
      return {
        x: Math.round(((vector.x + 1) / 2) * window.innerWidth),
        y: Math.round(((-vector.y + 1) / 2) * window.innerHeight),
      };
    })();
    return {
      bodyDataset: { ...document.body.dataset },
      cameraDistance,
      focusIndex,
      focusScreen: screen,
      focusHaloOpacity: state.focusHalo?.material?.opacity ?? null,
      focusHaloScale: state.focusHalo?.scale?.x ?? null,
      focusCoreOpacity: state.focusCore?.material?.opacity ?? null,
      focusCoreScale: state.focusCore?.scale?.x ?? null,
      focusWake: shader?.uniforms?.uFocusWake?.value ?? null,
      focusRadius: shader?.uniforms?.uFocusRadius?.value ?? null,
      pointMaterialSize: state.pointsMaterial?.size ?? null,
      threadOpacity: {
        core: state.myceliumCoreLines?.material?.opacity ?? null,
        wispy: state.myceliumWispyLines?.material?.opacity ?? null,
        bridge: state.myceliumBridgeLines?.material?.opacity ?? null,
      },
      focusNeighborCount: Math.max(
        state.navState?.focusPocketIndices?.length ?? 0,
        state.navState?.trailNeighborIndices?.length ?? 0,
      ),
      searchChrome: (() => {
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
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            display: style.display,
            visibility: style.visibility,
            opacity: Number(style.opacity || 1),
            visible,
          };
        };
        return {
          infoPanel: box('#info-panel'),
          searchContainer: box('.search-container'),
          searchLabel: box('.search-label'),
          searchInput: box('#search-input'),
        };
      })(),
    };
  });

  await fs.mkdir(OUT_DIR, { recursive: true });
  const screenshotPath = path.join(OUT_DIR, 'mobile-focus-readability.png');
  const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false });
  const sceneLuminance = analyzeFocusScene(screenshot);
  snap.screenshotPath = screenshotPath;
  snap.sceneLuminance = sceneLuminance;

  assert(['focus', 'focus-search'].includes(snap.bodyDataset.panelSurface),
    `expected focus/focus-search, got ${snap.bodyDataset.panelSurface}`);
  assert(snap.cameraDistance >= 0.98,
    `focus camera should pull back enough for context, got distance=${snap.cameraDistance}`);
  assert(snap.cameraDistance <= 1.85,
    `focus camera should not be too detached, got distance=${snap.cameraDistance}`);
  assert(snap.focusHaloOpacity <= 0.16,
    `focus halo opacity should stay subordinate to nodes, got ${snap.focusHaloOpacity}`);
  assert(snap.focusHaloScale <= 0.096,
    `focus halo scale should not dominate selected node, got ${snap.focusHaloScale}`);
  assert(snap.focusCoreOpacity <= 0.8,
    `focus core opacity should not saturate, got ${snap.focusCoreOpacity}`);
  assert(snap.focusCoreScale <= 0.04,
    `focus core scale should stay node-like, got ${snap.focusCoreScale}`);
  assert(snap.focusWake <= 0.63,
    `focus wake should be restrained in depth-1 focus, got ${snap.focusWake}`);
  assert(snap.focusRadius <= 0.15,
    `focus wake radius should stay local in depth-1 focus, got ${snap.focusRadius}`);
  assert(snap.focusNeighborCount >= 3,
    `focus view should still expose neighbor context, got ${snap.focusNeighborCount}`);
  assert(snap.threadOpacity.core <= 0.17,
    `focus core thread opacity should remain background context, got ${snap.threadOpacity.core}`);
  assert(snap.threadOpacity.wispy <= 0.06,
    `focus wispy thread opacity should remain background context, got ${snap.threadOpacity.wispy}`);
  assert(snap.threadOpacity.bridge <= 0.09,
    `focus bridge thread opacity should remain background context, got ${snap.threadOpacity.bridge}`);
  if (snap.bodyDataset.panelSurface === 'focus-search') {
    assert(snap.searchChrome.infoPanel?.height <= 52,
      `focus-search context strip should stay compact, got ${snap.searchChrome.infoPanel?.height}px`);
    assert(snap.searchChrome.searchLabel?.display === 'none' || snap.searchChrome.searchLabel?.height <= 2,
      `focus-search should suppress the full search label row, got ${JSON.stringify(snap.searchChrome.searchLabel)}`);
  } else if (snap.bodyDataset.panelSurface === 'focus') {
    assert(!snap.searchChrome.infoPanel?.visible,
      `plain focus should not show a detached info-panel drawer, got ${JSON.stringify(snap.searchChrome.infoPanel)}`);
  }
  assert(sceneLuminance.brightRatio <= 0.09,
    `focus scene bright pixel ratio should not read as a wall of threads, got ${sceneLuminance.brightRatio}`);
  assert(sceneLuminance.whiteRatio <= 0.025,
    `focus scene white pixel ratio should stay restrained, got ${sceneLuminance.whiteRatio}`);
  assert(sceneLuminance.p95 <= 158,
    `focus scene p95 luminance should stay readable, got ${sceneLuminance.p95}`);

  console.log(JSON.stringify(snap, null, 2));
  console.log('Focus camera readability contract passed.');
} finally {
  await browser.close();
}
