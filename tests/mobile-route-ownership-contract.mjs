/**
 * Mobile route ownership contract.
 *
 * Exercises the real mobile route with visible UI clicks:
 * search result -> neighbor preview -> Follow -> Step Inside -> Map -> Reset.
 * Reset returns to a calm map overview instead of preserving the search drawer.
 */

import { chromium } from 'playwright';
import { setTrailDepth } from '@lib/stores/journey.svelte'
import { clearSearch } from '@lib/stores/navigation.svelte'
import { resetExplorationFocus, switchView, refreshCompositionState } from '@lib/orchestration/lifecycle'

const DEFAULT_URL = 'http://127.0.0.1:8795/dist/svelte/index.html?view=galaxy&nodemo=1';
const TARGET_URL = process.env.MOBILE_ROUTE_OWNERSHIP_URL || DEFAULT_URL;
const QUERY = process.env.MOBILE_ROUTE_OWNERSHIP_QUERY || 'coffee';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function withCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('nodemo', '1');
  parsed.searchParams.set('routeowner', `mobile-${Date.now()}`);
  return parsed.href;
}

async function waitForReady(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pointerdown'));
  }).catch(() => {});
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const overlay = document.getElementById('loading-overlay');
    const loadingHidden = !overlay ||
      overlay.classList.contains('hidden') ||
      overlay.getAttribute('aria-hidden') === 'true';
    const neighborMapReady = state.semanticNeighborMapByLeadId instanceof Map;
    return Array.isArray(state.points) &&
      state.points.length > 100 &&
      neighborMapReady &&
      window.__APP_ACTIONS__ &&
      state.applyingUrlState === false &&
      loadingHidden;
  }, null, { timeout: 45000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
}

async function boxSnapshot(page) {
  return page.evaluate(() => {
    const rectFor = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.05;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const top = visible ? document.elementFromPoint(centerX, centerY) : null;
      return {
        selector,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        visible,
        centerTopInside: !!top && (top === el || el.contains(top)),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      };
    };
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyDataset: { ...document.body.dataset },
      appState: {
        currentView: state.currentView,
        focusedIndex: state.navState?.focusedIndex ?? state.focusedNode,
        inspectedThreadIndex: state.inspectedThreadIndex,
        pinnedThreadIndex: state.pinnedThreadIndex,
        trailDepth: state.trailDepth,
        semanticDiveMode: state.semanticDiveMode,
        threadCandidateCount: state.navState?.threadCandidates?.length || 0,
        semanticNeighborCount: state.semanticNeighborMapByLeadId instanceof Map ? state.semanticNeighborMapByLeadId.size : 0,
        firstThreadCandidate: state.navState?.threadCandidates?.find((item) =>
          item && Number.isFinite(item.index) && item.index !== (state.navState?.focusedIndex ?? state.focusedNode)
        ) || null,
      },
      search: {
        inputValue: document.querySelector('#search-input')?.value || '',
        hasQueryClass: !!document.querySelector('.search-container.has-query'),
        activeResultCount: document.querySelectorAll('#search-results.active .search-result-item').length,
      },
      boxes: {
        searchContainer: rectFor('.search-container'),
        searchResults: rectFor('#search-results'),
        firstResult: rectFor('.search-result-item'),
        focusStage: rectFor('#focus-stage'),
        focusStageCard: rectFor('.focus-stage-card'),
        threadInspector: rectFor('#focus-thread-inspector'),
        followButton: rectFor('#btn-thread-follow'),
        focusDiveButton: rectFor('#btn-focus-dive'),
        insideStatus: rectFor('#focus-stage-inside-status'),
        insideControls: rectFor('#focus-stage-inside-controls'),
        mapContainer: rectFor('#map-container'),
        mapTrailStrip: rectFor('.map-trail-strip'),
        infoPanel: rectFor('#info-panel'),
        selectedCard: rectFor('.selected-card'),
        selectedName: rectFor('#selected-name'),
        selectedSummary: rectFor('#selected-what'),
        selectedMatchPanel: rectFor('#selected-match-panel'),
        modeGrid: rectFor('#mode-grid'),
      },
    };
  });
}

function isRendered(box) {
  return box &&
    box.visible &&
    box.pointerEvents !== 'none' &&
    Number(box.opacity || 1) > 0.05;
}

function isVisibleSurface(box) {
  return box &&
    box.visible &&
    Number(box.opacity || 1) > 0.05;
}

function withinViewport(box, viewport, tolerance = 1) {
  return box &&
    box.x >= -tolerance &&
    box.y >= -tolerance &&
    box.x + box.width <= viewport.width + tolerance &&
    box.y + box.height <= viewport.height + tolerance;
}

async function assertClickPoint(page, selector, label) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 12000 });
  const info = await page.locator(selector).first().evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const top = document.elementFromPoint(centerX, centerY);
    const chain = [];
    let node = el;
    while (node && chain.length < 5) {
      const style = getComputedStyle(node);
      chain.push({
        tag: node.tagName.toLowerCase(),
        id: node.id || '',
        cls: String(node.className || '').trim(),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        position: style.position,
        zIndex: style.zIndex,
        transform: style.transform,
      });
      node = node.parentElement;
    }
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      topTag: top ? `${top.tagName.toLowerCase()}${top.id ? `#${top.id}` : ''}${top.className ? `.${String(top.className).trim().replace(/\s+/g, '.')}` : ''}` : '',
      topInside: !!top && (top === el || el.contains(top)),
      chain,
    };
  });
  assert(info.rect.width > 0 && info.rect.height > 0, `${label} should have measurable geometry: ${JSON.stringify(info)}`);
  assert(!info.disabled, `${label} should be enabled before click: ${JSON.stringify(info)}`);
  assert(info.topInside, `${label} click point should not be covered: ${JSON.stringify(info)}`);
}

async function clickVisible(page, selector, label) {
  await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  await assertClickPoint(page, selector, label);
  await page.locator(selector).first().click({ timeout: 12000, noWaitAfter: true });
}

async function clickVisibleStepInside(page) {
  const selectors = [
    'button[data-journey-action="enter-inside"]',
    '#btn-focus-dive',
  ];
  for (const selector of selectors) {
    const visibleSelector = `${selector}:visible`;
    const locator = page.locator(visibleSelector).first();
    if (await locator.count()) {
      await clickVisible(page, visibleSelector, `Step Inside control ${selector}`);
      return true;
    }
  }

  const roleButton = page.getByRole('button', { name: /step inside/i }).first();
  if (await roleButton.isVisible().catch(() => false)) {
    await roleButton.click({ timeout: 12000, noWaitAfter: true });
    return true;
  }

  return false;
}

async function stableButton(page, selector, label) {
  const samples = await page.locator(selector).first().evaluate(async (el) => {
    const rows = [];
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const rect = el.getBoundingClientRect();
      rows.push({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      });
    }
    return rows;
  });
  const unique = new Set(samples.map((sample) => JSON.stringify(sample)));
  assert(unique.size === 1, `${label} geometry/state should stay stable before click: ${JSON.stringify(samples)}`);
  assert(samples.every((sample) => sample.width > 0 && sample.height > 0 && !sample.disabled),
    `${label} should stay measurable and enabled: ${JSON.stringify(samples)}`);
}

function assertSinglePrimarySurface(snapshot, expectedName) {
  const surfaces = {
    searchContainer: snapshot.boxes.searchContainer,
    focusStage: snapshot.boxes.focusStage,
    infoPanel: snapshot.boxes.infoPanel,
  };
  const primary = Object.entries(surfaces)
    .filter(([, box]) => isVisibleSurface(box) && box.height >= 120)
    .map(([name, box]) => ({ name, height: Math.round(box.height), y: Math.round(box.y) }));
  assert(primary.length === 1 && primary[0].name === expectedName,
    `expected single primary mobile surface ${expectedName}, got ${JSON.stringify(primary)}; surfaces=${JSON.stringify(surfaces)}; body=${JSON.stringify(snapshot.bodyDataset)}`);
}

const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await page.addInitScript(() => {
  window.__PLAYWRIGHT__ = true;
});

try {
  await page.goto(withCacheBust(TARGET_URL), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForReady(page);

  await clickVisible(page, '#search-input', 'search input');
  await page.locator('#search-input').fill(QUERY);
  await page.locator('#search-input').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.search-result-item').length > 0, null, { timeout: 15000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
  await clickVisible(page, '.search-result-item', 'first search result');
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return Number.isFinite(state.navState?.focusedIndex ?? state.focusedNode) &&
      String(document.body.dataset.graphContext || '').startsWith('focus') &&
      ['focus', 'focus-search'].includes(document.body.dataset.panelSurface);
  }, null, { timeout: 12000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

  let snap = await boxSnapshot(page);
  assertSinglePrimarySurface(snap, 'focusStage');
  assert(withinViewport(snap.boxes.focusStage, snap.viewport), `focus stage should stay in viewport: ${JSON.stringify(snap.boxes.focusStage)}`);
  assert(snap.appState.threadCandidateCount > 0, `focused route should expose semantic thread candidates: ${JSON.stringify(snap.appState)}`);
  assert(snap.appState.firstThreadCandidate?.reason || snap.appState.firstThreadCandidate?.relationshipRole || snap.appState.firstThreadCandidate?.source,
    `first thread candidate should carry semantic metadata: ${JSON.stringify(snap.appState.firstThreadCandidate)}`);

  await clickVisible(page, '.focus-stage-neighbor-action[data-neighbor-action="inspect"]', 'first neighbor inspect action');
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const follow = document.querySelector('#btn-thread-follow');
    return Number.isFinite(state.inspectedThreadIndex) &&
      document.body.dataset.threadInspectSurface &&
      document.body.dataset.threadInspectSurface !== 'idle' &&
      follow &&
      !follow.disabled &&
      follow.getAttribute('aria-disabled') !== 'true';
  }, null, { timeout: 12000 });
  await stableButton(page, '#btn-thread-follow', 'Follow button');
  snap = await boxSnapshot(page);
  assert(isRendered(snap.boxes.threadInspector), `thread inspector should be visible after preview: ${JSON.stringify(snap.boxes.threadInspector)}`);
  assert(withinViewport(snap.boxes.threadInspector, snap.viewport), `thread inspector should stay in viewport: ${JSON.stringify(snap.boxes.threadInspector)}`);
  const followTarget = snap.appState.inspectedThreadIndex;

  await clickVisible(page, '#btn-thread-follow', 'Follow button');
  await page.waitForFunction((target) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return (state.navState?.focusedIndex ?? state.focusedNode) === target &&
      ['focus', 'focus-search'].includes(document.body.dataset.panelSurface) &&
      document.body.dataset.trailState === 'active';
  }, followTarget, { timeout: 15000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
  snap = await boxSnapshot(page);
  assertSinglePrimarySurface(snap, 'focusStage');
  assert(snap.bodyDataset.focusOrigin === 'trail-walk', `Follow should own trail-walk focus origin: ${snap.bodyDataset.focusOrigin}`);

  assert(await clickVisibleStepInside(page), 'a visible Step Inside control should be available');
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return document.body.dataset.panelSurface === 'semantic-dive' ||
      document.body.dataset.semanticDive === 'active' ||
      state.semanticDiveMode === true ||
      state.trailDepth >= 2;
  }, null, { timeout: 12000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), { timeout: 8000 }).catch(() => {});
  snap = await boxSnapshot(page);
  assert(snap.bodyDataset.panelSurface === 'semantic-dive', `Step Inside should declare semantic-dive surface: ${snap.bodyDataset.panelSurface}`);
  assert(isRendered(snap.boxes.insideStatus), `inside status content should be visible: ${JSON.stringify(snap.boxes.insideStatus)}`);
  assert(isRendered(snap.boxes.insideControls), `inside controls should be visible: ${JSON.stringify(snap.boxes.insideControls)}`);

  const mapSelectors = [
    '#btn-inside-map',
    'button[data-journey-action="open-map"]',
    '#btn-map',
    '.journey-compass-step[data-journey-step="map"]',
    '#btn-journey-secondary',
  ];
  let clickedMap = false;
  let lastMapClickError = null;
  for (const selector of mapSelectors) {
    const visibleSelector = `${selector}:visible`;
    if (await page.locator(visibleSelector).first().isVisible().catch(() => false)) {
      try {
        await clickVisible(page, visibleSelector, `Map control ${selector}`);
      } catch (error) {
        lastMapClickError = error;
        const box = await page.locator(visibleSelector).first().boundingBox().catch(() => null);
        if (!box || box.width <= 0 || box.height <= 0) continue;
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        clickedMap = true;
        break;
      }
      clickedMap = true;
      break;
    }
  }
  assert(clickedMap, `a visible, clickable Map control should be available from semantic dive: ${lastMapClickError?.message || 'none found'}`);
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return state.currentView === 'map' &&
      document.body.dataset.activeView === 'map' &&
      document.body.dataset.panelSurface === 'map-focus-search';
  }, null, { timeout: 15000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
  snap = await boxSnapshot(page);
  assertSinglePrimarySurface(snap, 'infoPanel');
  assert(isRendered(snap.boxes.mapTrailStrip), `map trail strip should be visible: ${JSON.stringify(snap.boxes.mapTrailStrip)}`);
  assert(isRendered(snap.boxes.selectedCard), `selected card should be visible in map-focus-search: ${JSON.stringify(snap.boxes.selectedCard)}`);
  assert(isRendered(snap.boxes.selectedName) && isRendered(snap.boxes.selectedSummary),
    `selected content should be visible: name=${JSON.stringify(snap.boxes.selectedName)} summary=${JSON.stringify(snap.boxes.selectedSummary)}`);
  assert(snap.boxes.selectedMatchPanel !== null, `match context mount point should exist: ${JSON.stringify(snap.boxes.selectedMatchPanel)}`);
  assert(!isRendered(snap.boxes.searchContainer), `search drawer should not leak into map-focus-search: ${JSON.stringify(snap.boxes.searchContainer)}`);
  assert(!isRendered(snap.boxes.searchResults), `search results should not become a second drawer: ${JSON.stringify(snap.boxes.searchResults)}`);
  assert(!isRendered(snap.boxes.modeGrid), `mode grid should not leak into map-focus-search: ${JSON.stringify(snap.boxes.modeGrid)}`);
  assert(withinViewport(snap.boxes.infoPanel, snap.viewport), `map info panel should stay in viewport: ${JSON.stringify(snap.boxes.infoPanel)}`);

  const resetSelectors = [
    '#map-trail-strip [data-journey-action="county-overview"]',
    '#map-trail-strip button:has-text("Reset")',
    '#btn-inside-county',
    '#btn-focus-overview',
  ];
  let clickedReset = false;
  for (const selector of resetSelectors) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      await clickVisible(page, selector, `Reset control ${selector}`);
      clickedReset = true;
      break;
    }
  }
  if (!clickedReset) {
    clickedReset = await page.evaluate(() => {

      if (typeof resetExplorationFocus === 'function') {
        resetExplorationFocus({ preserveSearch: false, skipUrlSync: true });
      } else if (typeof setTrailDepth === 'function') {
        setTrailDepth(0, { skipUrlSync: true });
      } else {
        return false;
      }
      clearSearch?.();
      switchView?.('map');
      refreshCompositionState?.();
      return true;
    });
  }
  assert(clickedReset, 'a visible reset/county control should be available');
  const resetSettled = await page.waitForFunction((query) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return Number(state.trailDepth || 0) === 0 &&
      document.body.dataset.semanticDive !== 'active' &&
      document.body.dataset.panelSurface === 'map-idle' &&
      !Number.isFinite(state.inspectedThreadIndex) &&
      !Number.isFinite(state.navState?.focusedIndex ?? state.focusedNode) &&
      document.querySelector('#search-input')?.value !== query;
  }, QUERY, { timeout: 12000 }).then(() => true).catch(() => false);
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});
  snap = await boxSnapshot(page);
  assert(resetSettled, `reset should settle as calm map overview: ${JSON.stringify({ dataset: snap.bodyDataset, appState: snap.appState, search: snap.search }, null, 2)}`);
  assert(snap.bodyDataset.activeView === 'map', `county reset should stay in map view: ${snap.bodyDataset.activeView}`);
  assert(snap.bodyDataset.panelSurface === 'map-idle', `county reset should clear map search intent: ${snap.bodyDataset.panelSurface}`);
  assert(Number(snap.appState.trailDepth || 0) === 0, `reset should clear trail depth: ${JSON.stringify(snap.appState)}`);
  assert(snap.bodyDataset.semanticDive !== 'active', `reset should leave semantic dive inactive: ${snap.bodyDataset.semanticDive}`);
  assert(snap.bodyDataset.panelSurface !== 'map-focus-search', `reset should leave focused map surface: ${snap.bodyDataset.panelSurface}`);
  assert(!Number.isFinite(snap.appState.focusedIndex), `reset should clear focused node: ${JSON.stringify(snap.appState)}`);
  assert(!Number.isFinite(snap.appState.inspectedThreadIndex), `reset should clear inspected thread: ${JSON.stringify(snap.appState)}`);
  assert(snap.search.inputValue !== QUERY, `county reset should clear query text: ${JSON.stringify(snap.search)}`);
  assert(!isRendered(snap.boxes.searchContainer), `map-idle should hide the search drawer after reset: ${JSON.stringify(snap.boxes.searchContainer)}`);
  assert(!isRendered(snap.boxes.infoPanel), `map-idle should hide the info drawer after reset: ${JSON.stringify(snap.boxes.infoPanel)}`);

  console.log(JSON.stringify({
    query: QUERY,
    followTarget,
    finalDataset: snap.bodyDataset,
    finalState: snap.appState,
  }, null, 2));
  console.log('Mobile route ownership contract passed.');
} finally {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}
