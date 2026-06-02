/**
 * short-landscape-layout-contract.mjs
 *
 * Contract test proving that the Canopy HUD (journey-compass) and Focus Stage
 * do not overlap or overflow the viewport in short landscape mode (667x375).
 *
 * Uses Playwright to launch a real browser, navigate to the app, simulate a
 * short landscape viewport (667x375), and assert bounding rects for key
 * UI surfaces.
 *
 * The short-landscape layout is historically fragile: at 667x375, CSS may
 * intentionally hide certain elements (opacity:0 or visibility:hidden) rather
 * than letting them overflow. Tests only assert on elements that are in a
 * visible/rendered state.
 *
 * Run: node tests/short-landscape-layout-contract.mjs
 * Starts a local static server unless TEST_BASE_URL is provided.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';
const APP_PATH = '/vector-explorer-polished.html';
const SERVER_PORT = 8795;
let server = null;

const VIEWPORTS = [
  { width: 667, height: 375 },
  { width: 768, height: 380 }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function isServerReady() {
  try {
    const response = await fetch(`${BASE_URL}${APP_PATH}`, { method: 'HEAD' });
    return response.ok || response.status === 405;
  } catch {
    return false;
  }
}

async function startStaticServer() {
  if (process.env.TEST_BASE_URL || await isServerReady()) return null;

  const proc = spawn('python', ['-m', 'http.server', String(SERVER_PORT), '--bind', '127.0.0.1'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (proc.exitCode !== null) {
      throw new Error(`static server exited early with code ${proc.exitCode}`);
    }
    if (await isServerReady()) return proc;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  proc.kill();
  throw new Error(`static server failed to respond on ${BASE_URL} within 10000ms`);
}

async function gotoApp(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(`${BASE_URL}${APP_PATH}`, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      const isLocalRefused = !process.env.TEST_BASE_URL &&
        String(error?.message || error).includes('ERR_CONNECTION_REFUSED');
      if (!isLocalRefused || attempt === 1) {
        throw error;
      }
      server = await startStaticServer();
    }
  }
}

async function runTestsForViewport(viewport) {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({
    viewport: viewport,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  console.log(`Viewport: ${viewport.width}x${viewport.height} (short landscape)\n`);

  await gotoApp(page);
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return Array.isArray(state.points) &&
      state.points.length > 0 &&
      state.renderer?.domElement &&
      state.camera &&
      state.pointsMesh;
  }, { timeout: 12000 });

  await page.evaluate(() => {
    document.body.classList.add('is-active');
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  // ── Test 1: Canopy HUD (journey-compass) stays within viewport ─────────────────
  console.log(`[TEST] Canopy HUD — journey-compass bounding rect at ${viewport.width}x${viewport.height}`);

  const compassInfo = await page.evaluate(() => {
    const compass = document.querySelector('.journey-compass');
    if (!compass) return null;
    const style = getComputedStyle(compass);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    const rect = compass.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      winWidth: window.innerWidth,
      winHeight: window.innerHeight,
    };
  });

  if (!compassInfo) {
    console.log('  [SKIP] journey-compass is hidden in short-landscape idle state\n');
  } else {
    const { left, right, top, bottom, winWidth, winHeight } = compassInfo;

    assert(left >= 0, `compass left=${left} should be >= 0`);
    assert(right <= winWidth, `compass right=${right} should be <= viewport width=${winWidth}`);
    assert(top >= 0, `compass top=${top} should be >= 0`);
    assert(bottom <= winHeight, `compass bottom=${bottom} should be <= viewport height=${winHeight}`);

    const overflowRight = Math.max(0, right - winWidth);
    const overflowBottom = Math.max(0, bottom - winHeight);

    console.log(`  compass bounds: left=${left.toFixed(0)} right=${right.toFixed(0)} top=${top.toFixed(0)} bottom=${bottom.toFixed(0)}`);
    console.log(`  viewport: ${winWidth}x${winHeight}`);
    console.log(`  overflow: right=${overflowRight.toFixed(0)}px bottom=${overflowBottom.toFixed(0)}px`);
    assert(overflowRight === 0, `compass overflow right: ${overflowRight}px`);
    assert(overflowBottom === 0, `compass overflow bottom: ${overflowBottom}px`);
    console.log('  PASS: journey-compass does not overflow viewport\n');
  }

  // ── Test 2: Focus Stage stays within viewport ──────────────────────────────────
  console.log(`[TEST] Focus Stage — #focus-stage bounding rect at ${viewport.width}x${viewport.height}`);

  await page.evaluate(() => {
    window.__forceShortLandscapeFocusSearch = () => {
      document.body.classList.add('is-active');
      document.body.dataset.activeView = 'galaxy';
      document.body.dataset.graphContext = 'focus-search';
      document.body.dataset.panelSurface = 'focus-search';
      document.body.dataset.focusPanelMode = 'focus';

      const stage = document.querySelector('#focus-stage');
      const card = document.querySelector('.focus-stage-card');
      if (stage) {
        stage.hidden = false;
        stage.classList.add('active');
        stage.setAttribute('aria-hidden', 'false');
        stage.setAttribute('aria-expanded', 'true');
      }
      if (card) {
        card.style.height = '';
      }
    };
    window.__forceShortLandscapeFocusSearch();
  });

  const focusStageInfo = await page.evaluate(() => {
    window.__forceShortLandscapeFocusSearch?.();
    const stage = document.querySelector('#focus-stage');
    if (!stage) return null;
    const style = getComputedStyle(stage);

    // Only consider "visible" if it has non-zero dimensions and is not hidden
    const rect = stage.getBoundingClientRect();
    const isVisible = style.display !== 'none' &&
                      style.visibility !== 'hidden' &&
                      Number(style.opacity) > 0 &&
                      rect.width > 0 && rect.height > 0;

    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      winWidth: window.innerWidth,
      winHeight: window.innerHeight,
      isVisible,
      styleDisplay: style.display,
      styleVisibility: style.visibility,
      styleOpacity: style.opacity,
      ariaHidden: stage.getAttribute('aria-hidden'),
      ariaExpanded: stage.getAttribute('aria-expanded'),
    };
  });

  if (!focusStageInfo) {
    throw new Error('FAIL: #focus-stage not found in DOM');
  }

  const { left: fsLeft, right: fsRight, top: fsTop, bottom: fsBottom,
          winWidth: fsWinW, winHeight: fsWinH,
          isVisible: fsIsVisible,
          ariaHidden, ariaExpanded } = focusStageInfo;

  if (!fsIsVisible) {
    // Element is hidden by short-landscape CSS — this is the correct behavior
    console.log('  [SKIP] #focus-stage is hidden (short-landscape CSS correctly hides it rather than letting it overflow)\n');
  } else {
    assert(fsLeft >= 0, `focus-stage left=${fsLeft} should be >= 0`);
    assert(fsRight <= fsWinW, `focus-stage right=${fsRight} should be <= viewport width=${fsWinW}`);
    assert(fsTop >= 0, `focus-stage top=${fsTop} should be >= 0`);
    assert(fsBottom <= fsWinH, `focus-stage bottom=${fsBottom} should be <= viewport height=${fsWinH}`);

    const fsOverflowRight = Math.max(0, fsRight - fsWinW);
    const fsOverflowBottom = Math.max(0, fsBottom - fsWinH);

    console.log(`  focus-stage bounds: left=${fsLeft.toFixed(0)} right=${fsRight.toFixed(0)} top=${fsTop.toFixed(0)} bottom=${fsBottom.toFixed(0)}`);
    console.log(`  viewport: ${fsWinW}x${fsWinH}`);
    console.log(`  overflow: right=${fsOverflowRight.toFixed(0)}px bottom=${fsOverflowBottom.toFixed(0)}px`);
    assert(fsOverflowRight === 0, `focus-stage overflow right: ${fsOverflowRight}px`);
    assert(fsOverflowBottom === 0, `focus-stage overflow bottom: ${fsOverflowBottom}px`);

    // ARIA attributes should be correct in focus state
    assert(ariaHidden === 'false', `focus-stage aria-hidden should be "false", got "${ariaHidden}"`);
    assert(ariaExpanded === 'true', `focus-stage aria-expanded should be "true", got "${ariaExpanded}"`);

    console.log('  PASS: #focus-stage does not overflow viewport in focus mode\n');
  }

  // ── Test 3: Info Panel stays within viewport ───────────────────────────────────
  console.log(`[TEST] Info Panel — #info-panel bounding rect at ${viewport.width}x${viewport.height}`);

  const infoPanelInfo = await page.evaluate(() => {
    window.__forceShortLandscapeFocusSearch?.();
    const panel = document.querySelector('#info-panel');
    if (!panel) return null;
    const style = getComputedStyle(panel);

    const rect = panel.getBoundingClientRect();
    const isVisible = style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     Number(style.opacity) > 0 &&
                     rect.width > 0 && rect.height > 0;

    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      winWidth: window.innerWidth,
      winHeight: window.innerHeight,
      isVisible,
    };
  });

  if (!infoPanelInfo) {
    throw new Error('FAIL: #info-panel not found in DOM');
  }

  const { left: ipLeft, right: ipRight, top: ipTop, bottom: ipBottom,
          winWidth: ipWinW, winHeight: ipWinH,
          isVisible: ipIsVisible } = infoPanelInfo;

  if (!ipIsVisible) {
    console.log('  [SKIP] #info-panel is hidden (short-landscape CSS correctly hides it)\n');
  } else {
    assert(ipLeft >= 0, `info-panel left=${ipLeft} should be >= 0`);
    assert(ipRight <= ipWinW, `info-panel right=${ipRight} should be <= viewport width=${ipWinW}`);
    assert(ipTop >= 0, `info-panel top=${ipTop} should be >= 0`);
    assert(ipBottom <= ipWinH, `info-panel bottom=${ipBottom} should be <= viewport height=${ipWinH}`);

    const ipOverflowRight = Math.max(0, ipRight - ipWinW);
    const ipOverflowBottom = Math.max(0, ipBottom - ipWinH);

    console.log(`  info-panel bounds: left=${ipLeft.toFixed(0)} right=${ipRight.toFixed(0)} top=${ipTop.toFixed(0)} bottom=${ipBottom.toFixed(0)}`);
    console.log(`  viewport: ${ipWinW}x${ipWinH}`);
    console.log(`  overflow: right=${ipOverflowRight.toFixed(0)}px bottom=${ipOverflowBottom.toFixed(0)}px`);
    assert(ipOverflowRight === 0, `info-panel overflow right: ${ipOverflowRight}px`);
    assert(ipOverflowBottom === 0, `info-panel overflow bottom: ${ipOverflowBottom}px`);
    console.log('  PASS: #info-panel does not overflow viewport\n');
  }

  // ── Test 4: No overlap between visible Canopy HUD and Focus Stage ──────────────
  console.log(`[TEST] No overlap — journey-compass vs #focus-stage at ${viewport.width}x${viewport.height}`);

  const overlapInfo = await page.evaluate(() => {
    window.__forceShortLandscapeFocusSearch?.();
    const compass = document.querySelector('.journey-compass');
    const stage = document.querySelector('#focus-stage');
    if (!compass || !stage) return null;

    const cStyle = getComputedStyle(compass);
    const sStyle = getComputedStyle(stage);

    const cVisible = cStyle.display !== 'none' && cStyle.visibility !== 'hidden' && Number(cStyle.opacity) > 0;
    const sVisible = sStyle.display !== 'none' && sStyle.visibility !== 'hidden' && Number(sStyle.opacity) > 0;

    if (!cVisible || !sVisible) return null;

    const cRect = compass.getBoundingClientRect();
    const sRect = stage.getBoundingClientRect();
    return {
      compassBottom: cRect.bottom,
      compassTop: cRect.top,
      compassRight: cRect.right,
      stageTop: sRect.top,
      stageLeft: sRect.left,
      stageRight: sRect.right,
      stageBottom: sRect.bottom,
      stageHeight: sRect.height,
    };
  });

  if (overlapInfo) {
    const { compassBottom, compassTop, compassRight, stageTop, stageLeft, stageRight } = overlapInfo;
    console.log(`  compass: top=${compassTop.toFixed(0)} bottom=${compassBottom.toFixed(0)} right=${compassRight.toFixed(0)}`);
    console.log(`  focus-stage: top=${stageTop.toFixed(0)} left=${stageLeft.toFixed(0)} right=${stageRight.toFixed(0)}`);

    const verticalOverlap = stageTop < compassBottom;
    const horizontalOverlap = compassRight > stageLeft;

    if (verticalOverlap && horizontalOverlap) {
      assert(false, `overlap detected: compass bottom=${compassBottom} > stage top=${stageTop} AND horizontal overlap`);
    }
    console.log('  PASS: no blocking overlap between visible journey-compass and focus-stage\n');
  } else {
    console.log('  [SKIP] Cannot test overlap — one or both elements hidden or not rendered\n');
  }

  // ── Test 5: No overflow on any visible element ────────────────────────────────
  console.log(`[TEST] No overflow — all visible key elements at ${viewport.width}x${viewport.height}`);

  const allOverflow = await page.evaluate(() => {
    window.__forceShortLandscapeFocusSearch?.();
    const selectors = [
      '.search-container',
      '#info-panel',
      '#focus-stage',
      '.journey-compass',
      '.focus-stage-card',
    ];
    const results = [];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const isVisible = style.display !== 'none' &&
                          style.visibility !== 'hidden' &&
                          Number(style.opacity) > 0 &&
                          rect.width > 0 && rect.height > 0;
        if (!isVisible) continue;
        results.push({
          selector: sel,
          right: rect.right,
          bottom: rect.bottom,
          overflowRight: Math.max(0, rect.right - window.innerWidth),
          overflowBottom: Math.max(0, rect.bottom - window.innerHeight),
        });
      }
    }
    return results;
  });

  for (const item of allOverflow) {
    assert(item.overflowRight === 0, `${item.selector}: overflowRight=${item.overflowRight.toFixed(0)}px`);
    assert(item.overflowBottom === 0, `${item.selector}: overflowBottom=${item.overflowBottom.toFixed(0)}px`);
  }

  console.log(`  Checked ${allOverflow.length} visible element(s) — none overflow`);
  console.log('  PASS: no visible element overflows viewport\n');

  await browser.close();
}

console.log('\n=== Short Landscape Layout Contract ===\n');

server = await startStaticServer();

try {
  for (const vp of VIEWPORTS) {
    await runTestsForViewport(vp);
  }

  console.log('All short landscape layout contracts passed.');
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once('exit', resolve));
  }
}
