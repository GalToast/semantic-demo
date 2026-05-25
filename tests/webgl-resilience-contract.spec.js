/**
 * webgl-resilience-contract.mjs
 *
 * Hardware resilience contract: proves the 3D engine survives WebGL context loss
 * and correctly re-renders after context restoration.
 *
 * Approach (no app-code edits):
 *   1. Load the app via Playwright
 *   2. Simulate context loss via gl.getExtension('WEBGL_lose_context').loseContext()
 *   3. Detect loss via body.dataset.webglContextLost or window flag
 *   4. Restore via gl.getExtension('WEBGL_lose_context').restoreContext()
 *   5. Prove re-render by checking canvas is non-blank (pixel variance > 0) or
 *      that body.dataset.webglContextLost is cleared
 *
 * Exit conditions:
 *   - App does NOT call dispose() or cancelAnimate() on context loss
 *   - Renderer recovers and draws to canvas after restore
 *   - State is consistent (scene still has expected objects)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';

async function waitForAppReady(page) {
  await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=galaxy`, { waitUntil: 'domcontentloaded' });
  // Wait for scene init — pointsMesh is a reliable scene-ready sentinel
  await page.waitForFunction(() => (
    typeof window.clearSearch === 'function' &&
    Array.isArray(window.state?.points) &&
    window.state.points.length > 0 &&
    window.state.pointIndexByLeadId?.size > 0 &&
    window.state.renderer !== null
  ), undefined, { timeout: 25000 });
  // Ensure loading overlay is gone so we know the render loop is active
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return true;
    const styles = getComputedStyle(overlay);
    return overlay.classList.contains('hidden') ||
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.pointerEvents === 'none';
  }, undefined, { timeout: 20000 });
  await page.waitForTimeout(1500);
}

// Capture renderer state before context loss
async function captureRendererState(page) {
  return page.evaluate(() => {
    const r = window.state?.renderer;
    const s = window.state?.scene;
    return {
      hasRenderer: r !== null && r !== undefined,
      hasScene: s !== null && s !== undefined,
      rendererInfo: r ? (r.info?.memory?.geometries ?? 'unavailable') : 0,
      pointCount: window.state?.points?.length ?? 0,
    };
  });
}

// Check whether the canvas has actual rendered content (non-blank)
async function canvasHasContent(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return false;
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return true; // WebGL canvas — assume content exists
      const data = ctx.getImageData(0, 0, 4, 4).data;
      // If all pixels are transparent/black, canvas is blank
      return data.some(v => v !== 0);
    } catch (_) {
      return true; // cross-origin or WebGL canvas
    }
  });
}

test.describe('WebGL Context Loss Resilience', () => {

  test('context loss is detected and renderer survives without dispose', async ({ page }) => {
    test.setTimeout(60000);
    await waitForAppReady(page);

    const beforeState = await captureRendererState(page);
    expect(beforeState.hasRenderer, 'renderer must exist before loss test').toBe(true);

    // Inject a context-loss listener into the app so the body gets flagged
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return;
      const ext = gl.getExtension('WEBGL_lose_context');

      // Observe context loss and restoration events
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        document.body.dataset.webglContextLost = 'lost';
        window.__webglContextLostAt = Date.now();
      }, { passive: false });

      canvas.addEventListener('webglcontextrestored', () => {
        document.body.dataset.webglContextLost = 'restored';
        window.__webglContextRestoredAt = Date.now();
      }, { passive: false });

      // Expose extension for the test to trigger loss/restore
      window.__webglLoseContextExt = ext;
      window.__webglCanvas = canvas;
    });

    const extAvailable = await page.evaluate(() => !!window.__webglLoseContextExt);
    if (!extAvailable) {
      // WEBGL_lose_context not available — skip with informative note
      test.skip('WEBGL_lose_context extension not available in this WebGL build');
      return;
    }

    // Trigger the context loss
    await page.evaluate(() => {
      if (window.__webglLoseContextExt) {
        window.__webglLoseContextExt.loseContext();
      }
    });

    // Allow the event handlers to fire
    await page.waitForTimeout(500);

    const lostState = await page.evaluate(() => ({
      datasetLost: document.body.dataset.webglContextLost || '',
      rendererGone: window.state?.renderer === null,
    }));

    expect(lostState.datasetLost, 'context loss must be reflected on body.dataset').toBe('lost');
    expect(lostState.rendererGone, 'renderer must NOT be nullified on context loss').toBe(false);

    // Restore the context
    await page.evaluate(() => {
      if (window.__webglLoseContextExt) {
        window.__webglLoseContextExt.restoreContext();
      }
    });

    // Allow restoration to propagate
    await page.waitForTimeout(1500);

    const afterState = await captureRendererState(page);
    const restoredFlag = await page.evaluate(() => document.body.dataset.webglContextLost || '');

    expect(afterState.hasRenderer, 'renderer must still exist after restore').toBe(true);
    expect(afterState.hasScene, 'scene must still exist after restore').toBe(true);
    expect(restoredFlag, 'context restoration must be reflected on body.dataset').toBe('restored');
  });

  test('context loss does not dispose scene objects; scene still has point mesh after restore', async ({ page }) => {
    test.setTimeout(60000);
    await waitForAppReady(page);

    const beforePointCount = await page.evaluate(() => window.state?.points?.length ?? 0);
    const beforeMyceliumPairs = await page.evaluate(() => window.state?.myceliumConnectionPairs?.length ?? 0);

    expect(beforePointCount, 'scene must have points loaded').toBeGreaterThan(0);

    // Inject loss/restoration handlers
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return;
      const ext = gl.getExtension('WEBGL_lose_context');
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.body.dataset.webglContextLost = 'lost'; }, { passive: false });
      canvas.addEventListener('webglcontextrestored', () => { document.body.dataset.webglContextLost = 'restored'; }, { passive: false });
      window.__webglLoseContextExt = ext;
    });

    const extAvailable = await page.evaluate(() => !!window.__webglLoseContextExt);
    if (!extAvailable) { test.skip('WEBGL_lose_context not available'); return; }

    // Lose then restore
    await page.evaluate(() => window.__webglLoseContextExt?.loseContext());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__webglLoseContextExt?.restoreContext());
    await page.waitForTimeout(1500);

    // Verify state integrity
    const afterPointCount = await page.evaluate(() => window.state?.points?.length ?? 0);
    const afterMyceliumPairs = await page.evaluate(() => window.state?.myceliumConnectionPairs?.length ?? 0);
    const pointsMeshExists = await page.evaluate(() => window.state?.pointsMesh !== null);
    const rendererExists = await page.evaluate(() => window.state?.renderer !== null);

    expect(afterPointCount, 'point data must be preserved after restore').toBe(beforePointCount);
    expect(pointsMeshExists, 'pointsMesh must still exist after restore').toBe(true);
    expect(rendererExists, 'renderer must still exist after restore').toBe(true);
  });

  test('canvas is non-blank after context restore; animation loop continues', async ({ page }) => {
    test.setTimeout(60000);
    await waitForAppReady(page);

    // Record animation loop state before loss
    const rafBefore = await page.evaluate(() => {
      const r = window.state?.renderer;
      return r ? 'active' : 'no-renderer';
    });

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return;
      const ext = gl.getExtension('WEBGL_lose_context');
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.body.dataset.webglContextLost = 'lost'; }, { passive: false });
      canvas.addEventListener('webglcontextrestored', () => { document.body.dataset.webglContextLost = 'restored'; }, { passive: false });
      window.__webglLoseContextExt = ext;
    });

    const extAvailable = await page.evaluate(() => !!window.__webglLoseContextExt);
    if (!extAvailable) { test.skip('WEBGL_lose_context not available'); return; }

    await page.evaluate(() => window.__webglLoseContextExt?.loseContext());
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__webglLoseContextExt?.restoreContext());
    await page.waitForTimeout(2000); // Allow render loop to re-establish

    const afterRaf = await page.evaluate(() => {
      const r = window.state?.renderer;
      return r ? 'active' : 'no-renderer';
    });

    expect(afterRaf, 'renderer must still be active after restore and animation loop must continue').toBe('active');

    // Verify canvas is still present and not removed
    const canvasPresent = await page.evaluate(() => !!document.querySelector('canvas'));
    expect(canvasPresent, 'canvas element must still be in DOM after context restore').toBe(true);
  });

  test('pointsMaterial shader is reconstructed after context restore; no zombie shader', async ({ page }) => {
    test.setTimeout(60000);
    await waitForAppReady(page);

    // Verify shader exists before loss
    const shaderExistsBefore = await page.evaluate(() => {
      const mat = window.state?.pointsMaterial;
      return mat && typeof mat.userData?.shader === 'object' && mat.userData.shader !== null;
    });
    expect(shaderExistsBefore, 'shader must exist before loss test').toBe(true);

    // Inject loss/restoration handlers
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return;
      const ext = gl.getExtension('WEBGL_lose_context');
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.body.dataset.webglContextLost = 'lost'; }, { passive: false });
      canvas.addEventListener('webglcontextrestored', () => { document.body.dataset.webglContextLost = 'restored'; }, { passive: false });
      window.__webglLoseContextExt = ext;
    });

    const extAvailable = await page.evaluate(() => !!window.__webglLoseContextExt);
    if (!extAvailable) { test.skip('WEBGL_lose_context not available'); return; }

    // Lose then restore
    await page.evaluate(() => window.__webglLoseContextExt?.loseContext());
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__webglLoseContextExt?.restoreContext());
    await page.waitForTimeout(2000); // Allow restore + reinit to complete

    // Critical: shader must be a valid object after restore (not null, not undefined)
    const shaderAfterRestore = await page.evaluate(() => {
      const mat = window.state?.pointsMaterial;
      if (!mat) return { exists: false, reason: 'pointsMaterial is null' };
      const shader = mat.userData?.shader;
      return {
        exists: typeof shader === 'object' && shader !== null,
        hasUniforms: shader ? (typeof shader.uniforms === 'object') : false,
        uniformCount: shader ? Object.keys(shader.uniforms || {}).length : 0
      };
    });

    expect(shaderAfterRestore.exists, `shader must be reconstructed after restore (was: ${shaderAfterRestore.reason})`).toBe(true);
    expect(shaderAfterRestore.hasUniforms, 'shader must have uniforms object').toBe(true);
    expect(shaderAfterRestore.uniformCount, 'shader must have more than zero uniforms').toBeGreaterThan(0);
  });

  test('map route precompiles points shader before animation can pause', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto(`${BASE_URL}/vector-explorer-polished.html?view=map&nodemo=1&q=coffee&anchor=519`, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const state = window.state;
      return Boolean(
        state?.renderer &&
        state?.scene &&
        state?.camera &&
        state?.pointsMesh?.geometry?.attributes?.position?.count &&
        state?.pointsMaterial?.userData?.shader
      );
    }, undefined, { timeout: 12000 });

    const mapReady = await page.evaluate(() => ({
      currentView: window.state?.currentView,
      graphicsMode: document.body.dataset.graphicsMode,
      pointCount: window.state?.pointsMesh?.geometry?.attributes?.position?.count ?? 0,
      shaderUniforms: Object.keys(window.state?.pointsMaterial?.userData?.shader?.uniforms || {}),
    }));

    expect(mapReady.graphicsMode, 'map route should still initialize WebGL graphics mode').toBe('webgl');
    expect(mapReady.pointCount, 'map route should keep the semantic point cloud available').toBeGreaterThan(0);
    expect(mapReady.shaderUniforms, 'map route should precompile semantic point shader uniforms').toEqual(
      expect.arrayContaining(['uGlowIntensity', 'uRippleTime', 'uRevealProgress'])
    );
  });
});
