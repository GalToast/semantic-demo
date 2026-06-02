/**
 * Mobile focus-search surface ownership contract.
 *
 * State ownership may say "focus-search", but surface ownership says mobile
 * gets one primary drawer after focus handoff: #focus-stage. Search/info chrome
 * must not remain as a second drawer.
 */

import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html?view=galaxy&nodemo=1';
const TARGET_URL = process.env.FOCUS_SEARCH_SURFACE_URL || DEFAULT_URL;
const KNOWN_COFFEE_INDEX = Number(process.env.FOCUS_SEARCH_SURFACE_INDEX || 3060);

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function withCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('nodemo', '1');
  parsed.searchParams.set('surfacecheck', `focus-search-${Date.now()}`);
  return parsed.href;
}

const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

try {
  await page.goto(withCacheBust(TARGET_URL), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return Array.isArray(state.points) &&
      state.points.length > 100 &&
      state.applyingUrlState === false &&
      window.history.state?.semanticDemo &&
      state.sceneRevealActive === false &&
      document.body.dataset.sceneReveal === 'inactive';
  }, null, { timeout: 45000 });

  await page.evaluate((index) => {
    window.__APP_ACTIONS__?.focusOnNode?.(index, { fromSearchResult: true, skipUrlSync: true });
    window.__APP_ACTIONS__?.setTrailDepth?.(1, { skipUrlSync: true });
    const input = document.getElementById('search-input');
    if (input) {
      input.value = 'coffee';
    }
    window.__APP_ACTIONS__?.refreshCompositionState?.();
  }, KNOWN_COFFEE_INDEX);

  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return document.body.dataset.panelSurface === 'focus-search' &&
      Number.isFinite(state.navState?.focusedIndex ?? state.focusedNode);
  }, null, { timeout: 12000 });

  await page.waitForTimeout(800);

  const snap = await page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.01;
      return {
        selector,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity || 1),
        pointerEvents: style.pointerEvents,
        visible,
      };
    };
    const boxes = {
      infoPanel: box('#info-panel'),
      searchContainer: box('.search-container'),
      searchResults: box('#search-results'),
      focusStage: box('#focus-stage'),
      focusCard: box('.focus-stage-card'),
      compass: box('#journey-compass'),
      searchLabel: box('.search-label'),
    };
    const drawerSized = Object.entries({
      infoPanel: boxes.infoPanel,
      searchResults: boxes.searchResults,
      focusStage: boxes.focusStage,
    }).filter(([, item]) => item?.visible && item.height >= 140);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyDataset: { ...document.body.dataset },
      boxes,
      drawerSized: drawerSized.map(([name, item]) => ({ name, height: item.height, y: item.y, bottom: item.bottom })),
      searchText: document.querySelector('#search-results')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 220) || '',
      focusText: document.querySelector('#focus-stage')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 320) || '',
    };
  });

  assert(snap.bodyDataset.panelSurface === 'focus-search', `expected focus-search, got ${snap.bodyDataset.panelSurface}`);
  assert(snap.boxes.focusStage?.visible, '#focus-stage should be visible in mobile focus-search');
  assert(snap.boxes.focusStage.height >= 220, `#focus-stage should be drawer-sized, got ${snap.boxes.focusStage.height}px`);
  assert(snap.boxes.focusStage.bottom <= snap.viewport.height + 1, '#focus-stage should stay inside viewport');
  assert(snap.boxes.focusStage.bottom >= snap.viewport.height - 12, '#focus-stage should remain bottom anchored');

  assert(!snap.boxes.infoPanel?.visible || snap.boxes.infoPanel.height <= 4,
    `#info-panel should hand off to focus stage, got ${JSON.stringify(snap.boxes.infoPanel)}`);
  assert(!snap.boxes.searchContainer?.visible || snap.boxes.searchContainer.height <= 4,
    `.search-container should not duplicate focus context, got ${JSON.stringify(snap.boxes.searchContainer)}`);
  assert(!snap.boxes.searchLabel?.visible || snap.boxes.searchLabel.height <= 2,
    `.search-label should be suppressed in focus-search, got ${snap.boxes.searchLabel?.height}px`);
  assert(!snap.boxes.searchResults?.visible || snap.boxes.searchResults.height <= 4,
    `#search-results should be hidden as a drawer in focus-search, got ${snap.boxes.searchResults?.height}px`);
  assert(snap.drawerSized.length === 1 && snap.drawerSized[0].name === 'focusStage',
    `expected only focusStage as drawer-sized primary surface, got ${JSON.stringify(snap.drawerSized)}`);

  console.log(JSON.stringify(snap, null, 2));
  console.log('Mobile focus-search surface ownership contract passed.');
} finally {
  await browser.close();
}
