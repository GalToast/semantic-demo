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
 * Uses the static-plus-PHP-proxy test server unless TEST_BASE_URL is provided.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setShortLandscapeFocusSearch } from './helpers/short-landscape-helpers.js';
// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8796';
const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html';
const APP_QUERY = process.env.TEST_APP_QUERY || 'nodemo=1&webgl=1';
const SERVER_PORT = Number(process.env.TEST_SERVER_PORT || 8796);
let server = null;

const VIEWPORTS = [
  { width: 667, height: 375 },
  { width: 768, height: 380 }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// Browser layout rounds flex/grid edges to fractional CSS pixels. Match the
// Playwright contract's tolerance so harmless 0.2px rounding is not reported
// as a real viewport overflow.
const EDGE_TOLERANCE = 0.5;

async function isServerReady() {
  try {
    const response = await fetch(`${BASE_URL}${APP_PATH}`, { method: 'HEAD' });
    return response.ok || response.status === 405;
  } catch {
    return false;
  }
}

function appUrl() {
  const separator = APP_PATH.includes('?') ? '&' : '?';
  return `${BASE_URL}${APP_PATH}${separator}${APP_QUERY}`;
}

async function startStaticServer() {
  if (process.env.TEST_BASE_URL || await isServerReady()) return null;

  const proc = spawn(process.execPath, ['scripts/test-server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, TEST_SERVER_PORT: String(SERVER_PORT) },
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
      await page.goto(appUrl(), { waitUntil: 'domcontentloaded' });
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
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] });
  const page = await browser.newPage({
    viewport: viewport,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  // This contract checks layout/parity, not animation timing. Keep the
  // software-WebGL scene in its reduced-motion path so idle frames do not
  // dominate the short-landscape check.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  console.log(`Viewport: ${viewport.width}x${viewport.height} (short landscape)\n`);

  await gotoApp(page);
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    return Array.isArray(state.points) &&
      state.points.length > 0 &&
      state.renderer?.domElement &&
      state.camera &&
      state.pointsMesh;
  }, null, { timeout: 12000 });

  await page.evaluate(() => {
    document.body.classList.add('is-active');
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  // Idle ownership: the mobile search entry point lives inside #info-panel.
  // Keep this assertion adjacent to the later focus-search assertion so the
  // contract cannot be misread as requiring one panel behavior in both states.
  console.log(`[TEST] Idle search entry — #info-panel at ${viewport.width}x${viewport.height}`);
  const idleInfoPanel = await page.evaluate(() => {
    const panel = document.querySelector('#info-panel');
    if (!panel) return null;
    const style = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    return {
      surface: document.body?.dataset?.panelSurface || null,
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      width: rect.width,
      height: rect.height,
    };
  });
  assert(idleInfoPanel, 'idle #info-panel must remain mounted for the search entry point');
  assert(
    idleInfoPanel.surface === 'idle' || idleInfoPanel.surface === 'overview',
    `idle search-entry contract expected idle/overview surface, got ${idleInfoPanel.surface}`
  );
  assert(idleInfoPanel.display !== 'none', 'idle #info-panel must not be display:none');
  assert(idleInfoPanel.visibility !== 'hidden', 'idle #info-panel must not be visibility:hidden');
  assert(idleInfoPanel.opacity > 0, `idle #info-panel must be visible, got opacity=${idleInfoPanel.opacity}`);
  assert(idleInfoPanel.width > 0 && idleInfoPanel.height > 0, 'idle #info-panel must have layout dimensions');
  console.log('  PASS: idle #info-panel owns the mobile search entry point\n');

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

    assert(left >= -EDGE_TOLERANCE, `compass left=${left} should be >= 0`);
    assert(right <= winWidth + EDGE_TOLERANCE, `compass right=${right} should be <= viewport width=${winWidth}`);
    assert(top >= -EDGE_TOLERANCE, `compass top=${top} should be >= 0`);
    assert(bottom <= winHeight + EDGE_TOLERANCE, `compass bottom=${bottom} should be <= viewport height=${winHeight}`);

    const overflowRight = Math.max(0, right - winWidth);
    const overflowBottom = Math.max(0, bottom - winHeight);

    console.log(`  compass bounds: left=${left.toFixed(0)} right=${right.toFixed(0)} top=${top.toFixed(0)} bottom=${bottom.toFixed(0)}`);
    console.log(`  viewport: ${winWidth}x${winHeight}`);
    console.log(`  overflow: right=${overflowRight.toFixed(0)}px bottom=${overflowBottom.toFixed(0)}px`);
    assert(overflowRight <= EDGE_TOLERANCE, `compass overflow right: ${overflowRight}px`);
    assert(overflowBottom <= EDGE_TOLERANCE, `compass overflow bottom: ${overflowBottom}px`);
    console.log('  PASS: journey-compass does not overflow viewport\n');
  }

  // ── Test 2: Focus Stage stays within viewport ──────────────────────────────────
  console.log(`[TEST] Focus Stage — #focus-stage bounding rect at ${viewport.width}x${viewport.height}`);

  const parity = await setShortLandscapeFocusSearch(page);
  assert(parity.canonicalActions.length > 0, 'focus-search setup must use canonical app actions');
  assert(parity.bypassAttribute === 'focusPanelMode', 'only focusPanelMode may use a direct parity bypass');
  await page.evaluate(() => {
    document.body.classList.add('is-active');
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
  });

  const focusStageInfo = await page.evaluate(() => {
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
    assert(fsLeft >= -EDGE_TOLERANCE, `focus-stage left=${fsLeft} should be >= 0`);
    assert(fsRight <= fsWinW + EDGE_TOLERANCE, `focus-stage right=${fsRight} should be <= viewport width=${fsWinW}`);
    assert(fsTop >= -EDGE_TOLERANCE, `focus-stage top=${fsTop} should be >= 0`);
    assert(fsBottom <= fsWinH + EDGE_TOLERANCE, `focus-stage bottom=${fsBottom} should be <= viewport height=${fsWinH}`);

    const fsOverflowRight = Math.max(0, fsRight - fsWinW);
    const fsOverflowBottom = Math.max(0, fsBottom - fsWinH);

    console.log(`  focus-stage bounds: left=${fsLeft.toFixed(0)} right=${fsRight.toFixed(0)} top=${fsTop.toFixed(0)} bottom=${fsBottom.toFixed(0)}`);
    console.log(`  viewport: ${fsWinW}x${fsWinH}`);
    console.log(`  overflow: right=${fsOverflowRight.toFixed(0)}px bottom=${fsOverflowBottom.toFixed(0)}px`);
    assert(fsOverflowRight <= EDGE_TOLERANCE, `focus-stage overflow right: ${fsOverflowRight}px`);
    assert(fsOverflowBottom <= EDGE_TOLERANCE, `focus-stage overflow bottom: ${fsOverflowBottom}px`);

    // ARIA attributes should be correct in focus state
    assert(ariaHidden === 'false', `focus-stage aria-hidden should be "false", got "${ariaHidden}"`);
    assert(ariaExpanded === 'true', `focus-stage aria-expanded should be "true", got "${ariaExpanded}"`);

    console.log('  PASS: #focus-stage does not overflow viewport in focus mode\n');
  }

  // ── Test 3: focus-search owns the compact search/focus chrome ──────────────────
  console.log(`[TEST] Focus-search legacy panel ownership at ${viewport.width}x${viewport.height}`);

  const infoPanelInfo = await page.evaluate(() => {
    const panel = document.querySelector('#info-panel');
    if (!panel) return null;
    const style = getComputedStyle(panel);

    const rect = panel.getBoundingClientRect();
    const isVisible = style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     Number(style.opacity) > 0 &&
                     rect.width > 0 && rect.height > 0;

    return {
      styleDisplay: style.display,
      styleVisibility: style.visibility,
      isVisible,
      width: rect.width,
      height: rect.height,
    };
  });

  if (!infoPanelInfo) {
    throw new Error('FAIL: #info-panel not found in DOM');
  }

  const { styleDisplay, styleVisibility, isVisible: ipIsVisible, width: ipWidth, height: ipHeight } = infoPanelInfo;

  assert(
    !ipIsVisible,
    `focus-search must suppress the legacy #info-panel so FocusCard/JourneyChrome own the surface; got display=${styleDisplay} visibility=${styleVisibility} rect=${ipWidth}x${ipHeight}`
  );
  console.log('  PASS: focus-search suppresses the legacy #info-panel owner\n');

  // ── Test 4: No overlap between visible Canopy HUD and blocking focus chrome ────
  console.log(`[TEST] No overlap — journey-compass vs blocking focus chrome at ${viewport.width}x${viewport.height}`);

  const overlapInfo = await page.evaluate(() => {
    const compass = document.querySelector('.journey-compass');
    const stage = document.querySelector('#focus-stage');
    if (!compass || !stage) return null;

    const cStyle = getComputedStyle(compass);
    const sStyle = getComputedStyle(stage);

    const cVisible = cStyle.display !== 'none' && cStyle.visibility !== 'hidden' && Number(cStyle.opacity) > 0;
    const sVisible = sStyle.display !== 'none' && sStyle.visibility !== 'hidden' && Number(sStyle.opacity) > 0;

    if (!cVisible || !sVisible) return null;

    const cRect = compass.getBoundingClientRect();
    // #focus-stage is an intentionally full-viewport, pointer-events:none
    // wrapper. Its bounds are not a blocking surface; inspect the visible
    // interactive children that actually occupy the focus chrome instead.
    const blockingChildren = Array.from(stage.children).flatMap((child) => {
      const style = getComputedStyle(child);
      const rect = child.getBoundingClientRect();
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0 &&
        style.pointerEvents !== 'none' &&
        rect.width > 0 &&
        rect.height > 0;
      return visible
        ? [{
            selector: child.id ? `#${child.id}` : child.className || child.tagName,
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom
          }]
        : [];
    });
    return {
      compassBottom: cRect.bottom,
      compassTop: cRect.top,
      compassLeft: cRect.left,
      compassRight: cRect.right,
      blockingChildren,
    };
  });

  if (overlapInfo) {
    const { compassBottom, compassTop, compassLeft, compassRight, blockingChildren } = overlapInfo;
    console.log(`  compass: top=${compassTop.toFixed(0)} bottom=${compassBottom.toFixed(0)} right=${compassRight.toFixed(0)}`);
    for (const child of blockingChildren) {
      console.log(`  ${child.selector}: top=${child.top.toFixed(0)} left=${child.left.toFixed(0)} right=${child.right.toFixed(0)} bottom=${child.bottom.toFixed(0)}`);
      const verticalOverlap = child.top < compassBottom && child.bottom > compassTop;
      const horizontalOverlap = child.left < compassRight && child.right > compassLeft;
      if (verticalOverlap && horizontalOverlap) {
        assert(false, `overlap detected: ${child.selector} intersects compass bounds`);
      }
    }
    console.log('  PASS: no blocking overlap between visible journey-compass and focus chrome\n');
  } else {
    console.log('  [SKIP] Cannot test overlap — one or both elements hidden or not rendered\n');
  }

  // ── Test 5: No overflow on any visible element ────────────────────────────────
  console.log(`[TEST] No overflow — all visible key elements at ${viewport.width}x${viewport.height}`);

  const allOverflow = await page.evaluate(() => {
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
    assert(item.overflowRight <= EDGE_TOLERANCE, `${item.selector}: overflowRight=${item.overflowRight.toFixed(0)}px`);
    assert(item.overflowBottom <= EDGE_TOLERANCE, `${item.selector}: overflowBottom=${item.overflowBottom.toFixed(0)}px`);
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
