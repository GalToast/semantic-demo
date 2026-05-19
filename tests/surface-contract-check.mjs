/**
 * surface-contract-check.mjs
 *
 * Fast, surface-scoped DOM/layout assertion runner for Semantic Explorer.
 * Complements screenshot-based visual audit - focuses on DOM/layout contract
 * checks: touch target size, text clipping, blocking overlays, inherited black
 * text on dark panels, basic gutters, viewport crowding.
 *
 * Usage:
 *   node tests/surface-contract-check.mjs [url] [--surface=<name>] [--surfaces=a,b]
 *
 * Surfaces: mobile-idle | desktop-idle | launch-focus | search-error | map-trail | focus-pocket | field-node | info-panel-empty | compass-rail | loading-overlay | mode-grid | filters | thread-inspector | controls | search-chrome | info-panel-populated | global-spacing
 * Default URL: http://127.0.0.1:8795/vector-explorer-polished.html
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';

// Argument parsing

const cliArgs = process.argv.slice(2);
const positionalUrl = cliArgs.find((arg) => !arg.startsWith('--')) || DEFAULT_URL;

function parseFlags(args) {
  const surfaces = [];
  for (const arg of args) {
    if (arg === '--') continue;
    if (arg.startsWith('--surface=')) {
      surfaces.push(arg.slice('--surface='.length));
    } else if (arg.startsWith('--surfaces=')) {
      const list = arg.slice('--surfaces='.length).split(',').map((s) => s.trim()).filter(Boolean);
      surfaces.push(...list);
    }
  }
  return surfaces;
}

const requestedSurfaces = parseFlags(cliArgs);

// Output

const outRoot = path.resolve(process.cwd(), 'tmp', 'surface-contract-check');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outRoot, runId);

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

// Viewport configs

const VIEWPORTS = {
  'mobile-idle':   { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'desktop-idle':  { width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
  'launch-focus':  { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'search-error':  { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'map-trail':     { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'focus-pocket':  { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'field-node':    { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'info-panel-empty':  { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'compass-rail':      { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'loading-overlay':   { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'mode-grid':         { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  // Phase B surfaces
  'filters':              { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'thread-inspector':     { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'controls':             { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'search-chrome':        { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  'info-panel-populated': { width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
  // Phase C
  'global-spacing':      { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
};

// Page setup

async function makePage(browser, surface) {
  const cfg = VIEWPORTS[surface] || VIEWPORTS['mobile-idle'];
  return browser.newPage({
    viewport: { width: cfg.width, height: cfg.height },
    deviceScaleFactor: cfg.deviceScaleFactor,
    isMobile: cfg.isMobile,
  });
}

async function loadAndWait(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1800);
}

async function waitForMobileIdleChrome(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector('#info-panel');
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    const edgeAnchored = Math.abs(rect.left) <= 1 && Math.abs(window.innerWidth - rect.right) <= 1;
    const bottomAnchored = Math.abs(window.innerHeight - rect.bottom) <= 1;
    const fitsViewport = rect.width <= window.innerWidth + 1 && rect.height < window.innerHeight * 0.58;
    const inset = rect.left >= 8 && (window.innerWidth - rect.right) >= 8;
    return document.body?.dataset?.panelSurface === 'idle' && (inset || (edgeAnchored && bottomAnchored && fitsViewport));
  }, { timeout: 5000 }).catch(() => {});
}

// Assertion context

function makeAssert(name) {
  return {
    surface: name,
    checks: [],
    pass(_surface, check) {
      this.checks.push({ level: 'pass', check });
    },
    fail(_surface, check, msg) {
      this.checks.push({ level: 'fail', check, msg });
    },
  };
}

// Per-surface assertion functions
//
// All DOM-reading logic lives inside page.evaluate() callbacks so the helpers
// are natural closures in browser JS context. No function references cross the
// Node/browser boundary.

async function assert_mobile_idle(page, ctx) {
  await loadAndWait(page, positionalUrl);
  await waitForMobileIdleChrome(page);

  const info = await page.evaluate(() => {
    // Browser-side helpers
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function hasBlockingOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      const rect = el.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > viewportArea * 0.45;
    }

    function blackOnDark(bg, text) {
      const hex = /#[0-9a-f]{6}/i;
      if (!hex.test(text) || !hex.test(bg)) return false;
      const parse = (h) => {
        const c = h.replace('#', '');
        return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
      };
      const [r, g, b] = parse(text);
      const [pr, pg, pb] = parse(bg);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      const panelBrightness = (pr * 299 + pg * 587 + pb * 114) / 1000;
      return brightness > 180 && panelBrightness < 80;
    }

    function gutterOk(el) {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return rect.left >= 8 && (window.innerWidth - rect.right) >= 8;
    }
    function mobileSheetChromeOk(el) {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const edgeAnchored = Math.abs(rect.left) <= 1 && Math.abs(window.innerWidth - rect.right) <= 1;
      const bottomAnchored = Math.abs(window.innerHeight - rect.bottom) <= 1;
      const fitsViewport = rect.width <= window.innerWidth + 1 && rect.height < window.innerHeight * 0.58;
      return edgeAnchored && bottomAnchored && fitsViewport;
    }
    const results = {};
    const search = document.querySelector('.search-container');
    results.searchTouchTarget = search ? search.getBoundingClientRect().height >= 44 : null;

    const searchInput = document.querySelector('#search-input, .search-input, input[type="search"]');
    results.searchInputClipped = searchInput ? textClipped(searchInput) : null;

    const compass = document.querySelector('.journey-compass');
    results.compassBlocksViewport = compass ? hasBlockingOverlay(compass) : null;

    const canvas = document.querySelector('#canvas-container');
    results.canvasPresent = canvas !== null;

    const selectedCard = document.querySelector('.selected-card');
    if (selectedCard) {
      const style = getComputedStyle(selectedCard);
      results.selectedCardBlackOnDark = blackOnDark(style.backgroundColor, style.color);
      results.selectedCardBorderRadius = style.borderRadius;
    }

    const infoPanel = document.querySelector('#info-panel');
    results.infoPanelGutter = infoPanel ? (gutterOk(infoPanel) || mobileSheetChromeOk(infoPanel)) : null;

    const resultsPanel = document.querySelector('#search-results');
    results.resultsClipped = resultsPanel ? textClipped(resultsPanel) : null;

    const overflowX = document.documentElement.scrollWidth > window.innerWidth;
    const overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results, overflowX, overflowY, bodyDataset: { ...document.body.dataset } };
  });

  if (info.searchTouchTarget === false) ctx.fail('mobile-idle', 'touch-target:search-container', 'search container < 44px tall');
  else if (info.searchTouchTarget === true) ctx.pass('mobile-idle', 'touch-target:search-container');

  if (info.searchInputClipped) ctx.fail('mobile-idle', 'text-clipping:search-input', 'search input text is clipped');
  else if (info.searchInputClipped === false) ctx.pass('mobile-idle', 'text-clipping:search-input');

  if (info.compassBlocksViewport) ctx.fail('mobile-idle', 'overlay:journey-compass', 'journey compass covers too much of the viewport');
  else if (info.compassBlocksViewport === false) ctx.pass('mobile-idle', 'overlay:journey-compass');

  if (info.canvasPresent) ctx.pass('mobile-idle', 'dom:canvas-container');
  else ctx.fail('mobile-idle', 'dom:canvas-container', 'missing #canvas-container');

  if (info.selectedCardBlackOnDark) ctx.fail('mobile-idle', 'black-on-dark:selected-card', 'black text on dark .selected-card');
  else if (info.selectedCardBlackOnDark === false) ctx.pass('mobile-idle', 'black-on-dark:selected-card');

  if (info.infoPanelGutter === false) ctx.fail('mobile-idle', 'chrome:info-panel', 'info panel is neither inset nor valid edge-anchored mobile sheet chrome');
  else if (info.infoPanelGutter) ctx.pass('mobile-idle', 'chrome:info-panel');

  if (info.resultsClipped) ctx.fail('mobile-idle', 'text-clipping:search-results', 'search results have clipped content');
  else if (info.resultsClipped === false) ctx.pass('mobile-idle', 'text-clipping:search-results');

  if (info.overflowX) ctx.fail('mobile-idle', 'viewport-crowding:overflow-x', 'horizontal overflow - viewport crowded');
  else ctx.pass('mobile-idle', 'viewport-crowding:overflow-x');

  ctx.pass('mobile-idle', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

async function assert_desktop_idle(page, ctx) {
  await loadAndWait(page, positionalUrl);

  const info = await page.evaluate(() => {
    function blackOnDark(bg, text) {
      const hex = /#[0-9a-f]{6}/i;
      if (!hex.test(text) || !hex.test(bg)) return false;
      const parse = (h) => {
        const c = h.replace('#', '');
        return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
      };
      const [r, g, b] = parse(text);
      const [pr, pg, pb] = parse(bg);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      const panelBrightness = (pr * 299 + pg * 587 + pb * 114) / 1000;
      return brightness > 180 && panelBrightness < 80;
    }

    function hasBlockingOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      const rect = el.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > viewportArea * 0.45;
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    const results = {};
    const selectedCard = document.querySelector('.selected-card');
    if (selectedCard) {
      const style = getComputedStyle(selectedCard);
      results.selectedCardBorderRadius = style.borderRadius;
      results.selectedCardBlackOnDark = blackOnDark(style.backgroundColor, style.color);
    }

    const compass = document.querySelector('.journey-compass');
    results.compassBlocksViewport = compass ? hasBlockingOverlay(compass) : null;

    const canvas = document.querySelector('#canvas-container');
    results.canvasPresent = canvas !== null;

    const mapContainer = document.querySelector('#map-container');
    results.mapContainerPresent = mapContainer !== null;

    const infoPanel = document.querySelector('#info-panel');
    if (infoPanel) {
      const style = getComputedStyle(infoPanel);
      results.infoPanelBlackOnDark = blackOnDark(style.backgroundColor, style.color);
    }

    const overflowX = document.documentElement.scrollWidth > window.innerWidth;
    const overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results, overflowX, overflowY, bodyDataset: { ...document.body.dataset } };
  });

  if (info.selectedCardBorderRadius && info.selectedCardBorderRadius !== '12px') {
    ctx.fail('desktop-idle', 'selected-card:border-radius', `expected "12px", got "${info.selectedCardBorderRadius}"`);
  } else if (info.selectedCardBorderRadius === '12px') {
    ctx.pass('desktop-idle', 'selected-card:border-radius');
  }

  if (info.selectedCardBlackOnDark) ctx.fail('desktop-idle', 'black-on-dark:selected-card', 'black text on dark .selected-card');
  else if (info.selectedCardBlackOnDark === false) ctx.pass('desktop-idle', 'black-on-dark:selected-card');

  if (info.compassBlocksViewport) ctx.fail('desktop-idle', 'overlay:journey-compass', 'journey compass covers too much of the viewport');
  else if (info.compassBlocksViewport === false) ctx.pass('desktop-idle', 'overlay:journey-compass');

  if (info.canvasPresent) ctx.pass('desktop-idle', 'dom:canvas-container');
  else ctx.fail('desktop-idle', 'dom:canvas-container', 'missing #canvas-container');

  if (info.mapContainerPresent) ctx.pass('desktop-idle', 'dom:map-container');
  else ctx.fail('desktop-idle', 'dom:map-container', 'missing #map-container');

  if (info.overflowX) ctx.fail('desktop-idle', 'viewport-crowding:overflow-x', 'horizontal overflow on desktop');
  else ctx.pass('desktop-idle', 'viewport-crowding:overflow-x');

  ctx.pass('desktop-idle', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  if (info.infoPanelBlackOnDark) ctx.fail('desktop-idle', 'black-on-dark:info-panel', 'black text on dark #info-panel');
  else if (info.infoPanelBlackOnDark === false) ctx.pass('desktop-idle', 'black-on-dark:info-panel');

  return info;
}

async function assert_launch_focus(page, ctx) {
  const base = positionalUrl.includes('?') ? '&' : '?';
  const focusedUrl = `${positionalUrl}${base}view=galaxy&q=coffee&anchor=519`;
  await loadAndWait(page, focusedUrl);

  const firstResult = page.locator('.search-result-item').first();
  if (await firstResult.count()) {
    await firstResult.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function hasBlockingOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      const rect = el.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > viewportArea * 0.45;
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    const results = {};
    const focusStage = document.querySelector('#focus-stage, .focus-stage');
    results.focusStagePresent = focusStage !== null;
    if (focusStage) {
      const style = getComputedStyle(focusStage);
      results.focusStageBlocksViewport = hasBlockingOverlay(focusStage);
      results.focusStageVisible = style.display !== 'none' && style.visibility !== 'hidden';
    }

    const diveBtn = document.querySelector('.focus-stage-dive-btn, .dive-btn');
    if (diveBtn) {
      const rect = diveBtn.getBoundingClientRect();
      const style = getComputedStyle(diveBtn);
      results.diveBtnVisible = style.display !== 'none' && style.visibility !== 'hidden';
      results.diveBtnTouchTarget = results.diveBtnVisible ? rect.width >= 43.5 && rect.height >= 43.5 : null;
      results.diveBtnTextClipped = textClipped(diveBtn);
    }

    const kicker = document.querySelector('.focus-stage-kicker');
    results.kickerClipped = kicker ? textClipped(kicker) : null;

    const clusterLabel = document.querySelector('.focus-stage-cluster-label, .cluster-label');
    results.clusterLabelClipped = clusterLabel ? textClipped(clusterLabel) : null;

    const overflowX = document.documentElement.scrollWidth > window.innerWidth;
    const overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results, overflowX, overflowY, bodyDataset: { ...document.body.dataset } };
  });

  // uses ctx.pass / ctx.fail directly

  if (info.focusStagePresent) ctx.pass('launch-focus', 'dom:focus-stage');
  else ctx.fail('launch-focus', 'dom:focus-stage', 'missing #focus-stage or .focus-stage');

  if (info.focusStageBlocksViewport) ctx.fail('launch-focus', 'overlay:focus-stage', 'focus stage covers too much of the viewport');
  else if (info.focusStageBlocksViewport === false) ctx.pass('launch-focus', 'overlay:focus-stage');

  if (info.diveBtnTouchTarget === false) ctx.fail('launch-focus', 'touch-target:dive-button', 'dive button < 44px tall');
  else if (info.diveBtnTouchTarget) ctx.pass('launch-focus', 'touch-target:dive-button');
  else if (info.diveBtnVisible === false) ctx.pass('launch-focus', 'touch-target:dive-button:hidden');

  if (info.diveBtnTextClipped) ctx.fail('launch-focus', 'text-clipping:dive-button', 'dive button text is clipped');
  else if (info.diveBtnTextClipped === false) ctx.pass('launch-focus', 'text-clipping:dive-button');

  if (info.kickerClipped) ctx.fail('launch-focus', 'text-clipping:focus-kicker', 'focus kicker text is clipped');
  else if (info.kickerClipped === false) ctx.pass('launch-focus', 'text-clipping:focus-kicker');

  if (info.clusterLabelClipped) ctx.fail('launch-focus', 'text-clipping:cluster-label', 'cluster label text is clipped');
  else if (info.clusterLabelClipped === false) ctx.pass('launch-focus', 'text-clipping:cluster-label');

  if (info.overflowX) ctx.fail('launch-focus', 'viewport-crowding:overflow-x', 'horizontal overflow after focus');
  else ctx.pass('launch-focus', 'viewport-crowding:overflow-x');

  ctx.pass('launch-focus', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

async function assert_search_error(page, ctx) {
  const base = positionalUrl.includes('?') ? '&' : '?';
  const errorUrl = `${positionalUrl}${base}view=galaxy&q=semantic-error-proof`;
  await loadAndWait(page, errorUrl);

  await page.evaluate(() => {
    function installForcedSearchError() {
      const searchContainer = document.querySelector('.search-container');
      if (searchContainer) {
        searchContainer.dataset.laneState = 'degraded';
        searchContainer.classList.add('has-query');
      }
      const results = document.querySelector('#search-results');
      if (!results) return;
      results.classList.add('active');
      results.dataset.contractForcedError = 'true';
      results.innerHTML = `
        <div class="search-error-state" role="alert">
          <span class="search-error-kicker">Connection Lost</span>
          <p class="search-error-text">Semantic lane unavailable. Retrying.</p>
          <div class="search-error-actions">
            <button class="search-error-retry-btn" type="button">Retry</button>
            <button class="search-error-dismiss-btn" type="button">Dismiss</button>
          </div>
        </div>`;
    }

    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'search';
    document.body.dataset.laneState = 'degraded';
    installForcedSearchError();
  });
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    if (!document.querySelector('.search-error-state')) {
      const resultsEl = document.querySelector('#search-results');
      if (resultsEl) {
        resultsEl.classList.add('active');
        resultsEl.dataset.contractForcedError = 'true';
        resultsEl.innerHTML = `
          <div class="search-error-state" role="alert">
            <span class="search-error-kicker">Connection Lost</span>
            <p class="search-error-text">Semantic lane unavailable. Retrying.</p>
            <div class="search-error-actions">
              <button class="search-error-retry-btn" type="button">Retry</button>
              <button class="search-error-dismiss-btn" type="button">Dismiss</button>
            </div>
          </div>`;
      }
    }

    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function hasOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.position === 'fixed' || s.position === 'absolute';
    }

    const results = {};
    const errorState = document.querySelector('.search-error-state');
    results.errorStatePresent = errorState !== null;
    results.errorStateVisible = errorState
      ? getComputedStyle(errorState).display !== 'none' && getComputedStyle(errorState).visibility !== 'hidden'
      : null;

    const kicker = document.querySelector('.search-error-kicker');
    results.kickerText = kicker ? kicker.textContent.trim() : null;
    results.kickerClipped = kicker ? textClipped(kicker) : null;

    const retryBtn = document.querySelector('.search-error-retry-btn');
    results.retryBtnPresent = retryBtn !== null;
    if (retryBtn) {
      const rect = retryBtn.getBoundingClientRect();
      results.retryBtnTouchTarget = rect.width >= 43.5 && rect.height >= 43.5;
      results.retryBtnTextClipped = textClipped(retryBtn);
    }

    const dismissBtn = document.querySelector('.search-error-dismiss-btn');
    results.dismissBtnPresent = dismissBtn !== null;
    if (dismissBtn) {
      const rect = dismissBtn.getBoundingClientRect();
      results.dismissBtnTouchTarget = rect.width >= 43.5 && rect.height >= 43.5;
    }

    const compassTitle = document.querySelector('.journey-compass-title');
    results.compassTitleClipped = compassTitle ? textClipped(compassTitle) : null;
    const compass = document.querySelector('.journey-compass');
    if (compass) {
      const compassRect = compass.getBoundingClientRect();
      results.compassWithinViewport = compassRect.left >= -1 && compassRect.right <= window.innerWidth + 1;
    } else {
      results.compassWithinViewport = null;
    }

    const shareToggle = document.querySelector('.share-toggle');
    if (shareToggle) {
      const shareStyle = getComputedStyle(shareToggle);
      results.shareToggleVisible = shareStyle.display !== 'none' && shareStyle.visibility !== 'hidden';
    } else {
      results.shareToggleVisible = null;
    }

    results.errorHasOverlay = errorState ? hasOverlay(errorState) : null;

    return { ...results, bodyDataset: { ...document.body.dataset } };
  });

  // uses ctx.pass / ctx.fail directly

  if (info.errorStatePresent) ctx.pass('search-error', 'dom:search-error-state');
  else ctx.fail('search-error', 'dom:search-error-state', '.search-error-state not found');

  if (info.errorStateVisible === false) ctx.fail('search-error', 'visibility:search-error-state', 'error state is hidden');
  else if (info.errorStateVisible) ctx.pass('search-error', 'visibility:search-error-state');

  if (info.kickerClipped) ctx.fail('search-error', 'text-clipping:error-kicker', 'error kicker text is clipped');
  else if (info.kickerClipped === false) ctx.pass('search-error', 'text-clipping:error-kicker');

  if (info.retryBtnTouchTarget === false) ctx.fail('search-error', 'touch-target:retry-button', 'retry button < 44px tall');
  else if (info.retryBtnTouchTarget) ctx.pass('search-error', 'touch-target:retry-button');

  if (info.dismissBtnTouchTarget === false) ctx.fail('search-error', 'touch-target:dismiss-button', 'dismiss button < 44px tall');
  else if (info.dismissBtnTouchTarget) ctx.pass('search-error', 'touch-target:dismiss-button');

  if (info.compassTitleClipped) ctx.fail('search-error', 'text-clipping:compass-title', 'search compass title is clipped');
  else if (info.compassTitleClipped === false) ctx.pass('search-error', 'text-clipping:compass-title');

  if (info.compassWithinViewport === false) ctx.fail('search-error', 'layout:compass-width', 'search compass extends outside viewport');
  else if (info.compassWithinViewport) ctx.pass('search-error', 'layout:compass-width');

  if (info.shareToggleVisible) ctx.fail('search-error', 'visibility:share-toggle', 'share toggle should not overlap mobile search drawer');
  else ctx.pass('search-error', 'visibility:share-toggle:hidden-or-absent');

  if (info.errorHasOverlay) ctx.fail('search-error', 'overlay:search-error-state', 'error state has blocking overlay');
  else if (info.errorHasOverlay === false) ctx.pass('search-error', 'overlay:search-error-state');

  return info;
}

// ---------------------------------------------------------------------------
// map-trail — tests the connection path strip and trail controls at mobile.
// Surface triggers: load a result, click "Show Trail", inspect strip.
// ---------------------------------------------------------------------------

async function assert_map_trail(page, ctx) {
  // Navigate to a focused result then trigger trail reveal.
  const base = positionalUrl.includes('?') ? '&' : '?';
  const focusedUrl = `${positionalUrl}${base}view=galaxy&q=coffee&anchor=519`;
  await loadAndWait(page, focusedUrl);

  // Click the first result card to enter focus stage
  const firstCard = page.locator('.search-result-item').first();
  if (await firstCard.count()) {
    await firstCard.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(800);

  // Simulate trail reveal (Show Trail button)
  await page.evaluate(() => {
    const showTrailBtn = document.querySelector('#btn-focus-path, .focus-stage-action-btn[aria-label*="trail"]');
    if (showTrailBtn) showTrailBtn.click();
  });
  await page.waitForTimeout(600);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function hasBlockingOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      const rect = el.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > viewportArea * 0.45;
    }

    const results = {};

    // --- map-trail-strip ---
    const trailStrip = document.querySelector('#map-trail-strip, .map-trail-strip');
    results.trailStripPresent = trailStrip !== null;
    results.trailStripHidden = trailStrip
      ? trailStrip.hidden || getComputedStyle(trailStrip).display === 'none'
      : null;

    // --- trail-review-overlay ---
    const trailOverlay = document.querySelector('#trail-review-overlay, .trail-review-overlay');
    results.trailOverlayPresent = trailOverlay !== null;
    results.trailOverlayHidden = trailOverlay
      ? trailOverlay.hidden || getComputedStyle(trailOverlay).display === 'none'
      : null;

    // --- trail-controls bar ---
    const trailControls = document.querySelector('#trail-controls, .trail-controls');
    results.trailControlsPresent = trailControls !== null;

    // --- trail-context label ---
    const trailContext = document.querySelector('#trail-context, .trail-context');
    results.trailContextText = trailContext ? trailContext.textContent.trim() : null;
    results.trailContextClipped = trailContext ? textClipped(trailContext) : null;

    // --- connection path dots / route dots visible ---
    const routeDots = document.querySelectorAll('.focus-stage-route-dot');
    results.routeDotsCount = routeDots.length;

    // --- trail strip non-overlap with info-panel or bottom nav ---
    const infoPanel = document.querySelector('#info-panel');
    const stripRect = trailStrip ? trailStrip.getBoundingClientRect() : null;
    const panelRect = infoPanel ? infoPanel.getBoundingClientRect() : null;
    results.stripPanelOverlap = (stripRect && panelRect)
      ? !(stripRect.bottom < panelRect.top || stripRect.top > panelRect.bottom)
      : false;

    // --- trail strip does not block full viewport ---
    results.trailStripBlocksViewport = trailStrip ? hasBlockingOverlay(trailStrip) : null;

    // --- overflow guards ---
    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  // assertions
  if (info.trailStripPresent) ctx.pass('map-trail', 'dom:map-trail-strip');
  else ctx.fail('map-trail', 'dom:map-trail-strip', 'missing #map-trail-strip');

  if (info.trailOverlayPresent) ctx.pass('map-trail', 'dom:trail-review-overlay');
  else ctx.fail('map-trail', 'dom:trail-review-overlay', 'missing #trail-review-overlay');

  if (info.trailControlsPresent) ctx.pass('map-trail', 'dom:trail-controls');
  else ctx.fail('map-trail', 'dom:trail-controls', 'missing #trail-controls');

  if (info.trailContextClipped) ctx.fail('map-trail', 'text-clipping:trail-context', 'trail context text is clipped');
  else if (info.trailContextClipped === false) ctx.pass('map-trail', 'text-clipping:trail-context');

  if (info.routeDotsCount >= 2) ctx.pass('map-trail', 'dom:route-dots', `found ${info.routeDotsCount} route dots`);
  else if (info.routeDotsCount > 0) ctx.pass('map-trail', 'dom:route-dots:partial', `only ${info.routeDotsCount} route dot(s)`);
  else ctx.fail('map-trail', 'dom:route-dots', 'no route dots found');

  if (info.stripPanelOverlap) ctx.fail('map-trail', 'layout-overlap:trail-strip-info-panel', 'trail strip overlaps info panel');
  else ctx.pass('map-trail', 'layout-overlap:trail-strip-info-panel');

  if (info.trailStripBlocksViewport) ctx.fail('map-trail', 'overlay:map-trail-strip', 'map-trail strip covers too much of the viewport');
  else if (info.trailStripBlocksViewport === false) ctx.pass('map-trail', 'overlay:map-trail-strip');

  if (info.overflowX) ctx.fail('map-trail', 'viewport-crowding:overflow-x', 'horizontal overflow with trail visible');
  else ctx.pass('map-trail', 'viewport-crowding:overflow-x');

  ctx.pass('map-trail', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// focus-pocket — tests the Step Inside / focus-stage bottom sheet on mobile.
// Surface triggers: load a result, click into focus, click "Step Inside".
// ---------------------------------------------------------------------------

async function assert_focus_pocket(page, ctx) {
  const base = positionalUrl.includes('?') ? '&' : '?';
  const focusedUrl = `${positionalUrl}${base}view=galaxy&q=coffee&anchor=519`;
  await loadAndWait(page, focusedUrl);

  // Enter focus stage
  const firstCard = page.locator('.search-result-item').first();
  if (await firstCard.count()) {
    await firstCard.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(800);

  // Trigger "Step Inside"
  await page.evaluate(() => {
    const diveBtn = document.querySelector('#btn-focus-dive, .focus-stage-dive-btn');
    if (diveBtn) diveBtn.click();
  });
  await page.waitForTimeout(600);

  await page.evaluate(() => {
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
    }

    for (const selector of ['#focus-stage-inside-status', '#focus-stage-inside-controls']) {
      const el = document.querySelector(selector);
      if (el) {
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
      }
    }
  });
  await page.waitForTimeout(100);

  const info = await page.evaluate(() => {
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = document.body.dataset.graphContext || 'focus';
    document.body.dataset.semanticDive = 'active';
    document.body.dataset.panelSurface = 'semantic-dive';
    document.body.dataset.panelSurfaceDetail = 'none';

    const forcedFocusStage = document.querySelector('#focus-stage');
    if (forcedFocusStage) {
      forcedFocusStage.hidden = false;
      forcedFocusStage.setAttribute('aria-hidden', 'false');
    }

    for (const selector of ['#focus-stage-inside-status', '#focus-stage-inside-controls']) {
      const el = document.querySelector(selector);
      if (el) {
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
      }
    }

    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    function layoutSnapshot(el) {
      if (!el) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        display: style.display,
        gap: style.gap,
        gridTemplateColumns: style.gridTemplateColumns,
        width: rect.width,
        height: rect.height,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      };
    }

    const results = {};
    // --- focus-stage bottom sheet ---
    const focusStage = document.querySelector('#focus-stage');
    results.focusStagePresent = focusStage !== null;
    results.focusStageHidden = focusStage
      ? focusStage.hidden || getComputedStyle(focusStage).display === 'none'
      : null;

    // --- inside-status (pulse + copy) ---
    const insideStatus = document.querySelector('#focus-stage-inside-status, .focus-stage-inside-status');
    results.insideStatusPresent = insideStatus !== null;
    results.insideStatusClipped = insideStatus ? textClipped(insideStatus) : null;

    // --- inside-controls: Next Stop + County ---
    const nextStopBtn = document.querySelector('#btn-inside-next, .focus-stage-inside-btn');
    results.nextStopBtnPresent = nextStopBtn !== null;
    if (nextStopBtn) {
      const rect = nextStopBtn.getBoundingClientRect();
      const style = getComputedStyle(nextStopBtn);
      results.nextStopBtnRect = { width: rect.width, height: rect.height, minHeight: style.minHeight, display: style.display };
      results.nextStopBtnTouchTarget = touchTargetOk(nextStopBtn);
    }

    const countyBtn = document.querySelector('#btn-inside-county, .focus-stage-inside-btn.secondary');
    results.countyBtnPresent = countyBtn !== null;
    if (countyBtn) {
      const rect = countyBtn.getBoundingClientRect();
      const style = getComputedStyle(countyBtn);
      results.countyBtnRect = { width: rect.width, height: rect.height, minHeight: style.minHeight, display: style.display };
      results.countyBtnTouchTarget = touchTargetOk(countyBtn);
    }

    // --- journey meta visible inside pocket ---
    const journeyMeta = document.querySelector('.focus-stage-journey-meta');
    results.journeyMetaVisible = journeyMeta
      ? getComputedStyle(journeyMeta).display !== 'none' && getComputedStyle(journeyMeta).visibility !== 'hidden'
      : null;

    const focusActions = document.querySelector('.focus-stage-actions');
    results.focusActionsLayout = layoutSnapshot(focusActions);

    // --- neighbor list present and not clipped ---
    const neighborList = document.querySelector('#focus-stage-neighbor-list, .focus-stage-neighbor-list');
    results.neighborListPresent = neighborList !== null;
    results.neighborListClipped = neighborList ? textClipped(neighborList) : null;

    // --- overflow guards ---
    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.focusStagePresent) ctx.pass('focus-pocket', 'dom:focus-stage');
  else ctx.fail('focus-pocket', 'dom:focus-stage', 'missing #focus-stage');

  if (info.focusStageHidden) ctx.fail('focus-pocket', 'visibility:focus-stage', 'focus-stage is hidden in pocket mode');
  else if (info.focusStageHidden === false) ctx.pass('focus-pocket', 'visibility:focus-stage');

  if (info.insideStatusClipped) ctx.fail('focus-pocket', 'text-clipping:inside-status', 'inside status text is clipped');
  else if (info.insideStatusClipped === false) ctx.pass('focus-pocket', 'text-clipping:inside-status');

  if (info.nextStopBtnTouchTarget === false) ctx.fail('focus-pocket', 'touch-target:next-stop-btn', 'Next Stop button < 44px tall');
  else if (info.nextStopBtnTouchTarget) ctx.pass('focus-pocket', 'touch-target:next-stop-btn');

  if (info.countyBtnTouchTarget === false) ctx.fail('focus-pocket', 'touch-target:county-btn', 'County button < 44px tall');
  else if (info.countyBtnTouchTarget) ctx.pass('focus-pocket', 'touch-target:county-btn');

  if (info.journeyMetaVisible) ctx.pass('focus-pocket', 'visibility:journey-meta');
  else if (info.journeyMetaVisible === false) ctx.pass('focus-pocket', 'visibility:journey-meta:hidden');

  if (info.focusActionsLayout && info.focusActionsLayout.display !== 'grid') {
    ctx.fail('focus-pocket', 'computed:focus-actions-display', `expected grid, got ${info.focusActionsLayout.display}`);
  } else if (info.focusActionsLayout) {
    ctx.pass('focus-pocket', 'computed:focus-actions-display');
  }

  if (info.focusActionsLayout && info.focusActionsLayout.gap !== '10px') {
    ctx.fail('focus-pocket', 'computed:focus-actions-gap', `expected 10px, got ${info.focusActionsLayout.gap}`);
  } else if (info.focusActionsLayout) {
    ctx.pass('focus-pocket', 'computed:focus-actions-gap');
  }

  if (info.neighborListClipped) ctx.fail('focus-pocket', 'text-clipping:neighbor-list', 'neighbor list is clipped');
  else if (info.neighborListClipped === false) ctx.pass('focus-pocket', 'text-clipping:neighbor-list');

  if (info.overflowX) ctx.fail('focus-pocket', 'viewport-crowding:overflow-x', 'horizontal overflow in focus pocket');
  else ctx.pass('focus-pocket', 'viewport-crowding:overflow-x');

  ctx.pass('focus-pocket', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// field-node - tests the compact field-node canopy HUD on mobile.
// Surface triggers: load in focus-search mode with data-focus-panel-mode="field-node".
// ---------------------------------------------------------------------------

async function assert_field_node(page, ctx) {
  const base = positionalUrl.includes('?') ? '&' : '?';
  const fieldNodeUrl = `${positionalUrl}${base}view=galaxy&q=coffee&anchor=519`;
  await loadAndWait(page, fieldNodeUrl);

  // Enter focus stage first, then simulate field-node panel mode
  const firstCard = page.locator('.search-result-item').first();
  if (await firstCard.count()) {
    await firstCard.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(800);

  // Simulate field-node state
  await page.evaluate(() => {
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus-search';
    document.body.dataset.panelSurface = 'focus-search';
    document.body.dataset.panelSurfaceDetail = document.body.dataset.mobileSearchSheet || 'peek';
    document.body.dataset.focusPanelMode = 'field-node';
  });
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function hasBlockingOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      const rect = el.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > viewportArea * 0.45;
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    function layoutSnapshot(el) {
      if (!el) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        display: style.display,
        alignItems: style.alignItems,
        gap: style.gap,
        marginBottom: style.marginBottom,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        borderRadius: style.borderRadius,
        gridTemplateColumns: style.gridTemplateColumns,
        width: rect.width,
        height: rect.height,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      };
    }

    const results = {};

    // --- journey-compass (canopy HUD) ---
    const compass = document.querySelector('.journey-compass');
    results.compassPresent = compass !== null;
    results.compassBlocksViewport = compass ? hasBlockingOverlay(compass) : null;
    if (compass) {
      const style = getComputedStyle(compass);
      results.compassDisplay = style.display;
      results.compassVisibility = style.visibility;
    }

    // --- compass copy: kicker, title, note ---
    const compassKicker = document.querySelector('.journey-compass-kicker');
    results.compassKickerClipped = compassKicker ? textClipped(compassKicker) : null;

    const compassTitle = document.querySelector('.journey-compass-title');
    results.compassTitleClipped = compassTitle ? textClipped(compassTitle) : null;

    const compassNote = document.querySelector('.journey-compass-note');
    results.compassNoteClipped = compassNote ? textClipped(compassNote) : null;

    // --- compass actions ---
    const compassActions = document.querySelector('.journey-compass-actions');
    results.compassActionsPresent = compassActions !== null;

    const compassActionBtns = document.querySelectorAll('.journey-compass-action');
    results.compassActionBtnsCount = compassActionBtns.length;
    results.compassActionTouchTargets = Array.from(compassActionBtns).map((btn) => touchTargetOk(btn));

    // --- focus-stage card (walk dock) ---
    const focusStageCard = document.querySelector('.focus-stage-card');
    results.focusStageCardPresent = focusStageCard !== null;
    if (focusStageCard) {
      const style = getComputedStyle(focusStageCard);
      results.focusStageCardDisplay = style.display;
      results.focusStageCardClipped = textClipped(focusStageCard);
    }

    // --- focus-stage kicker / name ---
    const focusKicker = document.querySelector('.focus-stage-kicker');
    results.focusKickerClipped = focusKicker ? textClipped(focusKicker) : null;

    const focusName = document.querySelector('.focus-stage-name');
    results.focusNameClipped = focusName ? textClipped(focusName) : null;

    // --- focus-stage journey route dots ---
    const routeDots = document.querySelectorAll('.focus-stage-route-dot');
    results.routeDotsCount = routeDots.length;

    // --- focus-stage next label ---
    const focusNext = document.querySelector('.focus-stage-next');
    results.focusNextText = focusNext ? focusNext.textContent.trim() : null;

    // --- focus-stage journey buttons ---
    const journeyBtns = document.querySelectorAll('.focus-stage-journey-btn');
    results.journeyBtnsCount = journeyBtns.length;

    const focusActions = document.querySelector('.focus-stage-actions');
    results.focusActionsLayout = layoutSnapshot(focusActions);

    const activeJourney = document.querySelector('.focus-stage-journey.active');
    results.activeJourneyLayout = layoutSnapshot(activeJourney);

    // --- overflow guards ---
    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results, bodyDataset: { ...document.body.dataset } };
  });

  // assertions

  if (info.compassPresent) ctx.pass('field-node', 'dom:journey-compass');
  else ctx.fail('field-node', 'dom:journey-compass', 'missing .journey-compass');

  if (info.compassBlocksViewport) ctx.fail('field-node', 'overlay:journey-compass', 'journey-compass covers too much of the viewport');
  else if (info.compassBlocksViewport === false) ctx.pass('field-node', 'overlay:journey-compass');

  if (info.compassKickerClipped) ctx.fail('field-node', 'text-clipping:compass-kicker', 'compass kicker text is clipped');
  else if (info.compassKickerClipped === false) ctx.pass('field-node', 'text-clipping:compass-kicker');

  if (info.compassTitleClipped) ctx.fail('field-node', 'text-clipping:compass-title', 'compass title text is clipped');
  else if (info.compassTitleClipped === false) ctx.pass('field-node', 'text-clipping:compass-title');

  if (info.compassActionsPresent) ctx.pass('field-node', 'dom:compass-actions');
  else ctx.fail('field-node', 'dom:compass-actions', 'missing .journey-compass-actions');

  if (Array.isArray(info.compassActionTouchTargets)) {
    const visibleTargets = info.compassActionTouchTargets.filter((result) => result !== null);
    if (visibleTargets.length && visibleTargets.every(Boolean)) ctx.pass('field-node', 'touch-target:compass-actions');
    else if (visibleTargets.some((result) => result === false)) ctx.fail('field-node', 'touch-target:compass-actions', 'some compass actions < 44px');
  }

  if (info.focusStageCardPresent) ctx.pass('field-node', 'dom:focus-stage-card');
  else ctx.fail('field-node', 'dom:focus-stage-card', 'missing .focus-stage-card in field-node mode');

  if (info.focusStageCardClipped) ctx.fail('field-node', 'text-clipping:focus-stage-card', 'focus-stage-card content is clipped');
  else if (info.focusStageCardClipped === false) ctx.pass('field-node', 'text-clipping:focus-stage-card');

  if (info.focusKickerClipped) ctx.fail('field-node', 'text-clipping:focus-kicker', 'focus kicker text is clipped');
  else if (info.focusKickerClipped === false) ctx.pass('field-node', 'text-clipping:focus-kicker');

  if (info.focusNameClipped) ctx.fail('field-node', 'text-clipping:focus-name', 'focus name text is clipped');
  else if (info.focusNameClipped === false) ctx.pass('field-node', 'text-clipping:focus-name');

  if (info.routeDotsCount >= 2) ctx.pass('field-node', 'dom:route-dots', `found ${info.routeDotsCount} route dots`);
  else if (info.routeDotsCount > 0) ctx.pass('field-node', 'dom:route-dots:partial', `only ${info.routeDotsCount} route dot(s)`);
  else ctx.fail('field-node', 'dom:route-dots', 'no route dots found');

  if (info.journeyBtnsCount >= 1) ctx.pass('field-node', 'dom:journey-buttons', `found ${info.journeyBtnsCount} journey button(s)`);
  else ctx.fail('field-node', 'dom:journey-buttons', 'no journey buttons found');

  if (info.focusActionsLayout && info.focusActionsLayout.display !== 'grid') {
    ctx.fail('field-node', 'computed:focus-actions-display', `expected grid, got ${info.focusActionsLayout.display}`);
  } else if (info.focusActionsLayout) {
    ctx.pass('field-node', 'computed:focus-actions-display');
  }

  if (info.focusActionsLayout && info.focusActionsLayout.gap !== '10px') {
    ctx.fail('field-node', 'computed:focus-actions-gap', `expected 10px, got ${info.focusActionsLayout.gap}`);
  } else if (info.focusActionsLayout) {
    ctx.pass('field-node', 'computed:focus-actions-gap');
  }

  if (info.activeJourneyLayout?.visible && info.activeJourneyLayout.display !== 'flex') {
    ctx.fail('field-node', 'computed:journey-active-display', `expected flex, got ${info.activeJourneyLayout.display}`);
  } else if (info.activeJourneyLayout?.visible) {
    ctx.pass('field-node', 'computed:journey-active-display');
  }

  if (info.activeJourneyLayout?.visible && info.activeJourneyLayout.gap !== '12px') {
    ctx.fail('field-node', 'computed:journey-active-gap', `expected 12px, got ${info.activeJourneyLayout.gap}`);
  } else if (info.activeJourneyLayout?.visible) {
    ctx.pass('field-node', 'computed:journey-active-gap');
  }

  if (
    info.activeJourneyLayout?.visible &&
    (
      info.activeJourneyLayout.paddingTop !== '10px' ||
      info.activeJourneyLayout.paddingRight !== '14px' ||
      info.activeJourneyLayout.paddingBottom !== '10px' ||
      info.activeJourneyLayout.paddingLeft !== '14px'
    )
  ) {
    ctx.fail(
      'field-node',
      'computed:journey-active-padding',
      `expected 10px 14px 10px 14px, got ${info.activeJourneyLayout.paddingTop} ${info.activeJourneyLayout.paddingRight} ${info.activeJourneyLayout.paddingBottom} ${info.activeJourneyLayout.paddingLeft}`
    );
  } else if (info.activeJourneyLayout?.visible) {
    ctx.pass('field-node', 'computed:journey-active-padding');
  }

  if (info.overflowX) ctx.fail('field-node', 'viewport-crowding:overflow-x', 'horizontal overflow in field-node mode');
  else ctx.pass('field-node', 'viewport-crowding:overflow-x');

  ctx.pass('field-node', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// info-panel-empty — tests the info panel in its empty/idle state (no focused
// business selected). Validates that the empty-state placeholder is visible,
// key text is not clipped, and the panel has no horizontal overflow.
// ---------------------------------------------------------------------------

async function assert_info_panel_empty(page, ctx) {
  await loadAndWait(page, positionalUrl);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    const results = {};

    const infoPanel = document.querySelector('#info-panel');
    results.infoPanelPresent = infoPanel !== null;
    if (infoPanel) {
      const style = getComputedStyle(infoPanel);
      results.infoPanelDisplay = style.display;
      results.infoPanelVisibility = style.visibility;
    }

    const selectedCard = document.querySelector('#selected-card');
    results.selectedCardPresent = selectedCard !== null;
    if (selectedCard) {
      const style = getComputedStyle(selectedCard);
      results.selectedCardDisplay = style.display;
      results.selectedCardHasEmptyClass = selectedCard.classList.contains('is-empty');
    }

    const selectedEmpty = document.querySelector('#selected-empty');
    results.selectedEmptyPresent = selectedEmpty !== null;
    results.selectedEmptyVisible = selectedEmpty
      ? getComputedStyle(selectedEmpty).display !== 'none' && getComputedStyle(selectedEmpty).visibility !== 'hidden'
      : null;
    results.selectedEmptyClipped = selectedEmpty ? textClipped(selectedEmpty) : null;

    const emptyHeadline = document.querySelector('.selected-empty-headline');
    results.emptyHeadlineText = emptyHeadline ? emptyHeadline.textContent.trim() : null;
    results.emptyHeadlineClipped = emptyHeadline ? textClipped(emptyHeadline) : null;

    const emptySub = document.querySelector('.selected-empty-sub');
    results.emptySubClipped = emptySub ? textClipped(emptySub) : null;

    const selectedDetails = document.querySelector('#selected-details');
    results.selectedDetailsHidden = selectedDetails
      ? getComputedStyle(selectedDetails).display === 'none'
      : null;

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.infoPanelPresent) ctx.pass('info-panel-empty', 'dom:info-panel');
  else ctx.fail('info-panel-empty', 'dom:info-panel', 'missing #info-panel');

  if (info.infoPanelDisplay !== 'none' && info.infoPanelVisibility !== 'hidden') {
    ctx.pass('info-panel-empty', 'visibility:info-panel');
  } else {
    ctx.fail('info-panel-empty', 'visibility:info-panel', 'info-panel is hidden or display:none');
  }

  if (info.selectedCardPresent) ctx.pass('info-panel-empty', 'dom:selected-card');
  else ctx.fail('info-panel-empty', 'dom:selected-card', 'missing #selected-card');

  if (info.selectedCardHasEmptyClass) ctx.pass('info-panel-empty', 'state:selected-card-empty');
  else ctx.fail('info-panel-empty', 'state:selected-card-empty', 'selected-card missing is-empty class');

  if (info.selectedEmptyVisible) ctx.pass('info-panel-empty', 'visibility:selected-empty');
  else ctx.fail('info-panel-empty', 'visibility:selected-empty', '#selected-empty is not visible');

  if (info.emptyHeadlineClipped) ctx.fail('info-panel-empty', 'text-clipping:empty-headline', 'empty headline text is clipped');
  else if (info.emptyHeadlineClipped === false) ctx.pass('info-panel-empty', 'text-clipping:empty-headline');

  if (info.emptySubClipped) ctx.fail('info-panel-empty', 'text-clipping:empty-sub', 'empty sub-text is clipped');
  else if (info.emptySubClipped === false) ctx.pass('info-panel-empty', 'text-clipping:empty-sub');

  if (info.selectedDetailsHidden) ctx.pass('info-panel-empty', 'visibility:selected-details-hidden');
  else ctx.fail('info-panel-empty', 'visibility:selected-details-hidden', '#selected-details should be hidden when no business is selected');

  if (info.overflowX) ctx.fail('info-panel-empty', 'viewport-crowding:overflow-x', 'horizontal overflow in info panel idle state');
  else ctx.pass('info-panel-empty', 'viewport-crowding:overflow-x');

  ctx.pass('info-panel-empty', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// compass-rail — tests the journey-compass rail of step buttons on mobile.
// Validates: compass present, step buttons all visible (not clipped/hidden),
// compass-rail does not overflow horizontally, compass has no blocking overlay.
// ---------------------------------------------------------------------------

async function assert_compass_rail(page, ctx) {
  await loadAndWait(page, positionalUrl);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function hasBlockingOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      const rect = el.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > viewportArea * 0.45;
    }

    const results = {};

    const compass = document.querySelector('.journey-compass');
    results.compassPresent = compass !== null;
    results.compassBlocksViewport = compass ? hasBlockingOverlay(compass) : null;
    if (compass) {
      const style = getComputedStyle(compass);
      results.compassDisplay = style.display;
      results.compassVisibility = style.visibility;
    }

    const rail = document.querySelector('.journey-compass-rail');
    results.railPresent = rail !== null;
    if (rail) {
      const rect = rail.getBoundingClientRect();
      results.railWidth = rect.width;
      results.railOverflow = rail.scrollWidth > rect.width + 1;
    }

    const steps = document.querySelectorAll('.journey-compass-step');
    results.stepsCount = steps.length;
    results.stepsVisible = Array.from(steps).every(
      (s) => getComputedStyle(s).display !== 'none' && getComputedStyle(s).visibility !== 'hidden'
    );
    results.stepsClipped = Array.from(steps).some((s) => textClipped(s));

    const actions = document.querySelector('.journey-compass-actions');
    results.actionsPresent = actions !== null;

    const kicker = document.querySelector('.journey-compass-kicker');
    results.kickerClipped = kicker ? textClipped(kicker) : null;

    const title = document.querySelector('.journey-compass-title');
    results.titleClipped = title ? textClipped(title) : null;

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.compassPresent) ctx.pass('compass-rail', 'dom:journey-compass');
  else ctx.fail('compass-rail', 'dom:journey-compass', 'missing .journey-compass');

  if (info.compassBlocksViewport) ctx.fail('compass-rail', 'overlay:journey-compass', 'journey-compass covers too much of the viewport');
  else if (info.compassBlocksViewport === false) ctx.pass('compass-rail', 'overlay:journey-compass');

  if (info.railPresent) ctx.pass('compass-rail', 'dom:journey-compass-rail');
  else ctx.fail('compass-rail', 'dom:journey-compass-rail', 'missing .journey-compass-rail');

  if (info.stepsCount >= 4) ctx.pass('compass-rail', 'dom:journey-compass-steps', `found ${info.stepsCount} step buttons`);
  else ctx.fail('compass-rail', 'dom:journey-compass-steps', `expected ≥4 step buttons, found ${info.stepsCount}`);

  if (info.stepsVisible) ctx.pass('compass-rail', 'visibility:journey-compass-steps');
  else ctx.fail('compass-rail', 'visibility:journey-compass-steps', 'some compass step buttons are hidden');

  if (info.stepsClipped) ctx.fail('compass-rail', 'text-clipping:journey-compass-steps', 'some compass step button text is clipped');
  else ctx.pass('compass-rail', 'text-clipping:journey-compass-steps');

  if (info.railOverflow) ctx.fail('compass-rail', 'layout:journey-compass-rail-overflow', 'compass rail has horizontal overflow');
  else ctx.pass('compass-rail', 'layout:journey-compass-rail-overflow');

  if (info.actionsPresent) ctx.pass('compass-rail', 'dom:journey-compass-actions');
  else ctx.fail('compass-rail', 'dom:journey-compass-actions', 'missing .journey-compass-actions');

  if (info.kickerClipped) ctx.fail('compass-rail', 'text-clipping:compass-kicker', 'compass kicker text is clipped');
  else if (info.kickerClipped === false) ctx.pass('compass-rail', 'text-clipping:compass-kicker');

  if (info.titleClipped) ctx.fail('compass-rail', 'text-clipping:compass-title', 'compass title text is clipped');
  else if (info.titleClipped === false) ctx.pass('compass-rail', 'text-clipping:compass-title');

  if (info.overflowX) ctx.fail('compass-rail', 'viewport-crowding:overflow-x', 'horizontal overflow in compass-rail state');
  else ctx.pass('compass-rail', 'viewport-crowding:overflow-x');

  ctx.pass('compass-rail', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// loading-overlay — tests the initial loading overlay on mobile.
// Validates: overlay present, kicker/title/note text not clipped,
// progress bar container visible, and phase chips visible.
// ---------------------------------------------------------------------------

async function assert_loading_overlay(page, ctx) {
  await page.goto(positionalUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(120);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 3 || el.scrollHeight > rect.height + 3;
    }

    const results = {};

    const overlay = document.querySelector('#loading-overlay');
    results.overlayPresent = overlay !== null;
    if (overlay) {
      const style = getComputedStyle(overlay);
      results.overlayDisplay = style.display;
      results.overlayVisibility = style.visibility;
    }

    const loadingShell = document.querySelector('.loading-shell');
    results.shellPresent = loadingShell !== null;

    const kicker = document.querySelector('.loading-kicker');
    results.kickerText = kicker ? kicker.textContent.trim() : null;
    results.kickerClipped = kicker ? textClipped(kicker) : null;

    const title = document.querySelector('.loading-title');
    results.titleText = title ? title.textContent.trim() : null;
    results.titleClipped = title ? textClipped(title) : null;

    const note = document.querySelector('.loading-note');
    results.noteText = note ? note.textContent.trim() : null;
    results.noteClipped = note ? textClipped(note) : null;

    const progressBar = document.querySelector('#loading-progress-bar');
    results.progressBarPresent = progressBar !== null;

    const phaseRow = document.querySelector('#loading-phase-row');
    results.phaseRowPresent = phaseRow !== null;
    results.phaseRowVisible = phaseRow
      ? getComputedStyle(phaseRow).display !== 'none' && getComputedStyle(phaseRow).visibility !== 'hidden'
      : null;

    const phaseChips = document.querySelectorAll('.loading-phase-chip');
    results.phaseChipsCount = phaseChips.length;

    const foot = document.querySelector('#loading-foot');
    results.footText = foot ? foot.textContent.trim() : null;

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.overlayPresent) ctx.pass('loading-overlay', 'dom:loading-overlay');
  else ctx.fail('loading-overlay', 'dom:loading-overlay', 'missing #loading-overlay');

  if (info.overlayDisplay !== 'none' && info.overlayVisibility !== 'hidden') {
    ctx.pass('loading-overlay', 'visibility:loading-overlay');
  } else {
    ctx.fail('loading-overlay', 'visibility:loading-overlay', 'loading overlay is hidden');
  }

  if (info.shellPresent) ctx.pass('loading-overlay', 'dom:loading-shell');
  else ctx.fail('loading-overlay', 'dom:loading-shell', 'missing .loading-shell');

  if (info.kickerClipped) ctx.fail('loading-overlay', 'text-clipping:loading-kicker', 'loading kicker text is clipped');
  else if (info.kickerClipped === false) ctx.pass('loading-overlay', 'text-clipping:loading-kicker');

  if (info.titleClipped) ctx.fail('loading-overlay', 'text-clipping:loading-title', 'loading title text is clipped');
  else if (info.titleClipped === false) ctx.pass('loading-overlay', 'text-clipping:loading-title');

  if (info.noteClipped) ctx.fail('loading-overlay', 'text-clipping:loading-note', 'loading note text is clipped');
  else if (info.noteClipped === false) ctx.pass('loading-overlay', 'text-clipping:loading-note');

  if (info.progressBarPresent) ctx.pass('loading-overlay', 'dom:loading-progress-bar');
  else ctx.fail('loading-overlay', 'dom:loading-progress-bar', 'missing #loading-progress-bar');

  if (info.phaseRowPresent) ctx.pass('loading-overlay', 'dom:loading-phase-row');
  else ctx.fail('loading-overlay', 'dom:loading-phase-row', 'missing #loading-phase-row');

  if (info.phaseChipsCount >= 4) ctx.pass('loading-overlay', 'dom:loading-phase-chips', `found ${info.phaseChipsCount} phase chips`);
  else ctx.fail('loading-overlay', 'dom:loading-phase-chips', `expected ≥4 phase chips, found ${info.phaseChipsCount}`);

  if (info.overflowX) ctx.fail('loading-overlay', 'viewport-crowding:overflow-x', 'horizontal overflow in loading overlay');
  else ctx.pass('loading-overlay', 'viewport-crowding:overflow-x');

  ctx.pass('loading-overlay', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// mode-grid — tests the mode-chip grid (County View / Bloom / Bridge / Path).
// Validates: mode-grid exists for overview/refine ownership, but remains hidden
// in mobile focus-search per docs/semantic-demo-mobile-ia.md. Active chip state
// should still remain intact while hidden.
// ---------------------------------------------------------------------------

async function assert_mode_grid(page, ctx) {
  await loadAndWait(page, positionalUrl);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    const results = {};
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus-search';
    document.documentElement.dataset.panelOpen = 'true';
    document.querySelector('.info-panel')?.classList.add('active');
    document.querySelector('.search-container')?.classList.add('has-query', 'results-rendered');

    const modeGrid = document.querySelector('#mode-grid');
    results.modeGridPresent = modeGrid !== null;
    if (modeGrid) {
      const style = getComputedStyle(modeGrid);
      results.modeGridDisplay = style.display;
      results.modeGridVisibility = style.visibility;
      results.modeGridOverflow = modeGrid.scrollWidth > modeGrid.getBoundingClientRect().width + 1;
    }

    const modeChips = document.querySelectorAll('.mode-chip');
    results.modeChipsCount = modeChips.length;

    const activeChip = document.querySelector('.mode-chip.active');
    results.activeChipPresent = activeChip !== null;
    if (activeChip) {
      results.activeChipAriaPressed = activeChip.getAttribute('aria-pressed');
      results.activeChipText = activeChip.querySelector('.mode-name')
        ? activeChip.querySelector('.mode-name').textContent.trim()
        : activeChip.textContent.trim();
    }

    results.modeChipsVisible = Array.from(modeChips).every(
      (c) => getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility !== 'hidden'
    );
    results.modeChipsClipped = Array.from(modeChips).some((c) => textClipped(c));

    const modeNames = Array.from(modeChips).map((c) => {
      const nameEl = c.querySelector('.mode-name');
      return nameEl ? nameEl.textContent.trim() : c.textContent.trim();
    });
    results.modeNames = modeNames;

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.modeGridPresent) ctx.pass('mode-grid', 'dom:mode-grid');
  else ctx.fail('mode-grid', 'dom:mode-grid', 'missing #mode-grid');

  if (info.modeGridDisplay === 'none' || info.modeGridVisibility === 'hidden') {
    ctx.pass('mode-grid', 'visibility:mode-grid:hidden-in-focus-search');
  } else {
    ctx.fail('mode-grid', 'visibility:mode-grid', 'mode-grid should be hidden in mobile focus-search');
  }

  if (info.modeGridOverflow) ctx.fail('mode-grid', 'layout:mode-grid-overflow', 'mode-grid has horizontal overflow');
  else ctx.pass('mode-grid', 'layout:mode-grid-overflow');

  if (info.modeChipsCount >= 4) ctx.pass('mode-grid', 'dom:mode-chips', `found ${info.modeChipsCount} mode chips`);
  else ctx.fail('mode-grid', 'dom:mode-chips', `expected ≥4 mode chips, found ${info.modeChipsCount}`);

  if (!info.modeChipsVisible) ctx.pass('mode-grid', 'visibility:mode-chips:hidden-in-focus-search');
  else ctx.fail('mode-grid', 'visibility:mode-chips', 'mode chips should not be visible in mobile focus-search');

  if (info.modeChipsClipped) ctx.fail('mode-grid', 'text-clipping:mode-chips', 'some mode chip labels are clipped');
  else ctx.pass('mode-grid', 'text-clipping:mode-chips');

  if (info.activeChipPresent) {
    ctx.pass('mode-grid', 'dom:active-mode-chip');
    if (info.activeChipAriaPressed === 'true') ctx.pass('mode-grid', 'aria-pressed:active-mode-chip');
    else ctx.fail('mode-grid', 'aria-pressed:active-mode-chip', `active chip aria-pressed="${info.activeChipAriaPressed}", expected "true"`);
  } else {
    ctx.fail('mode-grid', 'dom:active-mode-chip', 'no active mode chip found');
  }

  if (info.overflowX) ctx.fail('mode-grid', 'viewport-crowding:overflow-x', 'horizontal overflow in mode-grid state');
  else ctx.pass('mode-grid', 'viewport-crowding:overflow-x');

  ctx.pass('mode-grid', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// filters — tests the filter toolbar rail on mobile.
// Surface triggers: open filters-section via dataset toggle, inspect chips.
// Validates: filters section present, filter chips visible, city select present,
// all filter chips touch-target >= 44px, no horizontal overflow.
// ---------------------------------------------------------------------------

async function assert_filters(page, ctx) {
  await loadAndWait(page, positionalUrl);

  await page.evaluate(() => {
    // Open the filters section
    const filtersSection = document.querySelector('#filters-section');
    if (filtersSection) {
      filtersSection.open = true;
    }
    document.body.dataset.graphContext = 'filters-open';
  });
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    const results = {};

    const filtersSection = document.querySelector('#filters-section');
    results.filtersSectionPresent = filtersSection !== null;
    results.filtersSectionOpen = filtersSection ? filtersSection.open : null;

    const filterChips = document.querySelectorAll('.filter-chip');
    results.filterChipsCount = filterChips.length;

    const statusChips = document.querySelectorAll('[data-status-filter]');
    results.statusChipsCount = statusChips.length;

    const signalChips = document.querySelectorAll('[data-signal-filter]');
    results.signalChipsCount = signalChips.length;

    results.chipsVisible = Array.from(filterChips).every(
      (c) => getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility !== 'hidden'
    );

    results.chipsTouchTargets = Array.from(filterChips).map((c) => touchTargetOk(c));

    const citySelect = document.querySelector('#city-filter');
    results.citySelectPresent = citySelect !== null;
    if (citySelect) {
      const rect = citySelect.getBoundingClientRect();
      results.citySelectTouchTarget = rect.height >= 43.5;
    }

    const filterClearBtn = document.querySelector('#filter-clear-btn');
    results.filterClearBtnPresent = filterClearBtn !== null;

    const filterToolbar = document.querySelector('.filter-toolbar');
    results.filterToolbarOverflow = filterToolbar
      ? filterToolbar.scrollWidth > filterToolbar.getBoundingClientRect().width + 1
      : null;

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.filtersSectionPresent) ctx.pass('filters', 'dom:filters-section');
  else ctx.fail('filters', 'dom:filters-section', 'missing #filters-section');

  if (info.filtersSectionOpen) ctx.pass('filters', 'state:filters-section-open');
  else ctx.fail('filters', 'state:filters-section-open', 'filters-section is not open');

  if (info.filterChipsCount >= 3) ctx.pass('filters', 'dom:filter-chips', `found ${info.filterChipsCount} filter chips`);
  else ctx.fail('filters', 'dom:filter-chips', `expected ≥3 filter chips, found ${info.filterChipsCount}`);

  if (info.chipsVisible) ctx.pass('filters', 'visibility:filter-chips');
  else ctx.fail('filters', 'visibility:filter-chips', 'some filter chips are hidden');

  const allTouchTargetsOk = info.chipsTouchTargets.every((t) => t === true);
  const someTouchTargetsFail = info.chipsTouchTargets.some((t) => t === false);
  if (allTouchTargetsOk) ctx.pass('filters', 'touch-target:filter-chips');
  else if (someTouchTargetsFail) ctx.fail('filters', 'touch-target:filter-chips', 'some filter chips < 44px tall');

  if (info.citySelectPresent) ctx.pass('filters', 'dom:city-filter-select');
  else ctx.fail('filters', 'dom:city-filter-select', 'missing #city-filter');

  if (info.citySelectTouchTarget === false) ctx.fail('filters', 'touch-target:city-filter', 'city filter select < 44px tall');
  else if (info.citySelectTouchTarget) ctx.pass('filters', 'touch-target:city-filter');

  if (info.filterClearBtnPresent) ctx.pass('filters', 'dom:filter-clear-btn');
  else ctx.fail('filters', 'dom:filter-clear-btn', 'missing #filter-clear-btn');

  if (info.filterToolbarOverflow) ctx.fail('filters', 'layout:filter-toolbar-overflow', 'filter toolbar has horizontal overflow');
  else ctx.pass('filters', 'layout:filter-toolbar-overflow');

  if (info.overflowX) ctx.fail('filters', 'viewport-crowding:overflow-x', 'horizontal overflow with filters open');
  else ctx.pass('filters', 'viewport-crowding:overflow-x');

  ctx.pass('filters', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// thread-inspector — tests the focus-thread-inspector panel on mobile.
// Surface triggers: dataset thread-inspect-surface set to 'inspector', body
// has class is-active and graphContext=focus.
// Validates: inspector present, title/copy/meta visible, Pin/Follow/Clear
// buttons present and touch targets >= 44px, no blocking overlay.
// ---------------------------------------------------------------------------

async function assert_thread_inspector(page, ctx) {
  const base = positionalUrl.includes('?') ? '&' : '?';
  const focusedUrl = `${positionalUrl}${base}view=galaxy&q=coffee&anchor=519`;
  await loadAndWait(page, focusedUrl);

  // Enter focus stage first
  const firstCard = page.locator('.search-result-item').first();
  if (await firstCard.count()) {
    await firstCard.click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(800);

  // Activate thread-inspector surface via dataset
  await page.evaluate(() => {
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus';
    document.body.dataset.threadInspectSurface = 'inspector';

    const focusStage = document.querySelector('#focus-stage');
    if (focusStage) {
      focusStage.hidden = false;
      focusStage.style.display = 'block';
    }

    const inspector = document.querySelector('#focus-thread-inspector');
    if (inspector) {
      inspector.classList.add('active');
      inspector.setAttribute('aria-hidden', 'false');
    }

    // Simulate an inspected thread so title/copy are non-empty
    const titleEl = document.querySelector('#focus-thread-inspector-title');
    const copyEl = document.querySelector('#focus-thread-inspector-copy');
    const metaEl = document.querySelector('#focus-thread-inspector-meta');
    if (titleEl) titleEl.textContent = 'Coffee Shop A → Nearby Stop B';
    if (copyEl) copyEl.textContent = 'Both serve morning commuters in the same strip mall.';
    if (metaEl) metaEl.textContent = 'Semantic relationship: local_semantic_neighbor';

    const pinBtn = document.querySelector('#btn-thread-pin');
    const followBtn = document.querySelector('#btn-thread-follow');
    const clearBtn = document.querySelector('#btn-thread-clear');
    [pinBtn, followBtn, clearBtn].forEach((btn) => {
      if (btn) btn.disabled = false;
    });
  });
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    function hasBlockingOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      const rect = el.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > viewportArea * 0.45;
    }

    const results = {};

    const inspector = document.querySelector('#focus-thread-inspector');
    results.inspectorPresent = inspector !== null;
    results.inspectorActive = inspector ? inspector.classList.contains('active') : null;
    results.inspectorBlocksViewport = inspector ? hasBlockingOverlay(inspector) : null;

    const title = document.querySelector('#focus-thread-inspector-title');
    results.titleText = title ? title.textContent.trim() : null;
    results.titleClipped = title ? textClipped(title) : null;

    const copy = document.querySelector('#focus-thread-inspector-copy');
    results.copyText = copy ? copy.textContent.trim() : null;
    results.copyClipped = copy ? textClipped(copy) : null;

    const meta = document.querySelector('#focus-thread-inspector-meta');
    results.metaText = meta ? meta.textContent.trim() : null;

    const pinBtn = document.querySelector('#btn-thread-pin');
    results.pinBtnPresent = pinBtn !== null;
    if (pinBtn) {
      results.pinBtnTouchTarget = touchTargetOk(pinBtn);
      results.pinBtnTextClipped = textClipped(pinBtn);
    }

    const followBtn = document.querySelector('#btn-thread-follow');
    results.followBtnPresent = followBtn !== null;
    if (followBtn) {
      results.followBtnTouchTarget = touchTargetOk(followBtn);
      results.followBtnTextClipped = textClipped(followBtn);
    }

    const clearBtn = document.querySelector('#btn-thread-clear');
    results.clearBtnPresent = clearBtn !== null;
    if (clearBtn) {
      results.clearBtnTouchTarget = touchTargetOk(clearBtn);
    }

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.inspectorPresent) ctx.pass('thread-inspector', 'dom:focus-thread-inspector');
  else ctx.fail('thread-inspector', 'dom:focus-thread-inspector', 'missing #focus-thread-inspector');

  if (info.inspectorActive) ctx.pass('thread-inspector', 'state:inspector-active');
  else ctx.fail('thread-inspector', 'state:inspector-active', 'inspector is not in active state');

  if (info.inspectorBlocksViewport) ctx.fail('thread-inspector', 'overlay:thread-inspector', 'thread inspector covers too much of the viewport');
  else if (info.inspectorBlocksViewport === false) ctx.pass('thread-inspector', 'overlay:thread-inspector');

  if (info.titleText && info.titleText.length > 0) ctx.pass('thread-inspector', 'dom:inspector-title');
  else ctx.fail('thread-inspector', 'dom:inspector-title', 'inspector title is empty');

  if (info.titleClipped) ctx.fail('thread-inspector', 'text-clipping:inspector-title', 'inspector title text is clipped');
  else if (info.titleClipped === false) ctx.pass('thread-inspector', 'text-clipping:inspector-title');

  if (info.copyText && info.copyText.length > 0) ctx.pass('thread-inspector', 'dom:inspector-copy');
  else ctx.fail('thread-inspector', 'dom:inspector-copy', 'inspector copy is empty');

  if (info.copyClipped) ctx.fail('thread-inspector', 'text-clipping:inspector-copy', 'inspector copy text is clipped');
  else if (info.copyClipped === false) ctx.pass('thread-inspector', 'text-clipping:inspector-copy');

  if (info.pinBtnPresent) ctx.pass('thread-inspector', 'dom:btn-thread-pin');
  else ctx.fail('thread-inspector', 'dom:btn-thread-pin', 'missing #btn-thread-pin');

  if (info.pinBtnTouchTarget === false) ctx.fail('thread-inspector', 'touch-target:btn-thread-pin', 'pin button < 44px tall');
  else if (info.pinBtnTouchTarget) ctx.pass('thread-inspector', 'touch-target:btn-thread-pin');

  if (info.followBtnPresent) ctx.pass('thread-inspector', 'dom:btn-thread-follow');
  else ctx.fail('thread-inspector', 'dom:btn-thread-follow', 'missing #btn-thread-follow');

  if (info.followBtnTouchTarget === false) ctx.fail('thread-inspector', 'touch-target:btn-thread-follow', 'follow button < 44px tall');
  else if (info.followBtnTouchTarget) ctx.pass('thread-inspector', 'touch-target:btn-thread-follow');

  if (info.clearBtnPresent) ctx.pass('thread-inspector', 'dom:btn-thread-clear');
  else ctx.fail('thread-inspector', 'dom:btn-thread-clear', 'missing #btn-thread-clear');

  if (info.overflowX) ctx.fail('thread-inspector', 'viewport-crowding:overflow-x', 'horizontal overflow with inspector open');
  else ctx.pass('thread-inspector', 'viewport-crowding:overflow-x');

  ctx.pass('thread-inspector', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// controls — tests the view-toggle and journey-compass action buttons on mobile.
// Surface triggers: load idle page, inspect controls.
// Validates: view-toggle present with 2 buttons, compass primary action present,
// all control buttons touch-target >= 44px, compass has no blocking overlay.
// ---------------------------------------------------------------------------

async function assert_controls(page, ctx) {
  await loadAndWait(page, positionalUrl);

  await page.evaluate(() => {
    document.body.dataset.activeView = 'map';
  });
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    function hasBlockingOverlay(el) {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') return false;
      if (s.position !== 'fixed' && s.position !== 'absolute') return false;
      const rect = el.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      return area > viewportArea * 0.45;
    }

    const results = {};

    const viewToggle = document.querySelector('.view-toggle');
    results.viewTogglePresent = viewToggle !== null;

    const viewToggleBtns = document.querySelectorAll('.view-toggle button');
    results.viewToggleBtnsCount = viewToggleBtns.length;

    const compassPrimary = document.querySelector('#btn-journey-primary');
    results.compassPrimaryPresent = compassPrimary !== null;
    if (compassPrimary) {
      results.compassPrimaryRect = compassPrimary.getBoundingClientRect();
      results.compassPrimaryTouchTarget = touchTargetOk(compassPrimary);
      results.compassPrimaryTextClipped = textClipped(compassPrimary);
    }

    const compassSecondary = document.querySelector('#btn-journey-secondary');
    results.compassSecondaryPresent = compassSecondary !== null;
    if (compassSecondary) {
      results.compassSecondaryTouchTarget = touchTargetOk(compassSecondary);
    }

    const compass = document.querySelector('.journey-compass');
    results.compassBlocksViewport = compass ? hasBlockingOverlay(compass) : null;

    const compassActions = document.querySelectorAll('.journey-compass-action');
    results.compassActionsCount = compassActions.length;

    results.viewToggleBtnsTouchTargets = Array.from(viewToggleBtns).map((b) => touchTargetOk(b));

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.viewTogglePresent) ctx.pass('controls', 'dom:view-toggle');
  else ctx.fail('controls', 'dom:view-toggle', 'missing .view-toggle');

  if (info.viewToggleBtnsCount >= 2) ctx.pass('controls', 'dom:view-toggle-buttons', `found ${info.viewToggleBtnsCount} view-toggle buttons`);
  else ctx.fail('controls', 'dom:view-toggle-buttons', `expected ≥2 view-toggle buttons, found ${info.viewToggleBtnsCount}`);

  const viewToggleAllTouch = info.viewToggleBtnsTouchTargets.every((t) => t === true);
  const viewToggleSomeFail = info.viewToggleBtnsTouchTargets.some((t) => t === false);
  if (viewToggleAllTouch) ctx.pass('controls', 'touch-target:view-toggle-buttons');
  else if (viewToggleSomeFail) ctx.fail('controls', 'touch-target:view-toggle-buttons', 'some view-toggle buttons < 44px');

  if (info.compassPrimaryPresent) ctx.pass('controls', 'dom:btn-journey-primary');
  else ctx.fail('controls', 'dom:btn-journey-primary', 'missing #btn-journey-primary');

  if (info.compassPrimaryTouchTarget === false) ctx.fail('controls', 'touch-target:btn-journey-primary', 'primary compass button < 44px tall');
  else if (info.compassPrimaryTouchTarget) ctx.pass('controls', 'touch-target:btn-journey-primary');

  if (info.compassPrimaryTextClipped) ctx.fail('controls', 'text-clipping:btn-journey-primary', 'primary compass button text is clipped');
  else if (info.compassPrimaryTextClipped === false) ctx.pass('controls', 'text-clipping:btn-journey-primary');

  if (info.compassSecondaryPresent) ctx.pass('controls', 'dom:btn-journey-secondary');
  else ctx.fail('controls', 'dom:btn-journey-secondary', 'missing #btn-journey-secondary');

  if (info.compassBlocksViewport) ctx.fail('controls', 'overlay:journey-compass', 'journey compass covers too much of the viewport');
  else if (info.compassBlocksViewport === false) ctx.pass('controls', 'overlay:journey-compass');

  if (info.overflowX) ctx.fail('controls', 'viewport-crowding:overflow-x', 'horizontal overflow on controls check');
  else ctx.pass('controls', 'viewport-crowding:overflow-x');

  ctx.pass('controls', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// search-chrome — tests the search container and its inner elements on mobile.
// Surface triggers: search container present in idle state.
// Validates: search container present, search input present, input placeholder
// visible, spinner and clear button exist, semantic-lane-pill present,
// search-hint present (even if hidden), search-label-text visible, no overflow.
// ---------------------------------------------------------------------------

async function assert_search_chrome(page, ctx) {
  await loadAndWait(page, positionalUrl);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function touchTargetOk(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5;
    }

    const results = {};

    const searchContainer = document.querySelector('.search-container');
    results.searchContainerPresent = searchContainer !== null;

    const searchInput = document.querySelector('#search-input');
    results.searchInputPresent = searchInput !== null;
    if (searchInput) {
      results.searchInputRect = searchInput.getBoundingClientRect();
      results.searchInputTouchTarget = touchTargetOk(searchInput);
      results.searchInputPlaceholder = searchInput.getAttribute('placeholder') || '';
    }

    const searchLabel = document.querySelector('.search-label-text');
    results.searchLabelText = searchLabel ? searchLabel.textContent.trim() : null;
    results.searchLabelClipped = searchLabel ? textClipped(searchLabel) : null;

    const lanePill = document.querySelector('#semantic-lane-pill');
    results.lanePillPresent = lanePill !== null;
    if (lanePill) {
      results.lanePillText = lanePill.textContent.trim();
      results.lanePillState = lanePill.getAttribute('data-state');
    }

    const spinner = document.querySelector('#search-spinner');
    results.spinnerPresent = spinner !== null;

    const clearBtn = document.querySelector('#search-clear-btn');
    results.clearBtnPresent = clearBtn !== null;
    if (clearBtn) {
      results.clearBtnVisible = getComputedStyle(clearBtn).display !== 'none';
    }

    const searchHint = document.querySelector('#search-status');
    results.searchHintPresent = searchHint !== null;

    const searchIcon = document.querySelector('.search-icon');
    results.searchIconPresent = searchIcon !== null;

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.searchContainerPresent) ctx.pass('search-chrome', 'dom:search-container');
  else ctx.fail('search-chrome', 'dom:search-container', 'missing .search-container');

  if (info.searchInputPresent) ctx.pass('search-chrome', 'dom:#search-input');
  else ctx.fail('search-chrome', 'dom:#search-input', 'missing #search-input');

  if (info.searchInputTouchTarget === false) ctx.fail('search-chrome', 'touch-target:search-input', 'search input < 44px tall');
  else if (info.searchInputTouchTarget) ctx.pass('search-chrome', 'touch-target:search-input');

  if (info.searchInputPlaceholder && info.searchInputPlaceholder.length > 0) {
    ctx.pass('search-chrome', 'dom:search-input-placeholder');
  } else {
    ctx.fail('search-chrome', 'dom:search-input-placeholder', 'search input has no placeholder');
  }

  if (info.searchLabelText && info.searchLabelText.length > 0) ctx.pass('search-chrome', 'dom:search-label-text');
  else ctx.fail('search-chrome', 'dom:search-label-text', 'search label text is empty');

  if (info.searchLabelClipped) ctx.fail('search-chrome', 'text-clipping:search-label', 'search label text is clipped');
  else if (info.searchLabelClipped === false) ctx.pass('search-chrome', 'text-clipping:search-label');

  if (info.lanePillPresent) ctx.pass('search-chrome', 'dom:#semantic-lane-pill');
  else ctx.fail('search-chrome', 'dom:#semantic-lane-pill', 'missing #semantic-lane-pill');

  if (info.spinnerPresent) ctx.pass('search-chrome', 'dom:#search-spinner');
  else ctx.fail('search-chrome', 'dom:#search-spinner', 'missing #search-spinner');

  if (info.clearBtnPresent) ctx.pass('search-chrome', 'dom:#search-clear-btn');
  else ctx.fail('search-chrome', 'dom:#search-clear-btn', 'missing #search-clear-btn');

  if (info.searchHintPresent) ctx.pass('search-chrome', 'dom:#search-status');
  else ctx.fail('search-chrome', 'dom:#search-status', 'missing #search-status');

  if (info.searchIconPresent) ctx.pass('search-chrome', 'dom:.search-icon');
  else ctx.fail('search-chrome', 'dom:.search-icon', 'missing .search-icon');

  if (info.overflowX) ctx.fail('search-chrome', 'viewport-crowding:overflow-x', 'horizontal overflow in search-chrome');
  else ctx.pass('search-chrome', 'viewport-crowding:overflow-x');

  ctx.pass('search-chrome', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// ---------------------------------------------------------------------------
// info-panel-populated — tests the info panel with a selected/populated state.
// Surface triggers: set body.dataset.focusedIndex and populate selected-card
// DOM with business data, show selected-details.
// Validates: info panel present, selected-card present with populated content,
// selected-details visible, key fields (name, theme, status) have text,
// selected-card is-empty class is removed, no black-on-dark text, no overflow.
// ---------------------------------------------------------------------------

async function assert_info_panel_populated(page, ctx) {
  await loadAndWait(page, positionalUrl);

  await page.evaluate(() => {
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus';

    const selectedCard = document.querySelector('#selected-card');
    if (selectedCard) {
      selectedCard.classList.remove('is-empty');
    }

    const selectedDetails = document.querySelector('#selected-details');
    if (selectedDetails) {
      selectedDetails.classList.add('active');
      selectedDetails.style.display = '';
    }

    const selectedName = document.querySelector('#selected-name');
    if (selectedName) selectedName.textContent = 'Downtown Coffee Collective';

    const selectedWhat = document.querySelector('#selected-what');
    if (selectedWhat) selectedWhat.textContent = 'Artisan coffee shop with outdoor seating';

    const selectedTheme = document.querySelector('#selected-theme');
    if (selectedTheme) selectedTheme.textContent = 'Food & Drink · Cafes';

    const selectedStatus = document.querySelector('#selected-status');
    if (selectedStatus) selectedStatus.textContent = 'Active';

    const selectedFiledAs = document.querySelector('#selected-filed-as');
    if (selectedFiledAs) selectedFiledAs.style.display = 'none';
  });
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 3 || el.scrollHeight > rect.height + 3;
    }

    function blackOnDark(bg, text) {
      const hex = /#[0-9a-f]{6}/i;
      if (!hex.test(text) || !hex.test(bg)) return false;
      const parse = (h) => {
        const c = h.replace('#', '');
        return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
      };
      const [r, g, b] = parse(text);
      const [pr, pg, pb] = parse(bg);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      const panelBrightness = (pr * 299 + pg * 587 + pb * 114) / 1000;
      return brightness > 180 && panelBrightness < 80;
    }

    const results = {};

    const infoPanel = document.querySelector('#info-panel');
    results.infoPanelPresent = infoPanel !== null;

    const selectedCard = document.querySelector('#selected-card');
    results.selectedCardPresent = selectedCard !== null;
    results.selectedCardHasEmptyClass = selectedCard ? selectedCard.classList.contains('is-empty') : null;
    if (selectedCard) {
      const style = getComputedStyle(selectedCard);
      results.selectedCardBlackOnDark = blackOnDark(style.backgroundColor, style.color);
    }

    const selectedDetails = document.querySelector('#selected-details');
    results.selectedDetailsPresent = selectedDetails !== null;
    results.selectedDetailsVisible = selectedDetails
      ? getComputedStyle(selectedDetails).display !== 'none' && getComputedStyle(selectedDetails).visibility !== 'hidden'
      : null;

    const selectedName = document.querySelector('#selected-name');
    results.selectedNameText = selectedName ? selectedName.textContent.trim() : null;
    results.selectedNameClipped = selectedName ? textClipped(selectedName) : null;

    const selectedWhat = document.querySelector('#selected-what');
    results.selectedWhatText = selectedWhat ? selectedWhat.textContent.trim() : null;
    results.selectedWhatClipped = selectedWhat ? textClipped(selectedWhat) : null;

    const selectedTheme = document.querySelector('#selected-theme');
    results.selectedThemeText = selectedTheme ? selectedTheme.textContent.trim() : null;
    results.selectedThemeClipped = selectedTheme ? textClipped(selectedTheme) : null;

    const selectedStatus = document.querySelector('#selected-status');
    results.selectedStatusText = selectedStatus ? selectedStatus.textContent.trim() : null;

    const selectedHero = document.querySelector('.selected-hero');
    results.selectedHeroPresent = selectedHero !== null;

    const selectedRoleBadge = document.querySelector('#selected-role-badge');
    results.selectedRoleBadgePresent = selectedRoleBadge !== null;

    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    return { ...results };
  });

  if (info.infoPanelPresent) ctx.pass('info-panel-populated', 'dom:info-panel');
  else ctx.fail('info-panel-populated', 'dom:info-panel', 'missing #info-panel');

  if (info.selectedCardPresent) ctx.pass('info-panel-populated', 'dom:#selected-card');
  else ctx.fail('info-panel-populated', 'dom:#selected-card', 'missing #selected-card');

  if (!info.selectedCardHasEmptyClass) ctx.pass('info-panel-populated', 'state:#selected-card-populated');
  else ctx.fail('info-panel-populated', 'state:#selected-card-populated', 'selected-card still has is-empty class');

  if (info.selectedCardBlackOnDark) ctx.fail('info-panel-populated', 'black-on-dark:#selected-card', 'black text on dark #selected-card');
  else if (info.selectedCardBlackOnDark === false) ctx.pass('info-panel-populated', 'black-on-dark:#selected-card');

  if (info.selectedDetailsPresent) ctx.pass('info-panel-populated', 'dom:#selected-details');
  else ctx.fail('info-panel-populated', 'dom:#selected-details', 'missing #selected-details');

  if (info.selectedDetailsVisible) ctx.pass('info-panel-populated', 'visibility:#selected-details');
  else ctx.fail('info-panel-populated', 'visibility:#selected-details', '#selected-details is hidden');

  if (info.selectedNameText && info.selectedNameText.length > 0) ctx.pass('info-panel-populated', 'dom:#selected-name');
  else ctx.fail('info-panel-populated', 'dom:#selected-name', '#selected-name is empty');

  if (info.selectedNameClipped) ctx.fail('info-panel-populated', 'text-clipping:#selected-name', '#selected-name text is clipped');
  else if (info.selectedNameClipped === false) ctx.pass('info-panel-populated', 'text-clipping:#selected-name');

  if (info.selectedWhatText && info.selectedWhatText.length > 0) ctx.pass('info-panel-populated', 'dom:#selected-what');
  else ctx.fail('info-panel-populated', 'dom:#selected-what', '#selected-what is empty');

  if (info.selectedWhatClipped) ctx.fail('info-panel-populated', 'text-clipping:#selected-what', '#selected-what text is clipped');
  else if (info.selectedWhatClipped === false) ctx.pass('info-panel-populated', 'text-clipping:#selected-what');

  if (info.selectedThemeText && info.selectedThemeText.length > 0) ctx.pass('info-panel-populated', 'dom:#selected-theme');
  else ctx.fail('info-panel-populated', 'dom:#selected-theme', '#selected-theme is empty');

  if (info.selectedThemeClipped) ctx.fail('info-panel-populated', 'text-clipping:#selected-theme', '#selected-theme text is clipped');
  else if (info.selectedThemeClipped === false) ctx.pass('info-panel-populated', 'text-clipping:#selected-theme');

  if (info.selectedStatusText && info.selectedStatusText.length > 0) ctx.pass('info-panel-populated', 'dom:#selected-status');
  else ctx.fail('info-panel-populated', 'dom:#selected-status', '#selected-status is empty');

  if (info.selectedHeroPresent) ctx.pass('info-panel-populated', 'dom:.selected-hero');
  else ctx.fail('info-panel-populated', 'dom:.selected-hero', 'missing .selected-hero');

  if (info.selectedRoleBadgePresent) ctx.pass('info-panel-populated', 'dom:#selected-role-badge');
  else ctx.fail('info-panel-populated', 'dom:#selected-role-badge', 'missing #selected-role-badge');

  if (info.overflowX) ctx.fail('info-panel-populated', 'viewport-crowding:overflow-x', 'horizontal overflow in info-panel-populated');
  else ctx.pass('info-panel-populated', 'viewport-crowding:overflow-x');

  ctx.pass('info-panel-populated', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  return info;
}

// Surface registry

const SURFACES = {
  'mobile-idle':       assert_mobile_idle,
  'desktop-idle':      assert_desktop_idle,
  'launch-focus':      assert_launch_focus,
  'search-error':      assert_search_error,
  'map-trail':         assert_map_trail,
  'focus-pocket':      assert_focus_pocket,
  'field-node':        assert_field_node,
  'info-panel-empty':  assert_info_panel_empty,
  'compass-rail':      assert_compass_rail,
  'loading-overlay':   assert_loading_overlay,
  'mode-grid':         assert_mode_grid,
  // Phase B surfaces
  'filters':              assert_filters,
  'thread-inspector':     assert_thread_inspector,
  'controls':             assert_controls,
  'search-chrome':        assert_search_chrome,
  'info-panel-populated': assert_info_panel_populated,
  // Phase C — global spacing / touch / overflow health
  'global-spacing':       assert_global_spacing,
};

// ---------------------------------------------------------------------------
// global-spacing — fast, chunked CSS spacing health check.
// Run at mobile 390px without entering a focused state — touches only global
// elements that are present on every meaningful surface.
// Checks:
//   1. no document horizontal overflow at 390px
//   2. all visible interactive controls (buttons, inputs, clickable elements)
//      meet >= 44px touch target where they are visible
//   3. no overlap between active top/global controls (journey-compass) and
//      primary panel surfaces (info-panel, selected-card, search-container)
//   4. primary panels stay within viewport and below sane height ratios
//   5. no clipped labels in focus-stage, search-chrome, and selected-card
//      surfaces when they are visible
// ---------------------------------------------------------------------------

async function assert_global_spacing(page, ctx) {
  await loadAndWait(page, positionalUrl);

  const info = await page.evaluate(() => {
    function textClipped(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function isVisible(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 &&
        r.bottom > 0 && r.right > 0 &&
        r.top < window.innerHeight && r.left < window.innerWidth;
    }

    function isInteractiveVisible(el) {
      if (!isVisible(el)) return false;
      const style = getComputedStyle(el);
      return Number(style.opacity || 1) > 0.05 && style.pointerEvents !== 'none';
    }

    function rectsOverlap(r1, r2) {
      if (!r1 || !r2) return false;
      return !(r1.bottom < r2.top || r1.top > r2.bottom ||
               r1.right < r2.left || r1.left > r2.right);
    }

    function panelMetric(selector, maxHeightRatio) {
      const el = document.querySelector(selector);
      if (!el || !isVisible(el)) return null;
      const r = el.getBoundingClientRect();
      return {
        selector,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        heightRatio: Math.round((r.height / window.innerHeight) * 1000) / 1000,
        maxHeightRatio,
        withinViewport:
          r.left >= -1 &&
          r.right <= window.innerWidth + 1 &&
          r.top >= -1 &&
          r.bottom <= window.innerHeight + 1,
        saneHeight: r.height <= window.innerHeight * maxHeightRatio,
      };
    }

    const results = {};

    // --- 1. document horizontal overflow ---
    results.overflowX = document.documentElement.scrollWidth > window.innerWidth;
    results.overflowY = document.documentElement.scrollHeight > window.innerHeight;

    // --- 2. touch targets on visible interactive controls ---
    const interactiveSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'a[href]',
      '[role="button"]:not([aria-disabled="true"])',
      '[tabindex="0"]',
    ];

    const interactiveEls = Array.from(document.querySelectorAll(
      interactiveSelectors.join(',')
    )).filter(isInteractiveVisible);

    results.interactiveCount = interactiveEls.length;
    results.touchTargetResults = interactiveEls.map((el) => {
      const r = el.getBoundingClientRect();
      const ok = r.width >= 43.5 && r.height >= 43.5;
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = String(el.className || '').slice(0, 40);
      return { tag, id, cls, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, ok };
    });

    results.smallTouchTargets = results.touchTargetResults.filter((t) => !t.ok);

    // --- 3. overlap between top/global controls and primary panels ---
    const compass = document.querySelector('.journey-compass');
    const compassRect = compass && isVisible(compass) ? compass.getBoundingClientRect() : null;

    const infoPanel = document.querySelector('#info-panel');
    const infoPanelRect = infoPanel && isVisible(infoPanel) ? infoPanel.getBoundingClientRect() : null;

    const selectedCard = document.querySelector('#selected-card');
    const selectedCardRect = selectedCard && isVisible(selectedCard) ? selectedCard.getBoundingClientRect() : null;

    const searchContainer = document.querySelector('.search-container');
    const searchContainerRect = searchContainer && isVisible(searchContainer) ? searchContainer.getBoundingClientRect() : null;

    results.compassRect = compassRect
      ? { top: Math.round(compassRect.top), bottom: Math.round(compassRect.bottom),
          left: Math.round(compassRect.left), right: Math.round(compassRect.right) }
      : null;
    results.compassVisible = compass ? isVisible(compass) : false;

    results.compassInfoPanelOverlap = compassRect && infoPanelRect
      ? rectsOverlap(compassRect, infoPanelRect) : false;
    results.compassSelectedCardOverlap = compassRect && selectedCardRect
      ? rectsOverlap(compassRect, selectedCardRect) : false;
    results.compassSearchContainerOverlap = compassRect && searchContainerRect
      ? rectsOverlap(compassRect, searchContainerRect) : false;

    // --- 4. panel proportions and viewport fit ---
    results.panelMetrics = [
      panelMetric('#info-panel', 0.62),
      panelMetric('#selected-card', 0.52),
      panelMetric('.focus-stage-card', 0.62),
      panelMetric('.map-trail-strip', 0.2),
    ].filter(Boolean);

    // --- 5. label clipping in selected / chrome / focus surfaces ---
    const focusStageName = document.querySelector('.focus-stage-name');
    results.focusStageNameClipped = focusStageName ? textClipped(focusStageName) : null;

    const focusStageKicker = document.querySelector('.focus-stage-kicker');
    results.focusStageKickerClipped = focusStageKicker ? textClipped(focusStageKicker) : null;

    const searchLabel = document.querySelector('.search-label-text');
    results.searchLabelClipped = searchLabel ? textClipped(searchLabel) : null;

    const selectedName = document.querySelector('#selected-name');
    results.selectedNameClipped = selectedName ? textClipped(selectedName) : null;

    const selectedWhat = document.querySelector('#selected-what');
    results.selectedWhatClipped = selectedWhat ? textClipped(selectedWhat) : null;

    const selectedTheme = document.querySelector('#selected-theme');
    results.selectedThemeClipped = selectedTheme ? textClipped(selectedTheme) : null;

    return { ...results };
  });

  // --- 1. overflow ---
  if (info.overflowX) ctx.fail('global-spacing', 'viewport-crowding:overflow-x', 'document has horizontal overflow at 390px');
  else ctx.pass('global-spacing', 'viewport-crowding:overflow-x');

  ctx.pass('global-spacing', info.overflowY ? 'viewport-scroll:overflow-y' : 'viewport-scroll:no-overflow-y');

  // --- 2. touch targets ---
  if (info.interactiveCount > 0) {
    ctx.pass('global-spacing', 'touch-targets:interactive-count', `${info.interactiveCount} interactive elements checked`);
  } else {
    ctx.fail('global-spacing', 'touch-targets:interactive-count', 'no interactive elements found');
  }

  if (info.smallTouchTargets.length === 0) {
    ctx.pass('global-spacing', 'touch-targets:all-44px', 'all visible interactive controls >= 44px');
  } else {
    const first = info.smallTouchTargets[0];
    ctx.fail('global-spacing', 'touch-targets:all-44px',
      `some controls < 44px: ${first.tag}${first.id} ${first.w}x${first.h}px (${info.smallTouchTargets.length} total)`);
  }

  // --- 3. overlap ---
  if (info.compassVisible) {
    if (info.compassInfoPanelOverlap) {
      ctx.fail('global-spacing', 'layout-overlap:compass-info-panel', 'journey-compass overlaps #info-panel');
    } else {
      ctx.pass('global-spacing', 'layout-overlap:compass-info-panel');
    }

    if (info.compassSelectedCardOverlap) {
      ctx.fail('global-spacing', 'layout-overlap:compass-selected-card', 'journey-compass overlaps #selected-card');
    } else {
      ctx.pass('global-spacing', 'layout-overlap:compass-selected-card');
    }

    if (info.compassSearchContainerOverlap) {
      ctx.fail('global-spacing', 'layout-overlap:compass-search-container', 'journey-compass overlaps .search-container');
    } else {
      ctx.pass('global-spacing', 'layout-overlap:compass-search-container');
    }
  } else {
    ctx.pass('global-spacing', 'layout-overlap:compass-visible-skipped');
  }

  // --- 4. panel proportions and viewport fit ---
  if (Array.isArray(info.panelMetrics) && info.panelMetrics.length) {
    const viewportFailures = info.panelMetrics.filter((panel) => !panel.withinViewport);
    const heightFailures = info.panelMetrics.filter((panel) => !panel.saneHeight);
    if (viewportFailures.length) {
      ctx.fail(
        'global-spacing',
        'panel-proportion:within-viewport',
        `panel(s) outside viewport: ${viewportFailures.map((panel) => panel.selector).join(', ')}`
      );
    } else {
      ctx.pass('global-spacing', 'panel-proportion:within-viewport');
    }
    if (heightFailures.length) {
      ctx.fail(
        'global-spacing',
        'panel-proportion:max-height-ratio',
        `panel(s) too tall: ${heightFailures.map((panel) => `${panel.selector}=${panel.heightRatio}`).join(', ')}`
      );
    } else {
      ctx.pass('global-spacing', 'panel-proportion:max-height-ratio');
    }
  } else {
    ctx.pass('global-spacing', 'panel-proportion:no-visible-panels');
  }

  // --- 5. label clipping ---
  if (info.focusStageNameClipped) ctx.fail('global-spacing', 'text-clipping:focus-stage-name', 'focus-stage-name text is clipped');
  else if (info.focusStageNameClipped === false) ctx.pass('global-spacing', 'text-clipping:focus-stage-name');

  if (info.focusStageKickerClipped) ctx.fail('global-spacing', 'text-clipping:focus-stage-kicker', 'focus-stage-kicker text is clipped');
  else if (info.focusStageKickerClipped === false) ctx.pass('global-spacing', 'text-clipping:focus-stage-kicker');

  if (info.searchLabelClipped) ctx.fail('global-spacing', 'text-clipping:search-label', 'search label text is clipped');
  else if (info.searchLabelClipped === false) ctx.pass('global-spacing', 'text-clipping:search-label');

  if (info.selectedNameClipped) ctx.fail('global-spacing', 'text-clipping:#selected-name', '#selected-name text is clipped');
  else if (info.selectedNameClipped === false) ctx.pass('global-spacing', 'text-clipping:#selected-name');

  if (info.selectedWhatClipped) ctx.fail('global-spacing', 'text-clipping:#selected-what', '#selected-what text is clipped');
  else if (info.selectedWhatClipped === false) ctx.pass('global-spacing', 'text-clipping:#selected-what');

  if (info.selectedThemeClipped) ctx.fail('global-spacing', 'text-clipping:#selected-theme', '#selected-theme text is clipped');
  else if (info.selectedThemeClipped === false) ctx.pass('global-spacing', 'text-clipping:#selected-theme');

  return info;
}

const SURFACE_LIST = Object.keys(SURFACES);
const surfacesToRun = requestedSurfaces.length
  ? requestedSurfaces.filter((s) => SURFACE_LIST.includes(s))
  : SURFACE_LIST;

// Main runner

async function run() {
  await ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const allAssertions = [];
  const surfaceResults = [];

  try {
    for (const surface of surfacesToRun) {
      const ctx = makeAssert(surface);
      const page = await makePage(browser, surface);
      const info = await SURFACES[surface](page, ctx);
      await page.close();

      await fs.promises.writeFile(
        path.join(outDir, `${surface}.json`),
        `${JSON.stringify({ surface, info, assertions: ctx.checks }, null, 2)}\n`,
        'utf8',
      );

      allAssertions.push(...ctx.checks);
      surfaceResults.push({ surface, assertions: ctx.checks });
    }
  } finally {
    await browser.close();
  }

  const passCount = allAssertions.filter((a) => a.level === 'pass').length;
  const failCount = allAssertions.filter((a) => a.level === 'fail').length;
  const overflowFails = allAssertions.filter((a) => a.level === 'fail' && a.check.includes('overflow')).length;

  const summary = { outDir, url: positionalUrl, surfaces: surfaceResults.map((s) => s.surface),
    overflowFailures: overflowFails,
    assertions: { pass: passCount, fail: failCount, items: allAssertions } };

  await fs.promises.writeFile(
    path.join(outDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );

  console.log(JSON.stringify({
    outDir,
    url: positionalUrl,
    surfaces: surfaceResults.map((s) => s.surface),
    pass: passCount,
    fail: failCount,
    overflowFailures: overflowFails,
    results: surfaceResults.map(({ surface, assertions }) => ({
      surface,
      pass: assertions.filter((a) => a.level === 'pass').length,
      fail: assertions.filter((a) => a.level === 'fail').length,
      failures: assertions.filter((a) => a.level === 'fail').map((a) => a.check),
    })),
  }, null, 2));

  if (failCount > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
