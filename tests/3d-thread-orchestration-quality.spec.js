/**
 * 3d-thread-orchestration-quality.spec.js
 *
 * Deterministic quality contract for 3D thread orchestration:
 * continuity / density / opacity / luminance / performance guardrails
 * across overview, focus, and step-inside (semantic-dive) states.
 *
 * Exposed tools (read from window.state):
 *   myceliumCoreLines      - core thread LineSegments geometry + material.opacity
 *   myceliumWispyLines    - wispy thread LineSegments geometry + material.opacity
 *   myceliumBridgeLines   - bridge thread LineSegments geometry + material.opacity
 *   semanticLensSpokes    - spoke geometry: attributes.alpha, attributes.position
 *   semanticLensGroup     - group visible flag
 *   semanticLensGlow      - glow material: uniforms.uOpacity.value
 *   focusedNode           - non-null when a node is focused
 *   trailDepth            - 0=overview, 1=focus, 2+=step-inside
 *   pointsMesh           - global point cloud (suppressed in focus/step-inside)
 *   pointsMesh.visible   - should be false in focus/step-inside
 *   renderer             - Three.js WebGLRenderer
 *   scene                - Three.js Scene
 *   scenePerformanceDiagnostics - { active } flag
 *
 * Visual metrics:
 *   sceneLuminance()      - samples a PNG screenshot, returns { median, p95, whiteRatio }
 *   continuitySample()   - samples paired vertices in a line geometry
 *
 * Run: npx playwright test tests/3d-thread-orchestration-quality.spec.js
 */

import { test, expect } from '@playwright/test';
import { inflateSync } from 'node:zlib';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';

function withParams(params = {}) {
  const url = new URL(`${BASE_URL.replace(/\/$/, '')}/vector-explorer-polished.html`);
  url.searchParams.set('nodemo', '1');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function waitForScene(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => {
    const state = window.state;
    const canvas = document.querySelector('#canvas-container canvas');
    return Boolean(
      canvas
      && document.body.dataset.graphicsMode === 'webgl'
      && state?.renderer
      && state?.scene
      && state?.pointsMesh?.geometry?.attributes?.position?.count
    );
  }, { timeout: 10000 });
  await page.waitForTimeout(1200);
}

// PNG RGBA parser — same technique as three-scene-playtest.mjs
// Accepts a Buffer (from screenshot()) or a file path string
function parsePngRgba(buffer) {
  const actualBuffer = Buffer.isBuffer(buffer) ? buffer : buffer;
  const sig = actualBuffer.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error('invalid PNG signature');
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (offset < actualBuffer.length) {
    const length = actualBuffer.readUInt32BE(offset);
    const type = actualBuffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = actualBuffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`unsupported PNG: bitDepth=${bitDepth} colorType=${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(idat));
  const rowBytes = width * bpp;
  const raw = Buffer.alloc(width * height * bpp);
  let input = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input++];
    const row = y * rowBytes, prev = row - rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bpp ? raw[row + x - bpp] : 0;
      const up = y > 0 ? raw[prev + x] : 0;
      const upLeft = y > 0 && x >= bpp ? raw[prev + x - bpp] : 0;
      const value = inflated[input + x];
      raw[row + x] = (filter === 0 ? value : filter === 1 ? value + left : filter === 2 ? value + up : filter === 3 ? Math.floor((left + up) / 2) : value + paeth(left, up, upLeft)) & 255;
    }
    input += rowBytes;
  }
  return { width, height, raw, bpp };
}

// Compute luminance from a PNG Buffer (returned directly by playwright screenshot)
async function sceneLuminanceFromBuffer(buffer) {
  const { width, height, raw, bpp } = parsePngRgba(buffer);
  const x0 = Math.floor(width * 0.08), x1 = Math.ceil(width * 0.92);
  const y0 = Math.floor(height * 0.16), y1 = Math.ceil(height * 0.62);
  const luma = [];
  let white = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * bpp;
      const v = Math.round((raw[i] * 299 + raw[i + 1] * 587 + raw[i + 2] * 114) / 1000);
      luma.push(v);
      if (v >= 236) white += 1;
    }
  }
  luma.sort((a, b) => a - b);
  const at = (p) => luma[Math.min(luma.length - 1, Math.max(0, Math.floor((luma.length - 1) * p)))] || 0;
  return {
    median: at(0.5),
    p95: at(0.95),
    whiteRatio: Number((white / Math.max(1, luma.length)).toFixed(4))
  };
}

// Continuity sampling — same technique as three-scene-playtest.mjs
function continuitySample(line) {
  const values = Array.from(line?.geometry?.attributes?.position?.array || []);
  if (values.length < 30) return { checked: 0, matched: 0 };
  let checked = 0, matched = 0;
  for (let edgeStart = 0; edgeStart + 29 < values.length && checked < 18; edgeStart += 30) {
    for (let vertex = 1; vertex < 9; vertex += 2) {
      const a = edgeStart + vertex * 3;
      const b = edgeStart + (vertex + 1) * 3;
      checked += 1;
      const eq = Math.abs(values[a] - values[b]) < 0.0001
        && Math.abs(values[a + 1] - values[b + 1]) < 0.0001
        && Math.abs(values[a + 2] - values[b + 2]) < 0.0001;
      if (eq) matched += 1;
    }
  }
  return { checked, matched };
}

// Probe all thread state from the running page
async function probeThreads(page) {
  return page.evaluate(() => {
    const state = window.state || {};
    const coreLine = state.myceliumCoreLines;
    const wispyLine = state.myceliumWispyLines;
    const bridgeLine = state.myceliumBridgeLines;
    const alphaArr = Array.from(state.semanticLensSpokes?.geometry?.attributes?.alpha?.array || []);
    const posArr = Array.from(state.semanticLensSpokes?.geometry?.attributes?.position?.array || []);
    const diag = state.scenePerformanceDiagnostics;

    // Inline continuitySample — can't reference Node.js closures inside page.evaluate
    const sampleContinuity = (line) => {
      const values = Array.from(line?.geometry?.attributes?.position?.array || []);
      if (values.length < 30) return { checked: 0, matched: 0 };
      let checked = 0, matched = 0;
      for (let edgeStart = 0; edgeStart + 29 < values.length && checked < 18; edgeStart += 30) {
        for (let vertex = 1; vertex < 9; vertex += 2) {
          const a = edgeStart + vertex * 3;
          const b = edgeStart + (vertex + 1) * 3;
          checked += 1;
          const eq = Math.abs(values[a] - values[b]) < 0.0001
            && Math.abs(values[a + 1] - values[b + 1]) < 0.0001
            && Math.abs(values[a + 2] - values[b + 2]) < 0.0001;
          if (eq) matched += 1;
        }
      }
      return { checked, matched };
    };

    return {
      // thread presence
      coreExists: Boolean(coreLine?.geometry?.attributes?.position?.count > 0),
      wispyExists: Boolean(wispyLine?.geometry?.attributes?.position?.count > 0),
      bridgeExists: Boolean(bridgeLine?.geometry?.attributes?.position?.count > 0),
      // segment counts
      coreSegments: coreLine?.geometry?.attributes?.position?.count || 0,
      wispySegments: wispyLine?.geometry?.attributes?.position?.count || 0,
      bridgeSegments: bridgeLine?.geometry?.attributes?.position?.count || 0,
      // opacity
      coreOpacity: coreLine?.material?.opacity ?? null,
      wispyOpacity: wispyLine?.material?.opacity ?? null,
      bridgeOpacity: bridgeLine?.material?.opacity ?? null,
      // continuity (inlined above)
      coreContinuity: sampleContinuity(coreLine),
      wispyContinuity: sampleContinuity(wispyLine),
      bridgeContinuity: sampleContinuity(bridgeLine),
      // semantic lens spokes
      spokeAlphaNonZero: alphaArr.filter(v => v > 0).length,
      spokePositionNonZero: posArr.filter(v => Math.abs(v) > 0.0001).length,
      // visibility
      pointsMeshVisible: state.pointsMesh?.visible ?? null,
      pointsMeshCount: state.pointsMesh?.geometry?.attributes?.position?.count || 0,
      semanticLensVisible: Boolean(state.semanticLensGroup?.visible),
      semanticLensGlowOpacity: state.semanticLensGlow?.material?.uniforms?.uOpacity?.value ?? 0,
      // state flags
      focusedNode: state.focusedNode ?? null,
      trailDepth: state.trailDepth ?? null,
      // performance diagnostics
      diagActive: diag?.active ?? null,
      diagMemoryGeometries: state.renderer?.info?.memory?.geometries ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('3D thread orchestration quality', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });

  // -------------------------------------------------------------------------
  // Overview state — threads are present, legible, not overbright
  // -------------------------------------------------------------------------
  test('overview: core threads present, continuous, and not overbright', async ({ page }) => {
    test.setTimeout(60000);
    const p = page;
    await p.goto(withParams({ view: 'galaxy' }), { waitUntil: 'commit' });
    await waitForScene(p);
    await p.waitForFunction(
      () => Boolean(window.state?.myceliumCoreLines?.geometry?.attributes?.position?.array?.length),
      { timeout: 5000 }
    ).catch(() => {});

    const probe = await probeThreads(p);
    const screenshot = await p.screenshot({ fullPage: false });
    const lum = await sceneLuminanceFromBuffer(screenshot);

    // Threads must exist
    expect(probe.coreExists, 'core thread must exist in overview').toBe(true);

    // Segments must be non-trivial (not empty, not degenerate)
    expect(probe.coreSegments, 'core thread must have segments').toBeGreaterThan(10);

    // Continuity: all sampled pairs must match (paired vertices are equal = continuous thread)
    expect(probe.coreContinuity.checked, 'continuity must be sampled').toBeGreaterThan(0);
    expect(probe.coreContinuity.matched, 'all sampled core pairs must be continuous')
      .toBe(probe.coreContinuity.checked);

    // Not overbright: cap allows current high-DPI renderer bloom while still
    // catching washed-out thread fields.
    expect(lum.p95, `overview p95 luminance too high: ${lum.p95}`).toBeLessThanOrEqual(230);

    // White pixel ratio capped at 8%
    expect(lum.whiteRatio, `overview white pixel ratio too high: ${lum.whiteRatio}`).toBeLessThanOrEqual(0.08);

    // Opacity must be in a legible range (not invisible, not opaque)
    expect(probe.coreOpacity, 'core opacity must be set').toBeGreaterThan(0);
    expect(probe.coreOpacity, 'core opacity must be bounded (not overbearing)')
      .toBeLessThanOrEqual(0.30);

  });

  // -------------------------------------------------------------------------
  // Desktop overview — threads present and continuous (no mobile override)
  // -------------------------------------------------------------------------
  test('desktop overview: core threads present and continuous at 1440x900', async ({ page }) => {
    test.setTimeout(60000);
    const p = page;
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(withParams({ view: 'galaxy' }), { waitUntil: 'commit' });
    await waitForScene(p);
    await p.waitForFunction(
      () => Boolean(window.state?.myceliumCoreLines?.geometry?.attributes?.position?.array?.length),
      { timeout: 5000 }
    ).catch(() => {});

    const probe = await probeThreads(p);

    expect(probe.coreExists, 'core thread must exist on desktop overview').toBe(true);
    expect(probe.coreSegments, 'core thread must have segments').toBeGreaterThan(10);
    expect(probe.coreContinuity.checked, 'continuity must be sampled').toBeGreaterThan(0);
    expect(probe.coreContinuity.matched, 'all sampled core pairs must be continuous')
      .toBe(probe.coreContinuity.checked);
    // Opacity must be in a legible range (overview range, not invisible)
    expect(probe.coreOpacity, 'core opacity must be set').toBeGreaterThan(0);
    expect(probe.coreOpacity, 'core opacity must be bounded for overview')
      .toBeLessThanOrEqual(0.30);
  });

  // -------------------------------------------------------------------------
  // Focus state — point cloud suppressed, lens visible, threads elevated
  // -------------------------------------------------------------------------
  test('focus: global point cloud suppressed, lens visible, threads elevated', async ({ page }) => {
    test.setTimeout(60000);
    const p = page;
    await p.goto(withParams({ view: 'galaxy', q: 'coffee', anchor: '519' }), { waitUntil: 'commit' });
    await waitForScene(p);
    await p.waitForFunction(
      () => Boolean(window.state?.myceliumCoreLines?.geometry?.attributes?.position?.array?.length),
      { timeout: 5000 }
    ).catch(() => {});

    // Trigger focus on a node
    await p.evaluate(() => {
      const preferred = window.state?.pointIndexByLeadId?.get(519) ?? window.state?.pointIndexByLeadId?.get('519');
      let targetIndex = Number.isFinite(preferred) ? preferred : null;
      if (targetIndex === null) {
        for (const [leadId, threadNode] of window.state?.semanticNeighborMapByLeadId || []) {
          if (!threadNode?.neighbors?.length) continue;
          const idx = window.state?.pointIndexByLeadId?.get(leadId) ?? window.state?.pointIndexByLeadId?.get(String(leadId));
          if (Number.isFinite(idx)) { targetIndex = idx; break; }
        }
      }
      if (targetIndex === null) targetIndex = 0;
      window.focusOnNode?.(targetIndex, { fromSearchResult: true, skipUrlSync: true });
      window.setTrailDepth?.(1, { skipUrlSync: true });
    });
    await p.waitForFunction(() => Number.isFinite(window.state?.focusedNode), { timeout: 8000 });
    await p.waitForTimeout(1200);

    const probe = await probeThreads(p);
    const screenshot = await p.screenshot({ fullPage: false });
    const lum = await sceneLuminanceFromBuffer(screenshot);

    // Focused node must be set
    expect(probe.focusedNode, 'focusedNode must be set').not.toBeNull();
    expect(probe.focusedNode, 'focusedNode must be non-negative').toBeGreaterThanOrEqual(0);

    // Point cloud suppressed so the pocket owns the scene
    expect(probe.pointsMeshVisible, 'pointsMesh must be suppressed in focus mode').toBe(false);

    // Semantic lens visible
    expect(probe.semanticLensVisible, 'semantic lens must be visible in focus mode').toBe(true);

    // Lens glow opacity elevated
    expect(probe.semanticLensGlowOpacity, 'lens glow must be active in focus')
      .toBeGreaterThan(0.01);

    // Threads still present and continuous
    expect(probe.coreExists, 'core thread must persist in focus').toBe(true);
    expect(probe.coreContinuity.checked, 'continuity must be sampled').toBeGreaterThan(0);
    expect(probe.coreContinuity.matched, 'core pairs must be continuous in focus')
      .toBe(probe.coreContinuity.checked);

    // Not overbright in focus: stricter cap at 205
    expect(lum.p95, `focus p95 luminance too high: ${lum.p95}`).toBeLessThanOrEqual(205);
    expect(lum.whiteRatio, `focus white pixel ratio too high: ${lum.whiteRatio}`).toBeLessThanOrEqual(0.018);

    // Focus-mode opacities are higher; core should be near 0.28
    expect(probe.coreOpacity, 'core opacity must be elevated in focus').toBeGreaterThan(0.20);

  });

  // -------------------------------------------------------------------------
  // Step-inside / semantic-dive — trailDepth 2, spokes visible
  // -------------------------------------------------------------------------
  test('step-inside: trailDepth=2, spokes active, threads continuous', async ({ page }) => {
    test.setTimeout(60000);
    const p = page;
    await p.goto(withParams({ view: 'galaxy', q: 'coffee', anchor: '519' }), { waitUntil: 'commit' });
    await waitForScene(p);
    await p.waitForFunction(
      () => Boolean(window.state?.myceliumCoreLines?.geometry?.attributes?.position?.array?.length),
      { timeout: 5000 }
    ).catch(() => {});

    // Enter focus, then step inside
    await p.evaluate(() => {
      const preferred = window.state?.pointIndexByLeadId?.get(519) ?? window.state?.pointIndexByLeadId?.get('519');
      let targetIndex = Number.isFinite(preferred) ? preferred : null;
      if (targetIndex === null) {
        for (const [leadId, threadNode] of window.state?.semanticNeighborMapByLeadId || []) {
          if (!threadNode?.neighbors?.length) continue;
          const idx = window.state?.pointIndexByLeadId?.get(leadId) ?? window.state?.pointIndexByLeadId?.get(String(leadId));
          if (Number.isFinite(idx)) { targetIndex = idx; break; }
        }
      }
      if (targetIndex === null) targetIndex = 0;
      window.focusOnNode?.(targetIndex, { fromSearchResult: true, skipUrlSync: true });
      window.setTrailDepth?.(1, { skipUrlSync: true });
    });
    await p.waitForFunction(() => Number.isFinite(window.state?.focusedNode), { timeout: 8000 });
    await p.waitForTimeout(1200);

    await p.evaluate(() => {
      window.setTrailDepth?.(2, { fromUserGesture: true });
    });
    await p.waitForTimeout(1200);

    const probe = await probeThreads(p);

    // trailDepth must be 2
    expect(probe.trailDepth, 'trailDepth must be 2 in step-inside').toBe(2);

    // Spokes must have non-zero alpha (visible relationship indicators)
    expect(probe.spokeAlphaNonZero, 'spokes must have non-zero alpha in step-inside')
      .toBeGreaterThanOrEqual(2);

    // Spoke positions must be non-zero (geometry is populated)
    expect(probe.spokePositionNonZero, 'spokes must have non-zero positions in step-inside')
      .toBeGreaterThanOrEqual(3);

    // Threads still continuous
    expect(probe.coreContinuity.checked, 'continuity must be sampled').toBeGreaterThan(0);
    expect(probe.coreContinuity.matched, 'core pairs must be continuous in step-inside')
      .toBe(probe.coreContinuity.checked);

  });

  // -------------------------------------------------------------------------
  // Performance guardrail — diagnostics exist and are finite
  // -------------------------------------------------------------------------
  test('performance: scenePerformanceDiagnostics is active and finite', async ({ page }) => {
    test.setTimeout(60000);
    const p = page;
    await p.goto(withParams({ view: 'galaxy' }), { waitUntil: 'commit' });
    await waitForScene(p);

    const probe = await probeThreads(p);

    // Diagnostics must be present
    expect(probe.diagActive, 'scenePerformanceDiagnostics.active must be set').not.toBeNull();

    // Renderer memory (geometries) must be a known finite number
    expect(typeof probe.diagMemoryGeometries, 'geometry count must be numeric').toBe('number');
    expect(probe.diagMemoryGeometries, 'geometry count must be non-negative').toBeGreaterThanOrEqual(0);
    // Must not be a runaway allocation (sanity cap at 5000 for this workload)
    expect(probe.diagMemoryGeometries, 'geometry count must be bounded').toBeLessThan(5000);

  });
});
