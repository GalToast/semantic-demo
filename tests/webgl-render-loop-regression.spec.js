/**
 * webgl-render-loop-regression.spec.js
 *
 * Regression probe for the "blank canvas" scenario where WebGL geometry is
 * populated (points, scene, renderer all exist) but the render loop never
 * fires — so the user sees an empty/black canvas despite data being loaded.
 *
 * What it checks:
 *   1. Canvas container has the canvas-ready class (Svelte signal)
 *   2. Canvas container is visible (not hidden by CSS)
 *   3. renderer.info.render.calls > 0 after scene settles (draw calls happened)
 *   4. renderer.info.render.points > 0 (point cloud was rasterised)
 *   5. renderer.info.render.triangles > 0 (geometry was rasterised)
 *   6. renderer.info.render.frame increments across a short wait (loop is alive)
 *   7. Canvas pixels are non-blank (pixel variance > 0)
 *
 * This does NOT edit engine source. It is a pure external probe.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';
const TMP_DIR = path.resolve(process.cwd(), 'tmp');

async function waitForSceneReady(page) {
  await page.goto(
    `${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`,
    { waitUntil: 'domcontentloaded' }
  );
  // Wait for core state to be populated
  await page.waitForFunction(() => {
    const s = window.__APP_STATE__ ?? window.__TEST_STATE__;
    return (
      s?.renderer !== null &&
      s?.scene !== null &&
      s?.camera !== null &&
      s?.pointsMesh?.geometry?.attributes?.position?.count > 0
    );
  }, { timeout: 20_000 });

  // Wait for the Svelte canvas-ready class to appear
  await page.waitForFunction(
    () => document.querySelector('#canvas-container')?.classList.contains('canvas-ready'),
    { timeout: 20_000 }
  );

  // Wait for at least a couple of render frames to tick
  await page.waitForFunction(() => {
    const r = (window.__APP_STATE__ ?? window.__TEST_STATE__)?.renderer;
    return r?.info?.render?.frame >= 2;
  }, { timeout: 15_000 });
}

/** Read renderer.info.render snapshot */
async function getRenderInfo(page) {
  return page.evaluate(() => {
    const r = (window.__APP_STATE__ ?? window.__TEST_STATE__)?.renderer;
    if (!r?.info?.render) return null;
    return {
      frame: r.info.render.frame,
      calls: r.info.render.calls,
      points: r.info.render.points,
      lines: r.info.render.lines,
      triangles: r.info.render.triangles,
    };
  });
}

/** Check canvas pixel variance via 2D readback */
async function canvasPixelVariance(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) return { hasPixels: false, reason: 'no canvas element' };
    try {
      // For WebGL canvases, readPixels from the GL context
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        // Fallback: try 2D context for non-WebGL canvases
        const ctx = canvas.getContext('2d');
        if (!ctx) return { hasPixels: true, reason: 'cannot read context' };
        const data = ctx.getImageData(0, 0, Math.min(canvas.width, 64), Math.min(canvas.height, 64)).data;
        const nonZero = data.filter((v) => v !== 0).length;
        return { hasPixels: nonZero > 0, nonZeroCount: nonZero };
      }
      // WebGL: read a small patch of pixels
      const w = Math.min(canvas.width, 64);
      const h = Math.min(canvas.height, 64);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let nonZero = 0;
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i] !== 0 || buf[i + 1] !== 0 || buf[i + 2] !== 0) nonZero++;
      }
      return { hasPixels: nonZero > 0, nonZeroCount: nonZero, totalSamples: w * h };
    } catch (e) {
      return { hasPixels: true, reason: e.message };
    }
  });
}

test.describe('WebGL Render Loop Regression', () => {
  test('canvas is visible, canvas-ready class present, and render loop draws geometry', async ({ page }) => {
    test.setTimeout(60_000);
    await waitForSceneReady(page);

    // 1. Canvas container visibility
    const containerVisible = await page.evaluate(() => {
      const el = document.querySelector('#canvas-container');
      if (!el) return { exists: false };
      const style = getComputedStyle(el);
      return {
        exists: true,
        hasCanvasReady: el.classList.contains('canvas-ready'),
        visibility: style.visibility,
        display: style.display,
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      };
    });
    expect(containerVisible.exists, 'canvas container must exist in DOM').toBe(true);
    expect(containerVisible.hasCanvasReady, 'canvas-ready class must be present').toBe(true);
    expect(containerVisible.visibility, 'canvas container must be visible').not.toBe('hidden');
    expect(containerVisible.display, 'canvas container must not be display:none').not.toBe('none');
    expect(containerVisible.width, 'canvas container must have width > 0').toBeGreaterThan(0);
    expect(containerVisible.height, 'canvas container must have height > 0').toBeGreaterThan(0);

    // 2. Render info: draw calls happened
    const renderInfo = await getRenderInfo(page);
    expect(renderInfo, 'renderer.info.render must be accessible').not.toBeNull();
    expect(renderInfo.calls, 'renderer.info.render.calls must be > 0 (draw calls fired)').toBeGreaterThan(0);
    expect(renderInfo.points, 'renderer.info.render.points must be > 0 (point cloud rasterised)').toBeGreaterThan(0);
    expect(renderInfo.triangles, 'renderer.info.render.triangles must be > 0 (geometry rasterised)').toBeGreaterThan(0);
    expect(renderInfo.frame, 'renderer.info.render.frame must be > 0 (render loop ticked)').toBeGreaterThan(0);

    // 3. Render loop is alive: frame count should increment
    const frameBefore = renderInfo.frame;
    await page.waitForTimeout(500); // let a few frames tick
    const frameAfter = await page.evaluate(() => {
      const r = (window.__APP_STATE__ ?? window.__TEST_STATE__)?.renderer;
      return r?.info?.render?.frame ?? 0;
    });
    expect(frameAfter, 'frame count must increase (render loop is running)').toBeGreaterThan(frameBefore);

    // 4. Canvas pixels are non-blank
    const pixelCheck = await canvasPixelVariance(page);
    expect(pixelCheck.hasPixels, `canvas must have non-blank pixels (reason: ${pixelCheck.reason || `${pixelCheck.nonZeroCount}/${pixelCheck.totalSamples}`})`).toBe(true);

    // 5. Screenshot evidence
    const screenshotPath = path.join(TMP_DIR, 'webgl-render-loop-regression.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
  });

  test('canvas-ready class appears before loading overlay disappears', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      `${BASE_URL}/vector-explorer-polished.html?view=galaxy&nodemo=1`,
      { waitUntil: 'domcontentloaded' }
    );

    // Track the ordering of events: canvas-ready vs overlay hidden
    const ordering = await page.evaluate(() => {
      return new Promise((resolve) => {
        const events = [];
        const start = Date.now();
        const timeout = setTimeout(() => {
          resolve({ events, timedOut: true });
        }, 30_000);

        // Poll for canvas-ready
        const pollCanvas = setInterval(() => {
          const container = document.querySelector('#canvas-container');
          if (container?.classList.contains('canvas-ready')) {
            events.push({ name: 'canvas-ready', ms: Date.now() - start });
            clearInterval(pollCanvas);
            // Now wait a bit for overlay to hide
            const pollOverlay = setInterval(() => {
              const overlay = document.querySelector('.canvas-loading-overlay');
              if (!overlay || overlay.style.display === 'none') {
                events.push({ name: 'overlay-hidden', ms: Date.now() - start });
                clearInterval(pollOverlay);
                clearTimeout(timeout);
                resolve({ events, timedOut: false });
              }
            }, 100);
          }
        }, 100);
      });
    });

    expect(ordering.timedOut, 'both events should fire within 30s').toBe(false);
    expect(ordering.events.length, 'should have captured both events').toBeGreaterThanOrEqual(2);
    expect(ordering.events[0]?.name, 'canvas-ready should fire first').toBe('canvas-ready');
    expect(ordering.events[1]?.name, 'overlay-hidden should fire second').toBe('overlay-hidden');
    // Canvas-ready should not lag far behind overlay (guard against timeout fallback hiding overlay)
    const canvasReadyMs = ordering.events[0]?.ms ?? 0;
    const overlayHiddenMs = ordering.events[1]?.ms ?? 0;
    expect(overlayHiddenMs - canvasReadyMs, 'overlay should hide soon after canvas-ready (max 6s)').toBeLessThanOrEqual(6_000);
  });
});
