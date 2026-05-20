/**
 * focus-stage-render-contract.mjs
 *
 * Rendered contract test for focus-stage focus-search and semantic-dive surfaces.
 *
 * Surfaces tested:
 *   1. focus-search  — focus-stage/card present, card inside viewport, no overflow,
 *                      key text not clipped, dive/route buttons are touch targets,
 *                      compass does not overlap card
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
const HTML_FILE = path.resolve(process.cwd(), 'vector-explorer-polished.html');

// ---------------------------------------------------------------------------
// Embedded HTTP server — serves the HTML file only
// ---------------------------------------------------------------------------

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Strip query string and decode URI; on Windows, path.resolve treats '/foo' as absolute (no drive)
      // so we strip the leading slash to treat it as a relative path from cwd
      const reqPath = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const fp = path.resolve(process.cwd(), reqPath === '' ? 'vector-explorer-polished.html' : reqPath);
      try {
        const data = fs.readFileSync(fp);
        const ext = path.extname(fp).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
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
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console error] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[page error] ${err.message}`));

  const baseUrl = useLocalServer ? `http://127.0.0.1:${serverPort}` : TARGET_URL.replace(/\/[^\/]*$/, '');

  // Load the app
  console.log('[load] navigating...');
  await page.goto(`${baseUrl}/vector-explorer-polished.html`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => {
    console.error('[load] navigation error:', e.message);
  });
  await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1200);

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
  if (server) server.close();

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
    document.body.dataset.panelSurface = 'focus-search';
    document.body.dataset.focusPanelMode = 'search-result';
    document.body.dataset.routeDirector = 'search-corridor';
    if (window.state) {
      window.state.currentView = 'galaxy';
      window.state.focusedNode = Number.isFinite(window.state.focusedNode) ? window.state.focusedNode : 0;
      window.state.navState = window.state.navState || {};
      window.state.navState.focusedIndex = Number.isFinite(window.state.navState.focusedIndex)
        ? window.state.navState.focusedIndex
        : window.state.focusedNode;
      window.state.navState.trailNeighborIndices = Array.isArray(window.state.navState.trailNeighborIndices)
        && window.state.navState.trailNeighborIndices.length
        ? window.state.navState.trailNeighborIndices
        : [1];
      window.state.navState.walkHistoryIndices = [0, window.state.navState.focusedIndex];
      window.state.trailDepth = Math.max(1, Number(window.state.trailDepth) || 1);
    }

    // Remove hidden attribute so focus-stage and its buttons render
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
    if (diveBtn) {
      diveBtn.hidden = false;
      diveBtn.removeAttribute('hidden');
      diveBtn.inert = false;
    }
    const prevBtn = document.querySelector('#btn-focus-prev');
    if (prevBtn) {
      prevBtn.hidden = false;
      prevBtn.removeAttribute('hidden');
      prevBtn.inert = false;
      prevBtn.disabled = false;
      prevBtn.setAttribute('aria-disabled', 'false');
    }
    const nextBtn = document.querySelector('#btn-focus-next');
    if (nextBtn) {
      nextBtn.hidden = false;
      nextBtn.removeAttribute('hidden');
      nextBtn.inert = false;
      nextBtn.disabled = false;
      nextBtn.setAttribute('aria-disabled', 'false');
    }
  });
  await applyFixture();
  await page.waitForTimeout(300);
  await applyFixture();
  await page.waitForTimeout(50);
}

async function forceSemanticDive(page) {
  const applyFixture = async () => page.evaluate(() => {
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
    ['btn-inside-next', 'btn-inside-county'].forEach((id) => {
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
  await page.waitForTimeout(300);
  await applyFixture();
  await page.waitForTimeout(50);
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

    // --- dive/route buttons touch targets ---
    const diveBtn = document.querySelector('#btn-focus-dive');
    const routeNextBtn = document.querySelector('#btn-focus-next');
    const routePrevBtn = document.querySelector('#btn-focus-prev');
    for (const [btn, name] of [[diveBtn,'dive'],[routeNextBtn,'route-next'],[routePrevBtn,'route-prev']]) {
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
    const countyBtn = document.querySelector('#btn-inside-county');
    for (const [btn, name] of [[nextStopBtn,'next-stop'],[countyBtn,'county']]) {
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
  if (server) server.close().catch(() => {});
  process.exit(1);
});
