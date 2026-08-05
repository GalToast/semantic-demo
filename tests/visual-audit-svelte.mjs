/**
 * Visual Audit: 3D Mycelium Scene on Svelte dev server
 * Comprehensive headed Playwright audit with screenshots, console logs, and performance metrics.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SCREENSHOT_DIR = join(process.cwd(), 'reports', 'screenshots', 'playwright');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const SVELTE_URL = 'http://localhost:5173/';
const LEGACY_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';
// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'

const results = {
  console: { errors: [], warnings: [], info: [] },
  network: { failed: [], timing: {} },
  screenshots: [],
  metrics: {},
  checks: {},
  issues: [],
  legacy: {},
};

async function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

async function captureScreenshot(page, name, opts = {}) {
  const path = join(SCREENSHOT_DIR, `audit-${name}.png`);
  await page.screenshot({ path, fullPage: false, ...opts });
  results.screenshots.push({ name, path });
  await log(`  📸 Screenshot: ${name}`);
  return path;
}

async function waitForWebGL(page, timeoutMs = 30000) {
  await log('Waiting for WebGL initialization...');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ready = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { ready: false, reason: 'no canvas' };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { ready: false, reason: 'no GL context' };
      return {
        ready: true,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        renderer: gl.getParameter(gl.RENDERER),
      };
    }).catch(() => ({ ready: false, reason: 'evaluate failed' }));
    if (ready.ready) {
      await log(`  ✅ WebGL ready: ${ready.canvasWidth}x${ready.canvasHeight} (${ready.renderer})`);
      return ready;
    }
    await page.waitForTimeout(500);
  }
  await log('  ⚠️  WebGL not detected within timeout');
  return { ready: false, reason: 'timeout' };
}

async function waitForSceneLoaded(page, timeoutMs = 45000) {
  await log('Waiting for scene data load (8406 points)...');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => {
      // Check for global state indicators
      const w = window;
      const stateObj = w.__semanticState || w.__svelte_app_state || null;
      const canvas = document.querySelector('canvas');
      const pixelCount = canvas ? canvas.width * canvas.height : 0;
      // Check if Three.js scene is populated
      const threeRenderer = document.querySelector('canvas')?.__r$;
      return {
        hasCanvas: !!canvas,
        canvasPixels: pixelCount,
        hasState: !!stateObj,
        bodyDataAttrs: Object.fromEntries(
          Array.from(document.body.attributes)
            .filter(a => a.name.startsWith('data-'))
            .map(a => [a.name, a.value])
        ),
        elementCount: document.querySelectorAll('*').length,
      };
    });
    if (state.hasCanvas && state.elementCount > 10) {
      await log(`  ✅ Scene loaded: ${state.elementCount} DOM elements, canvas ${state.canvasPixels}px`);
      return state;
    }
    await page.waitForTimeout(1000);
  }
  await log('  ⚠️  Scene may not be fully loaded');
  return null;
}

async function evaluateSceneState(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const w = window;
    
    // Try to get Three.js scene info
    let threeInfo = null;
    try {
      // Look for Three.js renderer in various locations
      const renderer = canvas?.__r$ || w.__threeRenderer;
      if (renderer) {
        threeInfo = {
          type: renderer.constructor?.name || 'unknown',
          width: renderer.domElement?.width || 0,
          height: renderer.domElement?.height || 0,
          antialias: renderer.capabilities?.isWebGL2 ?? null,
        };
      }
    } catch (e) { /* ignore */ }

    // Get bounding rect of canvas
    const canvasRect = canvas?.getBoundingClientRect();

    // Get all visible elements and their z-index layers
    const visibleOverlays = [];
    document.querySelectorAll('[class*="panel"], [class*="overlay"], [class*="card"], [class*="legend"], [class*="search"], [class*="journey"], [class*="compass"]').forEach(el => {
      const style = getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        visibleOverlays.push({
          tag: el.tagName,
          className: el.className.toString().slice(0, 80),
          id: el.id,
          display: style.display,
          position: style.position,
          zIndex: style.zIndex,
          opacity: style.opacity,
          rect: el.getBoundingClientRect(),
        });
      }
    });

    // Check body data attributes
    const bodyAttrs = {};
    for (const attr of document.body.attributes) {
      if (attr.name.startsWith('data-')) bodyAttrs[attr.name] = attr.value;
    }

    return {
      canvasPresent: !!canvas,
      canvasRect: canvasRect ? { x: canvasRect.x, y: canvasRect.y, w: canvasRect.width, h: canvasRect.height } : null,
      threeInfo,
      bodyAttrs,
      visibleOverlays,
      documentTitle: document.title,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
}

async function getPerformanceMetrics(page) {
  return await page.evaluate(() => {
    const perf = performance;
    const entries = perf.getEntriesByType('navigation');
    const nav = entries[0] || {};
    
    // Check FPS from requestAnimationFrame timing
    return {
      navigationTiming: {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        loadEvent: Math.round(nav.loadEventEnd || 0),
        domInteractive: Math.round(nav.domInteractive || 0),
      },
      memoryEstimate: perf.memory ? {
        usedJSHeapSize: Math.round(perf.memory.usedJSHeapSize / 1024 / 1024),
        totalJSHeapSize: Math.round(perf.memory.totalJSHeapSize / 1024 / 1024),
        jsHeapSizeLimit: Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024),
      } : null,
      resourceCount: perf.getEntriesByType('resource').length,
    };
  });
}

async function measureFPS(page, durationMs = 3000) {
  return await page.evaluate((dur) => {
    return new Promise(resolve => {
      let frames = 0;
      const start = performance.now();
      function tick() {
        frames++;
        if (performance.now() - start < dur) {
          requestAnimationFrame(tick);
        } else {
          const elapsed = performance.now() - start;
          resolve({ fps: Math.round(frames / (elapsed / 1000)), frames, elapsedMs: Math.round(elapsed) });
        }
      }
      requestAnimationFrame(tick);
    });
  }, durationMs);
}

async function testCameraOrbit(page) {
  await log('Testing camera orbit...');
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) return { error: 'no canvas' };
  
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  
  // Get initial camera state
  const before = await page.evaluate(() => {
    const cam = window.__semanticState?.camera || window.__threeCamera;
    return cam ? { position: { x: cam.position?.x, y: cam.position?.y, z: cam.position?.z } } : null;
  });

  // Drag to orbit
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 50, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(500);
  
  // Get after camera state
  const after = await page.evaluate(() => {
    const cam = window.__semanticState?.camera || window.__threeCamera;
    return cam ? { position: { x: cam.position?.x, y: cam.position?.y, z: cam.position?.z } } : null;
  });
  
  const moved = before && after && (
    Math.abs(before.position.x - after.position.x) > 0.01 ||
    Math.abs(before.position.y - after.position.y) > 0.01
  );
  
  await log(`  Camera orbit: ${moved ? '✅ moved' : '⚠️ no change detected'}`);
  return { before, after, moved };
}

async function testSearch(page) {
  await log('Testing search with ?q=coffee...');
  await page.goto(`${SVELTE_URL}?q=coffee`);
  await page.waitForTimeout(3000);
  
  const searchState = await page.evaluate(() => {
    const searchInput = document.querySelector('input[type="search"], input[placeholder*="earch"], .search-input, [data-search]');
    const results = document.querySelectorAll('.search-result, .result-row, [class*="result"]');
    return {
      inputPresent: !!searchInput,
      inputValue: searchInput?.value || '',
      resultCount: results.length,
      bodyAttrs: Object.fromEntries(
        Array.from(document.body.attributes)
          .filter(a => a.name.startsWith('data-'))
          .map(a => [a.name, a.value])
      ),
    };
  });
  
  await log(`  Search input: ${searchState.inputPresent ? '✅' : '❌'}, results: ${searchState.resultCount}`);
  return searchState;
}

async function testReducedMotion(page) {
  await log('Testing prefers-reduced-motion...');
  
  // Emulate reduced motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(1000);
  
  const reducedState = await page.evaluate(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return {
      prefersReducedMotion: mediaQuery.matches,
      anyAnimations: document.getAnimations?.().length || 0,
    };
  });
  
  await log(`  Reduced motion: ${reducedState.prefersReducedMotion ? '✅ active' : '❌ not active'}`);
  return reducedState;
}

async function testHoverInteraction(page) {
  await log('Testing hover on a field node...');
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) return { error: 'no canvas' };
  
  // Hover over the center of the canvas (likely near a node)
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(1500);
  
  const hoverState = await page.evaluate(() => {
    const tooltip = document.querySelector('.tooltip, [class*="tooltip"], [class*="hover-info"], [data-tooltip]');
    const highlighted = document.querySelector('.highlighted, .hovered, [data-hovered="true"]');
    const cursor = getComputedStyle(document.querySelector('canvas') || document.body).cursor;
    return {
      tooltipPresent: !!tooltip,
      tooltipContent: tooltip?.textContent?.slice(0, 200) || null,
      highlightedNode: !!highlighted,
      cursor,
    };
  });
  
  await log(`  Hover: tooltip=${hoverState.tooltipPresent ? '✅' : '⚠️ none'}, cursor=${hoverState.cursor}`);
  return hoverState;
}

async function testClickInteraction(page) {
  await log('Testing click on a field node...');
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) return { error: 'no canvas' };
  
  // Click center area
  const cx = box.x + box.width * 0.45;
  const cy = box.y + box.height * 0.45;
  
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(2000);
  
  const clickState = await page.evaluate(() => {
    const card = document.querySelector('.info-panel, .card, [class*="info-panel"], [class*="selected-card"], [data-panel]');
    const focusPocket = document.querySelector('.focus-pocket, [class*="focus-pocket"], [class*="constellation"]');
    const bodyAttrs = {};
    for (const attr of document.body.attributes) {
      if (attr.name.startsWith('data-')) bodyAttrs[attr.name] = attr.value;
    }
    return {
      cardPresent: !!card,
      cardContent: card?.textContent?.slice(0, 300) || null,
      focusPocketPresent: !!focusPocket,
      bodyAttrs,
    };
  });
  
  await log(`  Click: card=${clickState.cardPresent ? '✅' : '⚠️ none'}, focusPocket=${clickState.focusPocketPresent ? '✅' : '⚠️ none'}`);
  return clickState;
}

async function testJourneyMode(page) {
  await log('Testing journey mode...');
  // Try to activate journey mode via URL or button
  await page.goto(`${SVELTE_URL}?journey=1`);
  await page.waitForTimeout(3000);
  
  const journeyState = await page.evaluate(() => {
    const compass = document.querySelector('[class*="compass"], [class*="journey"], [data-journey]');
    const route = document.querySelector('[class*="route"], [class*="trail"], [class*="thread"]');
    const bodyAttrs = {};
    for (const attr of document.body.attributes) {
      if (attr.name.startsWith('data-')) bodyAttrs[attr.name] = attr.value;
    }
    return {
      compassPresent: !!compass,
      compassContent: compass?.textContent?.slice(0, 200) || null,
      routePresent: !!route,
      bodyAttrs,
    };
  });
  
  await log(`  Journey: compass=${journeyState.compassPresent ? '✅' : '⚠️ none'}, route=${journeyState.routePresent ? '✅' : '⚠️ none'}`);
  return journeyState;
}

// ═══════════════════════════════════════════
// Main Audit Runner
// ═══════════════════════════════════════════
async function runAudit() {
  await log('═══ Starting Visual Audit: 3D Mycelium Scene ═══');
  
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : []),
    ],
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  
  const page = await context.newPage();
  
  // Collect console messages
  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text(), location: msg.location() };
    if (msg.type() === 'error') results.console.errors.push(entry);
    else if (msg.type() === 'warning') results.console.warnings.push(entry);
    else results.console.info.push(entry);
  });
  
  // Collect page errors
  page.on('pageerror', err => {
    results.console.errors.push({ type: 'pageerror', text: err.message, stack: err.stack?.slice(0, 500) });
  });
  
  // Collect network failures
  page.on('requestfailed', req => {
    results.network.failed.push({ url: req.url(), failure: req.failure()?.errorText });
  });
  
  try {
    // ─── 1. Navigate to Svelte app ───
    await log('── Step 1: Navigate to Svelte dev server ──');
    const navStart = Date.now();
    await page.goto(SVELTE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    results.network.timing.svelteNav = Date.now() - navStart;
    await log(`  Navigation: ${results.network.timing.svelteNav}ms`);
    
    // ─── 2. Wait for WebGL ───
    await log('── Step 2: Wait for WebGL initialization ──');
    const webglInfo = await waitForWebGL(page);
    results.checks.webgl = webglInfo;
    
    // Wait a bit more for scene to fully populate
    await page.waitForTimeout(5000);
    
    // ─── 3. Wait for scene data ───
    await log('── Step 3: Wait for scene data ──');
    const sceneState = await waitForSceneLoaded(page);
    results.checks.sceneLoaded = sceneState;
    
    // ─── 4. Capture idle state ───
    await log('── Step 4: Capture idle/overview state ──');
    await page.waitForTimeout(2000); // Let animations settle
    const idleShot = await captureScreenshot(page, 'svelte-idle-overview');
    
    // ─── 5. Evaluate scene state ───
    await log('── Step 5: Evaluate scene state ──');
    const evalState = await evaluateSceneState(page);
    results.checks.sceneState = evalState;
    await log(`  Canvas: ${evalState.canvasRect ? `${evalState.canvasRect.w}x${evalState.canvasRect.h} at (${evalState.canvasRect.x},${evalState.canvasRect.y})` : 'not found'}`);
    await log(`  Body data attrs: ${JSON.stringify(evalState.bodyAttrs)}`);
    await log(`  Visible overlays: ${evalState.visibleOverlays.length}`);
    
    // ─── 6. Camera framing check ───
    await log('── Step 6: Camera framing check ──');
    const framing = await page.evaluate(() => {
      // Check if network appears centered (not upper-right legacy bug)
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'no canvas' };
      
      // Sample canvas pixels to check if points are distributed across viewport
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { error: 'no GL context for pixel sampling' };
      
      const w = canvas.width;
      const h = canvas.height;
      const samples = [
        { label: 'center', x: Math.floor(w/2), y: Math.floor(h/2) },
        { label: 'topLeft', x: Math.floor(w*0.2), y: Math.floor(h*0.2) },
        { label: 'topRight', x: Math.floor(w*0.8), y: Math.floor(h*0.2) },
        { label: 'bottomLeft', x: Math.floor(w*0.2), y: Math.floor(h*0.8) },
        { label: 'bottomRight', x: Math.floor(w*0.8), y: Math.floor(h*0.8) },
      ];
      
      const pixels = new Uint8Array(4);
      const results = {};
      for (const s of samples) {
        gl.readPixels(s.x, h - s.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        results[s.label] = { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3] };
      }
      
      // Check if any non-black pixels exist in each quadrant
      const hasContent = {};
      for (const [k, v] of Object.entries(results)) {
        hasContent[k] = v.r > 5 || v.g > 5 || v.b > 5;
      }
      
      return { pixelSamples: results, hasContent };
    });
    results.checks.cameraFraming = framing;
    await log(`  Camera framing samples: ${JSON.stringify(framing.hasContent || {})}`);
    
    // ─── 7. Performance metrics ───
    await log('── Step 7: Performance metrics ──');
    const perfMetrics = await getPerformanceMetrics(page);
    results.metrics.performance = perfMetrics;
    await log(`  Memory: ${JSON.stringify(perfMetrics.memoryEstimate)}`);
    await log(`  Resources loaded: ${perfMetrics.resourceCount}`);
    
    // ─── 8. FPS measurement ───
    await log('── Step 8: FPS measurement (3s) ──');
    const fps = await measureFPS(page, 3000);
    results.metrics.fps = fps;
    await log(`  FPS: ${fps.fps} (${fps.frames} frames in ${fps.elapsedMs}ms)`);
    
    // ─── 9. Test camera controls ───
    await log('── Step 9: Test camera controls ──');
    const orbitResult = await testCameraOrbit(page);
    results.checks.cameraOrbit = orbitResult;
    await captureScreenshot(page, 'svelte-after-orbit');
    
    // ─── 10. Test hover ───
    await log('── Step 10: Test hover interaction ──');
    const hoverResult = await testHoverInteraction(page);
    results.checks.hover = hoverResult;
    await captureScreenshot(page, 'svelte-hover');
    
    // ─── 11. Test click ───
    await log('── Step 11: Test click interaction ──');
    const clickResult = await testClickInteraction(page);
    results.checks.click = clickResult;
    await captureScreenshot(page, 'svelte-click-focus');
    
    // ─── 12. Test search ───
    await log('── Step 12: Test search ?q=coffee ──');
    const searchResult = await testSearch(page);
    results.checks.search = searchResult;
    await captureScreenshot(page, 'svelte-search-coffee');
    await page.waitForTimeout(2000);
    await captureScreenshot(page, 'svelte-search-coffee-settled');
    
    // ─── 13. Test reduced motion ───
    await log('── Step 13: Test reduced-motion ──');
    const reducedResult = await testReducedMotion(page);
    results.checks.reducedMotion = reducedResult;
    await captureScreenshot(page, 'svelte-reduced-motion');
    
    // ─── 14. Test journey mode ───
    await log('── Step 14: Test journey mode ──');
    const journeyResult = await testJourneyMode(page);
    results.checks.journey = journeyResult;
    await captureScreenshot(page, 'svelte-journey');
    
    // ─── 15. Final console summary ───
    await log('── Step 15: Console & error summary ──');
    await log(`  Console errors: ${results.console.errors.length}`);
    for (const err of results.console.errors.slice(0, 10)) {
      await log(`    ❌ [${err.type}] ${err.text?.slice(0, 200)}`);
    }
    await log(`  Console warnings: ${results.console.warnings.length}`);
    for (const warn of results.console.warnings.slice(0, 5)) {
      await log(`    ⚠️  ${warn.text?.slice(0, 200)}`);
    }
    await log(`  Network failures: ${results.network.failed.length}`);
    for (const f of results.network.failed.slice(0, 5)) {
      await log(`    🌐 ${f.url} — ${f.failure}`);
    }
    
    // ═══════════════════════════════════════
    // LEGACY COMPARISON
    // ═══════════════════════════════════════
    await log('═══ Legacy Server Comparison ═══');
    
    const legacyNavStart = Date.now();
    await page.goto(LEGACY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    results.network.timing.legacyNav = Date.now() - legacyNavStart;
    await log(`  Legacy navigation: ${results.network.timing.legacyNav}ms`);
    
    await waitForWebGL(page);
    await page.waitForTimeout(5000);
    
    const legacyEval = await evaluateSceneState(page);
    results.legacy.sceneState = legacyEval;
    await captureScreenshot(page, 'legacy-idle-overview');
    
    const legacyFraming = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'no canvas' };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { error: 'no GL context' };
      const w = canvas.width;
      const h = canvas.height;
      const pixels = new Uint8Array(4);
      const samples = {
        center: { x: Math.floor(w/2), y: Math.floor(h/2) },
        topLeft: { x: Math.floor(w*0.2), y: Math.floor(h*0.2) },
        topRight: { x: Math.floor(w*0.8), y: Math.floor(h*0.2) },
        bottomLeft: { x: Math.floor(w*0.2), y: Math.floor(h*0.8) },
        bottomRight: { x: Math.floor(w*0.8), y: Math.floor(h*0.8) },
      };
      const results = {};
      for (const [k, s] of Object.entries(samples)) {
        gl.readPixels(s.x, h - s.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        results[k] = { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3], hasContent: pixels[0] > 5 || pixels[1] > 5 || pixels[2] > 5 };
      }
      return results;
    });
    results.legacy.framing = legacyFraming;
    await log(`  Legacy framing: ${JSON.stringify(Object.fromEntries(Object.entries(legacyFraming).map(([k, v]) => [k, v.hasContent])))}`);
    
    const legacyPerf = await getPerformanceMetrics(page);
    results.legacy.performance = legacyPerf;
    
    const legacyFps = await measureFPS(page, 3000);
    results.legacy.fps = legacyFps;
    await log(`  Legacy FPS: ${legacyFps.fps}`);
    
  } catch (err) {
    await log(`❌ AUDIT ERROR: ${err.message}`);
    results.issues.push({ severity: 'critical', message: `Audit error: ${err.message}`, stack: err.stack?.slice(0, 500) });
    try { await captureScreenshot(page, 'audit-error'); } catch {}
  } finally {
    // Write results
    const reportPath = join(SCREENSHOT_DIR, 'audit-results.json');
    writeFileSync(reportPath, JSON.stringify(results, null, 2));
    await log(`\n📊 Results written to: ${reportPath}`);
    
    await browser.close();
    await log('═══ Audit Complete ═══');
  }
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
