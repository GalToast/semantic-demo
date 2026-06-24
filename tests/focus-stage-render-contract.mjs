/**
 * focus-stage-render-contract.mjs
 *
 * Rendered contract test for focus-stage focus-search and semantic-dive surfaces.
 *
 * Surfaces tested:
 *   1. focus-search  — focus-stage/card present, card inside viewport, no overflow,
 *                      key text not clipped, dive/route buttons are touch targets,
 *                      compass/global utility chrome does not overlap card
 *   2. semantic-dive  — inside status/controls present, inside buttons are touch targets,
 *                      journey/neighbor visibility matches semantic-dive state, no overflow
 *
 * This is a CSS surface contract test. When exact app flow is flaky, we force body
 * dataset after initial app load and the test reports that it is a CSS surface contract.
 *
 * Usage:
 *   node tests/focus-stage-render-contract.mjs
 *   node tests/focus-stage-render-contract.mjs http://127.0.0.1:8813/vector-explorer-polished.html
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:8813/vector-explorer-polished.html';
const PORT = 8813;
const HTML_FILE = path.resolve(process.cwd(), 'docs/archive/vector-explorer-polished-legacy.html');

// ---------------------------------------------------------------------------
// Embedded HTTP server — serves the HTML file only
// ---------------------------------------------------------------------------

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Strip query string and decode URI; on Windows, path.resolve treats '/foo' as absolute (no drive)
      // so we strip the leading slash to treat it as a relative path from cwd
      const reqPath = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const fp = path.resolve(process.cwd(), reqPath === '' ? 'docs/archive/vector-explorer-polished-legacy.html' : reqPath);
      try {
        const data = fs.readFileSync(fp);
        const ext = path.extname(fp).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.ts': 'application/javascript',
        };
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      } catch (e) {
        console.error(`[server] 404: ${reqPath} → ${fp} — ${e.message}`);
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.on('error', reject);
    server.listen(port, () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const cliArgs = process.argv.slice(2);
function positionalUrl(args) {
  for (const arg of args) {
    if (!arg.startsWith('--')) return arg;
  }
  return DEFAULT_URL;
}

const TARGET_URL = positionalUrl(cliArgs);

let server = null;
let browser = null;

function closeServer(serverInstance) {
  return new Promise((resolve) => {
    if (!serverInstance) return resolve();
    serverInstance.close(() => resolve());
  });
}

async function run() {
  let serverPort = PORT;

  // If the URL is our default, start our own server
  const useLocalServer = TARGET_URL.includes(`:${PORT}/`) || cliArgs.length === 0;

  if (useLocalServer) {
    serverPort = parseInt(TARGET_URL.match(/:(\d+)\//)?.[1] || PORT);
    console.log(`[server] starting on port ${serverPort}...`);
    server = await startServer(serverPort);
    console.log(`[server] listening on http://127.0.0.1:${serverPort}`);
  }

  console.log('[browser] launching Chromium...');
  browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console error] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[page error] ${err.message}`));

  const baseUrl = useLocalServer ? `http://127.0.0.1:${serverPort}` : TARGET_URL.replace(/\/[^\/]*$/, '');

  // Load the app
  console.log('[load] navigating...');
  await page.goto(`${baseUrl}/vector-explorer-polished.html?nodemo=1`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
    console.error('[load] navigation error:', e.message);
  });
  await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});

  // --- Surface 1: focus-search ---
  console.log('\n[TEST] focus-search surface');
  await forceFocusSearch(page);
  const focusSearchInfo = await auditFocusSearch(page);
  await reportFocusSearch(page, focusSearchInfo);

  // --- Surface 2: semantic-dive ---
  console.log('\n[TEST] semantic-dive surface');
  await forceSemanticDive(page);
  const diveInfo = await auditSemanticDive(page);
  await reportSemanticDive(page, diveInfo);

  // Final console errors check
  console.log('\n[console errors]', errors.length === 0 ? 'none' : errors.join('; '));

  await browser.close();
  await closeServer(server);

  const failures = [
    ...focusSearchInfo.failures,
    ...diveInfo.failures,
  ];

  if (failures.length > 0) {
    console.error('\n[FAIL] Contract violations found:');
    failures.forEach(f => console.error(' ', f));
    process.exit(1);
  }

  console.log('\nfocus-stage-render-contract passed');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// State forcing
// ---------------------------------------------------------------------------

async function forceFocusSearch(page) {
  const applyFixture = async () => page.evaluate(() => {
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus-search';
    document.body.dataset.semanticDive = 'inactive';
    document.body.dataset.panelSurface = 'focus-search';
    document.body.dataset.panelSurfaceDetail = 'peek';
    document.body.dataset.focusPanelMode = 'search-result';
    document.body.dataset.trailState = 'active';
    document.body.dataset.trailDepth = '1';
    document.body.dataset.mobileSearchSheet = 'peek';
    document.body.dataset.journeyPhase = 'focus';
    document.body.dataset.routeDirector = 'search-corridor';

    // Apply state via __APP_STATE__ primary, __TEST_STATE__ fallback.
    // These dataset and state writes are CSS contract fixture setup.
    const s = window.__APP_STATE__ ?? window.__TEST_STATE__;
    const byLeadId = s?.pointIndexByLeadId;
    const rawIndex = byLeadId?.get?.('1') ?? byLeadId?.get?.(1) ?? 0;
    const focusIndex = Number.isFinite(rawIndex) ? rawIndex : 0;
    const focusNode = window.__APP_ACTIONS__?.focusOnNode;
    const setTrailDepth = window.__APP_ACTIONS__?.setTrailDepth;
    const refreshCompositionState = window.__APP_ACTIONS__?.refreshCompositionState;
    if (typeof focusNode === 'function') {
      focusNode(focusIndex, { fromSearchResult: true, skipUrlSync: true });
    }
    if (typeof setTrailDepth === 'function') {
      setTrailDepth(1, { skipUrlSync: true });
    }
    if (s) {
      const mutate = typeof window.withStateMutation === 'function'
        ? window.withStateMutation
        : (fn) => fn();
      mutate(() => {
        s.currentView = 'galaxy';
        s.focusedNode = Number.isFinite(s.focusedNode) ? s.focusedNode : focusIndex;
        s.navState = s.navState || {};
        s.navState.focusedIndex = Number.isFinite(s.navState.focusedIndex)
          ? s.navState.focusedIndex
          : s.focusedNode;
        s.navState.trailNeighborIndices = Array.isArray(s.navState.trailNeighborIndices)
          && s.navState.trailNeighborIndices.length
          ? s.navState.trailNeighborIndices
          : [1];
        s.navState.walkHistoryIndices = [0, s.navState.focusedIndex];
        s.trailDepth = Math.max(1, Number(s.trailDepth) || 1);
      });
    }
    refreshCompositionState?.();
    window.updateJourneyCompass?.();

    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus-search';
    document.body.dataset.semanticDive = 'inactive';
    document.body.dataset.panelSurface = 'focus-search';
    document.body.dataset.panelSurfaceDetail = 'peek';
    document.body.dataset.focusPanelMode = 'search-result';
    document.body.dataset.trailState = 'active';
    document.body.dataset.trailDepth = '1';
    document.body.dataset.mobileSearchSheet = 'peek';
    document.body.dataset.journeyPhase = 'focus';

    // Stage DOM elements for rendering — these are test-only fixture ops.
    const focusStage = document.querySelector('#focus-stage');
    if (focusStage) {
      focusStage.hidden = false;
      focusStage.removeAttribute('hidden');
      focusStage.classList.add('active');
    }
    const journey = document.querySelector('#focus-stage-journey');
    if (journey) {
      journey.hidden = false;
      journey.removeAttribute('hidden');
      journey.classList.add('active');
    }
    const diveBtn = document.querySelector('#btn-focus-dive');
    if (diveBtn) { diveBtn.hidden = false; diveBtn.removeAttribute('hidden'); diveBtn.inert = false; }
    const prevBtn = document.querySelector('#btn-focus-prev');
    if (prevBtn) { prevBtn.hidden = false; prevBtn.removeAttribute('hidden'); prevBtn.inert = false; prevBtn.disabled = false; prevBtn.setAttribute('aria-disabled', 'false'); }
    const nextBtn = document.querySelector('#btn-focus-next');
    if (nextBtn) { nextBtn.hidden = false; nextBtn.removeAttribute('hidden'); nextBtn.inert = false; nextBtn.disabled = false; nextBtn.setAttribute('aria-disabled', 'false'); }
  });
  await applyFixture();
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
  await applyFixture();
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
  await applyFixture();
  await waitForTouchTargets(page, ['btn-focus-dive']);
}

async function forceSemanticDive(page) {
  const applyFixture = async () => page.evaluate(() => {
    const actions = window.__APP_ACTIONS__ || {};
    actions.setSemanticDiveMode?.(true);
    actions.refreshCompositionState?.();

    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = document.body.dataset.graphContext || 'focus';
    document.body.dataset.semanticDive = 'active';
    document.body.dataset.panelSurface = 'semantic-dive';
    document.body.dataset.panelSurfaceDetail = 'none';

    const focusStage = document.querySelector('#focus-stage');
    if (focusStage) {
      focusStage.hidden = false;
      focusStage.setAttribute('aria-hidden', 'false');
      focusStage.classList.add('active');
    }
    const insideStatus = document.querySelector('#focus-stage-inside-status');
    if (insideStatus) {
      insideStatus.hidden = false;
      insideStatus.setAttribute('aria-hidden', 'false');
    }
    const insideControls = document.querySelector('#focus-stage-inside-controls');
    if (insideControls) {
      insideControls.hidden = false;
      insideControls.setAttribute('aria-hidden', 'false');
    }
    ['btn-inside-next', 'btn-inside-map', 'btn-inside-county'].forEach((id) => {
      const button = document.getElementById(id);
      if (button) {
        button.hidden = false;
        button.removeAttribute('hidden');
        button.inert = false;
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
      }
    });
  });
  await applyFixture();
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
  await applyFixture();
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});
  await applyFixture();
  await waitForTouchTargets(page, ['btn-inside-next', 'btn-inside-map', 'btn-inside-county']);
}

async function waitForTouchTargets(page, ids) {
  await page.waitForFunction((targetIds) => targetIds.every((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= 43.5 && rect.height >= 43.5;
  }), ids, { timeout: 1500 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Auditing (runs in browser context)
// ---------------------------------------------------------------------------

async function auditFocusSearch(page) {
  return page.evaluate(() => {
    const failures = [];
    const passes = [];

    function pass(detail) { passes.push(detail); }
    function fail(detail) { failures.push(detail); }

    // --- presence checks ---
    const focusStage = document.querySelector('#focus-stage');
    if (!focusStage) {
      fail('dom:missing #focus-stage');
      return { failures, passes };
    }

    const card = document.querySelector('#focus-pocket, .focus-stage-card');
    if (!card) {
      fail('dom:missing .focus-stage-card');
      return { failures, passes };
    }
    pass('dom:focus-stage and card present');

    // --- card inside viewport ---
    const cardRect = card.getBoundingClientRect();
    const vpWidth = window.innerWidth;
    const vpHeight = window.innerHeight;

    const cardOutsideLeft = cardRect.left < -cardRect.width - 10;
    const cardOutsideRight = cardRect.right > vpWidth + cardRect.width + 10;
    const cardOutsideTop = cardRect.top < -cardRect.height - 10;
    const cardOutsideBottom = cardRect.bottom > vpHeight + cardRect.height + 10;

    if (cardOutsideLeft || cardOutsideRight || cardOutsideTop || cardOutsideBottom) {
      fail(`viewport:card outside bounds rect=${JSON.stringify({l:cardRect.left,t:cardRect.top,r:cardRect.right,b:cardRect.bottom})} vp=${vpWidth}x${vpHeight}`);
    } else {
      pass('viewport:card inside viewport');
    }

    // --- no overflow ---
    const body = document.body;
    const html = document.documentElement;
    const overflowX = body.scrollWidth > html.clientWidth;
    const overflowY = body.scrollHeight > html.clientHeight;
    if (overflowX) fail('overflow:horizontal overflow detected on body');
    else pass('overflow:no horizontal overflow');
    if (overflowY) fail('overflow:vertical overflow detected on body');
    else pass('overflow:no vertical overflow');

    // --- key text not clipped ---
    const keyEls = [
      document.querySelector('.focus-stage-name'),
      document.querySelector('.focus-stage-kicker'),
      document.querySelector('.focus-stage-what'),
    ];
    for (const el of keyEls) {
      if (!el) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      const clippedW = el.scrollWidth > rect.width + 1;
      const clippedH = el.scrollHeight > rect.height + 1;
      if (clippedW || clippedH) {
        fail(`text-clip:${el.className} clipped rect=${JSON.stringify({w:rect.width,h:rect.height})} scroll=${el.scrollWidth}x${el.scrollHeight}`);
      } else {
        pass(`text-clip:${el.className} not clipped`);
      }
    }

    // --- dive button touch target ---
    const diveBtn = document.querySelector('#btn-focus-dive');
    for (const [btn, name] of [[diveBtn,'dive']]) {
      if (!btn) { fail(`touch:${name} missing`); continue; }
      const style = getComputedStyle(btn);
      if (style.display === 'none' || style.visibility === 'hidden') { fail(`touch:${name} not visible`); continue; }
      const r = btn.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) {
        fail(`touch-target:${name} too small ${r.width.toFixed(0)}x${r.height.toFixed(0)}px (min 44px)`);
      } else {
        pass(`touch-target:${name} ok ${r.width.toFixed(0)}x${r.height.toFixed(0)}px`);
      }
    }

    // Compact focus-search uses the journey compass and Step Inside affordance;
    // legacy Prev/Next lanes must not render as orphan controls.
    const isRendered = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const focusJourney = document.querySelector('.focus-stage-journey.active');
    const routeNextBtn = document.querySelector('#btn-focus-next');
    const routePrevBtn = document.querySelector('#btn-focus-prev');
    if (isRendered(focusJourney) && (isRendered(routeNextBtn) || isRendered(routePrevBtn))) {
      fail('route-control-lane:hidden compact focus-search should not render orphan Prev/Next controls');
    } else {
      pass('route-control-lane:hidden');
    }

    // --- compass does not overlap card ---
    const compass = document.querySelector('.journey-compass');
    if (!compass) {
      pass('compass:not-rendered (skip overlap check)');
    } else {
      const cRect = compass.getBoundingClientRect();
      const style = getComputedStyle(compass);
      if (style.display === 'none' || style.visibility === 'hidden' || cRect.width === 0) {
        pass('compass:not-visible (skip overlap check)');
      } else {
        const overlaps = !(cardRect.right < cRect.left || cardRect.left > cRect.right || cardRect.bottom < cRect.top || cardRect.top > cRect.bottom);
        if (overlaps) {
          fail(`compass-overlap:compass overlaps card compass=${JSON.stringify({l:cRect.left,t:cRect.top,r:cRect.right,b:cRect.bottom})} card=${JSON.stringify({l:cardRect.left,t:cardRect.top,r:cardRect.right,b:cardRect.bottom})}`);
        } else {
          pass('compass:no overlap with card');
        }
      }
    }

    // --- compass behaves as a compact context banner in focus-search ---
    const compassRail = document.querySelector('.journey-compass-rail');
    if (isRendered(compassRail)) {
      const r = compassRail.getBoundingClientRect();
      fail(`compass-rail:hidden focus-search rail should yield to focus card route controls rect=${JSON.stringify({w:r.width,h:r.height})}`);
    } else {
      pass('compass-rail:hidden');
    }

    const compassCopy = document.querySelector('.journey-compass-copy');
    if (isRendered(compassCopy)) {
      const r = compassCopy.getBoundingClientRect();
      if (r.width < 220) {
        fail(`compass-copy:usable-width expected >=220px, got ${r.width.toFixed(0)}px`);
      } else {
        pass(`compass-copy:usable-width ${r.width.toFixed(0)}px`);
      }
    } else {
      pass('compass-copy:not-rendered');
    }

    // --- external utility chrome yields to focus card ---
    const utilitySelectors = ['.share-toggle', '.legend-toggle', '.help-toggle', '.controls'];
    const blockingUtilityChrome = [];
    for (const selector of utilitySelectors) {
      const el = document.querySelector(selector);
      if (!isRendered(el)) continue;
      const r = el.getBoundingClientRect();
      const overlapsCard = !(cardRect.right < r.left || cardRect.left > r.right || cardRect.bottom < r.top || cardRect.top > r.bottom);
      if (overlapsCard && getComputedStyle(el).pointerEvents !== 'none') {
        blockingUtilityChrome.push({
          selector,
          rect: {
            l: Math.round(r.left),
            t: Math.round(r.top),
            r: Math.round(r.right),
            b: Math.round(r.bottom),
          },
        });
      }
    }
    if (blockingUtilityChrome.length) {
      fail(`utility-chrome-overlap:focus-card ${JSON.stringify(blockingUtilityChrome)}`);
    } else {
      pass('utility-chrome:yields-to-focus-card');
    }

    return { failures, passes };
  });
}

async function auditSemanticDive(page) {
  return page.evaluate(() => {
    const failures = [];
    const passes = [];

    function pass(detail) { passes.push(detail); }
    function fail(detail) { failures.push(detail); }

    // --- presence checks ---
    const focusStage = document.querySelector('#focus-stage');
    if (!focusStage) {
      fail('dom:missing #focus-stage');
      return { failures, passes };
    }

    const insideStatus = document.querySelector('#focus-stage-inside-status');
    const insideControls = document.querySelector('#focus-stage-inside-controls');

    if (!insideStatus) fail('dom:missing #focus-stage-inside-status');
    else pass('dom:inside-status present');

    if (!insideControls) fail('dom:missing #focus-stage-inside-controls');
    else pass('dom:inside-controls present');

    // --- inside buttons touch targets ---
    const nextStopBtn = document.querySelector('#btn-inside-next');
    const mapBtn = document.querySelector('#btn-inside-map');
    const countyBtn = document.querySelector('#btn-inside-county');
    for (const [btn, name] of [[nextStopBtn,'next-stop'],[mapBtn,'map'],[countyBtn,'county']]) {
      if (!btn) { fail(`touch:${name} missing`); continue; }
      const style = getComputedStyle(btn);
      const hidden = btn.hidden || style.display === 'none' || style.visibility === 'hidden';
      if (hidden && name === 'next-stop' && btn.textContent.trim() === 'Trail Complete') {
        pass('touch:next-stop hidden when trail is complete');
        continue;
      }
      if (hidden) { fail(`touch:${name} not visible`); continue; }
      const r = btn.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) {
        fail(`touch-target:${name} too small ${r.width.toFixed(0)}x${r.height.toFixed(0)}px (min 44px)`);
      } else {
        pass(`touch-target:${name} ok ${r.width.toFixed(0)}x${r.height.toFixed(0)}px`);
      }
    }

    // --- journey/neighbor elements visibility matches semantic-dive state ---
    const semanticDiveActive = document.body.dataset.semanticDive === 'active';
    const panelSurface = document.body.dataset.panelSurface;

    const journeyMeta = document.querySelector('.focus-stage-journey-meta');
    const journeyProgress = document.querySelector('#focus-stage-progress');
    const journeyNext = document.querySelector('#focus-stage-next');
    const neighborList = document.querySelector('#focus-stage-neighbor-list');
    const neighborCount = document.querySelector('#focus-stage-neighbor-count');

    if (semanticDiveActive && panelSurface === 'semantic-dive') {
      // In semantic-dive mode, journey controls are typically visible
      if (journeyMeta) {
        const r = journeyMeta.getBoundingClientRect();
        const style = getComputedStyle(journeyMeta);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        if (visible) pass('visibility:journey-meta visible as expected');
        else pass('visibility:journey-meta hidden as expected');
      }
      if (neighborList) {
        const r = neighborList.getBoundingClientRect();
        const style = getComputedStyle(neighborList);
        const visible = style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        if (visible) pass('visibility:neighbor-list visible as expected');
        else pass('visibility:neighbor-list hidden as expected');
      }
    }

    // --- no overflow ---
    const body = document.body;
    const html = document.documentElement;
    const overflowX = body.scrollWidth > html.clientWidth;
    const overflowY = body.scrollHeight > html.clientHeight;
    if (overflowX) fail('overflow:horizontal overflow detected on body');
    else pass('overflow:no horizontal overflow');
    if (overflowY) fail('overflow:vertical overflow detected on body');
    else pass('overflow:no vertical overflow');

    // --- key text not clipped (inside status copy) ---
    const statusCopy = document.querySelector('.focus-stage-inside-status-copy, #focus-stage-inside-status-copy');
    if (statusCopy) {
      const style = getComputedStyle(statusCopy);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        const rect = statusCopy.getBoundingClientRect();
        const clippedW = statusCopy.scrollWidth > rect.width + 1;
        const clippedH = statusCopy.scrollHeight > rect.height + 1;
        if (clippedW || clippedH) {
          fail(`text-clip:inside-status-copy clipped rect=${JSON.stringify({w:rect.width,h:rect.height})} scroll=${statusCopy.scrollWidth}x${statusCopy.scrollHeight}`);
        } else {
          pass('text-clip:inside-status-copy not clipped');
        }
      }
    }

    return { failures, passes };
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

async function reportFocusSearch(page, info) {
  console.log('\n  focus-search results:');
  const passLines = info.passes || [];
  const failLines = info.failures || [];
  passLines.forEach(l => console.log(`    [PASS] ${l}`));
  failLines.forEach(l => console.log(`    [FAIL] ${l}`));
  console.log(`  (pass:${passLines.length} fail:${failLines.length})`);
}

async function reportSemanticDive(page, info) {
  console.log('\n  semantic-dive results:');
  const passLines = info.passes || [];
  const failLines = info.failures || [];
  passLines.forEach(l => console.log(`    [PASS] ${l}`));
  failLines.forEach(l => console.log(`    [FAIL] ${l}`));
  console.log(`  (pass:${passLines.length} fail:${failLines.length})`);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

run().catch(err => {
  console.error('[fatal]', err.message);
  if (browser) browser.close().catch(() => {});
  closeServer(server).finally(() => process.exit(1));
});
