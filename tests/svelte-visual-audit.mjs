/**
 * Svelte Dev Server Visual Audit
 * 
 * Targets http://localhost:5173/ (Svelte + Vite)
 * Captures: canvas state, console logs, FPS, interactions, comparison with legacy
 * 
 * Usage: node tests/svelte-visual-audit.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const SVELTE_URL = 'http://localhost:5173/';
const LEGACY_URL = 'http://127.0.0.1:8795/index.html';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'reports', 'screenshots', 'svelte-audit');
const REPORT_FILE = path.resolve(process.cwd(), 'reports', 'svelte-visual-audit-report.md');

const SLUG_MAP = {
  '01-idle-overview': '01-idle-overview',
  '02-search-coffee': '02-search-coffee',
  '03-canvas-detail': '03-canvas-detail',
  '04-reduced-motion': '04-reduced-motion',
  '05-legacy-idle': '05-legacy-idle',
  '06-console-errors': '06-console-errors',
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function captureConsoleMessages(page, label) {
  const messages = [];
  page.on('console', msg => messages.push(`[${msg.type()}] ${msg.text()}`));
  return messages;
}

async function collectMetrics(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const state = window.__semanticState || window.__TEST_STATE__ || {};
    return {
      canvasExists: !!canvas,
      canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'none',
      glRenderer: canvas ? (() => {
        try {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          return gl ? gl.getParameter(gl.RENDERER) : 'no context';
        } catch { return 'error'; }
      })() : 'no canvas',
      pointsLoaded: state.points?.length || state.rawPositionsBuffer?.length || 'unknown',
      rendererReady: !!state.renderer,
      sceneReady: !!state.scene,
      cameraReady: !!state.camera,
      dataSurface: document.body.dataset.panelSurface,
      journeyPhase: document.body.dataset.journeyPhase,
      demoPhase: document.body.dataset.demoPhase,
      graphicsMode: document.body.dataset.graphicsMode,
    };
  }).catch(() => ({ error: 'evaluate failed' }));
}

async function checkCanvasIntegrity(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { canvas: false, reason: 'no canvas element' };
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { canvas: true, webgl: false, reason: 'no webgl context' };
    const info = {
      canvas: true,
      webgl: true,
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      version: gl.getParameter(gl.VERSION),
    };
    return info;
  }).catch(() => ({ error: 'integrity check failed' }));
}

async function runFpsCheck(page, durationMs = 3000) {
  return await page.evaluate(async (duration) => {
    return new Promise(resolve => {
      let frames = 0;
      let lastTime = performance.now();
      function tick() {
        frames++;
        const now = performance.now();
        if (now - lastTime >= duration) {
          resolve(Math.round(frames / (duration / 1000) * 10) / 10);
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, durationMs);
}

async function auditSvelteServer() {
  console.log('=== SVELTE VISUAL AUDIT ===\n');
  await ensureDir(SCREENSHOT_DIR);

  const reportSections = [];
  function section(h, ...lines) {
    reportSections.push({ heading: h, lines });
  }

  section('Svelte Dev Server Visual Audit', 
    `Date: ${new Date().toISOString()}`,
    `Target: ${SVELTE_URL}`,
    `Legacy: ${LEGACY_URL}`,
    '');

  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const allConsoleMessages = [];
  page.on('console', msg => {
    allConsoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    allConsoleMessages.push(`[PAGE_ERROR] ${err.message}`);
  });

  try {
    // === STEP 1: Navigate and wait for WebGL init ===
    console.log('1. Navigating to Svelte dev server...');
    await page.goto(SVELTE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(3000); // Let WebGL initialize

    // Initial screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-idle-overview.png'), fullPage: false });
    console.log('   Screenshot: 01-idle-overview.png');

    // Check metrics
    const metrics1 = await collectMetrics(page);
    console.log(`   Canvas: ${metrics1.canvasExists}, Size: ${metrics1.canvasSize}`);
    console.log(`   Points loaded: ${metrics1.pointsLoaded}`);
    console.log(`   Renderer: ${metrics1.rendererReady}, Scene: ${metrics1.sceneReady}, Camera: ${metrics1.cameraReady}`);
    console.log(`   Graphics mode: ${metrics1.graphicsMode}`);
    console.log(`   Panel surface: ${metrics1.dataSurface}, Journey: ${metrics1.journeyPhase}, Demo: ${metrics1.demoPhase}`);

    section('Step 1: Initial Load',
      `Canvas: ${metrics1.canvasExists}`,
      `Canvas Size: ${metrics1.canvasSize}`,
      `Points: ${metrics1.pointsLoaded}`,
      `Renderer Ready: ${metrics1.rendererReady}`,
      `Scene Ready: ${metrics1.sceneReady}`,
      `Camera Ready: ${metrics1.cameraReady}`,
      `Graphics Mode: ${metrics1.graphicsMode}`,
      `Data Surface: ${metrics1.dataSurface}`,
      `Journey Phase: ${metrics1.journeyPhase}`,
      `Demo Phase: ${metrics1.demoPhase}`,
      '');

    // Canvas integrity
    const integrity = await checkCanvasIntegrity(page);
    console.log(`   WebGL: ${integrity.webgl}, Renderer: ${integrity.renderer}`);
    section('WebGL Info',
      `Vendor: ${integrity.vendor || 'N/A'}`,
      `Renderer: ${integrity.renderer || 'N/A'}`,
      `Max Texture: ${integrity.maxTextureSize}`,
      `GLSL Version: ${integrity.shadingLanguageVersion}`,
      `WebGL Version: ${integrity.version}`,
      '');

    // === STEP 2: Search for "coffee" ===
    console.log('\n2. Testing search for "coffee"...');
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="business" i], #search-input, [role="searchbox"]');
    
    if (await searchInput.count() > 0) {
      await searchInput.first().click();
      await searchInput.first().fill('coffee');
      await sleep(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-search-coffee.png'), fullPage: false });
      console.log('   Screenshot: 02-search-coffee.png');

      // Clear search
      await searchInput.first().fill('');
      await sleep(500);
    } else {
      console.log('   Search input not found, trying keyboard shortcut...');
      await page.keyboard.press('Control+F');
      await sleep(500);
      await page.keyboard.type('coffee');
      await sleep(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-search-coffee.png'), fullPage: false });
      console.log('   Screenshot: 02-search-coffee.png (via keyboard)');
    }

    // === STEP 3: Check canvas detail / point distribution ===
    console.log('\n3. Checking canvas detail...');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-canvas-detail.png'), fullPage: false });
    console.log('   Screenshot: 03-canvas-detail.png');

    // === STEP 4: FPS check ===
    console.log('\n4. Checking FPS...');
    const fps = await runFpsCheck(page, 3000);
    console.log(`   Average FPS: ${fps}`);
    section('Performance', `Average FPS (3s): ${fps}`, '');

    // === STEP 5: Reduced motion ===
    console.log('\n5. Testing reduced motion...');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-reduced-motion.png'), fullPage: false });
    console.log('   Screenshot: 04-reduced-motion.png');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // === STEP 6: Check for hover zones (field nodes) ===
    console.log('\n6. Checking for hoverable/clickable elements...');
    const canvas = page.locator('canvas');
    if (await canvas.count() > 0) {
      const box = await canvas.first().boundingBox();
      if (box) {
        // Hover near center
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(300);
        // Try moving around
        for (let i = 0; i < 10; i++) {
          const x = box.x + box.width * (0.1 + 0.8 * Math.random());
          const y = box.y + box.height * (0.1 + 0.8 * Math.random());
          await page.mouse.move(x, y);
          await sleep(100);
        }
        console.log('   Mouse interaction test: completed');
      }
    }

    // === STEP 7: Collect console messages ===
    console.log('\n7. Console messages summary:');
    const errors = allConsoleMessages.filter(m => m.startsWith('[error]') || m.startsWith('[PAGE_ERROR]'));
    const warnings = allConsoleMessages.filter(m => m.startsWith('[warning]'));
    console.log(`   Total messages: ${allConsoleMessages.length}`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`   Warnings: ${warnings.length}`);
    if (errors.length > 0) {
      console.log('   --- ERRORS ---');
      errors.forEach(e => console.log(`   ${e}`));
    }
    if (warnings.length > 0) {
      console.log('   --- WARNINGS ---');
      warnings.forEach(w => console.log(`   ${w}`));
    }

    section('Console Messages',
      `Total: ${allConsoleMessages.length}`,
      `Errors: ${errors.length}`,
      `Warnings: ${warnings.length}`,
      '');
    if (errors.length > 0) {
      section('Console Errors', ...errors.map(e => `- ${e}`), '');
    }
    if (warnings.length > 0) {
      section('Console Warnings', ...warnings.map(w => `- ${w}`), '');
    }

    // Save full console log
    await fs.writeFile(
      path.join(SCREENSHOT_DIR, 'console-log.txt'),
      allConsoleMessages.join('\n'),
      'utf-8'
    );
    console.log('   Full console log saved to console-log.txt');

  } catch (err) {
    console.error('Audit error:', err.message);
    section('Audit Error', `Error: ${err.message}`, '');
  }

  // === STEP 8: Compare with legacy (only if it's accessible) ===
  console.log('\n8. Checking legacy server...');
  try {
    const response = await fetch(LEGACY_URL, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      console.log('   Legacy server is accessible');
      await page.goto(LEGACY_URL, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(3000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-legacy-idle.png'), fullPage: false });
      console.log('   Screenshot: 05-legacy-idle.png');

      const legacyMetrics = await collectMetrics(page);
      console.log(`   Legacy Canvas: ${legacyMetrics.canvasExists}, Points: ${legacyMetrics.pointsLoaded}`);
      
      section('Legacy Comparison',
        `Legacy accessible: true`,
        `Legacy Canvas: ${legacyMetrics.canvasExists}`,
        `Legacy Points: ${legacyMetrics.pointsLoaded}`,
        `Legacy Graphics Mode: ${legacyMetrics.graphicsMode}`,
        '');
    } else {
      section('Legacy Comparison', `Legacy HTTP status: ${response.status}`, '');
    }
  } catch (err) {
    console.log(`   Legacy server not accessible: ${err.message}`);
    section('Legacy Comparison', `Legacy error: ${err.message}`, '');
  }

  await browser.close();
  console.log('\n=== AUDIT COMPLETE ===\n');

  // === WRITE REPORT ===
  const reportLines = [];
  for (const s of reportSections) {
    if (s.heading) reportLines.push(`# ${s.heading}`);
    reportLines.push(...s.lines.map(l => l || ''));
    reportLines.push('');
  }
  await fs.writeFile(REPORT_FILE, reportLines.join('\n'), 'utf-8');
  console.log(`Report written to ${REPORT_FILE}`);
}

auditSvelteServer().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
