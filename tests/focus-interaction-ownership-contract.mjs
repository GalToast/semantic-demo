/**
 * Focus interaction ownership contract.
 *
 * Focus-stage traversal actions should be available through the classified
 * __APP_ACTIONS__ bridge, and the focus -> preview -> pin -> clear -> follow
 * path should keep one primary mobile surface owner.
 */

import { chromium } from 'playwright';
import { refreshCompositionState, focusOnNode } from '@lib/orchestration/lifecycle'
import { inspectThreadNeighbor } from '@lib/journey/thread-inspector-state'

const DEFAULT_URL = 'http://127.0.0.1:8795/dist/svelte/index.html?view=galaxy&q=coffee&nodemo=1';
const TARGET_URL = process.env.INTERACTION_OWNERSHIP_URL || DEFAULT_URL;
const FOCUS_INDEX = Number(process.env.INTERACTION_OWNERSHIP_INDEX || 3060);

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function withCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('nodemo', '1');
  parsed.searchParams.set('interactioncheck', `focus-ownership-${Date.now()}`);
  return parsed.href;
}

async function waitForReady(page) {
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};

    return Array.isArray(state.points) &&
      state.points.length > 100 &&
      typeof focusOnNode === 'function' &&
      typeof actions.walkThreadNeighbor === 'function' &&
      state.applyingUrlState === false &&
            state.sceneRevealActive === false &&
      document.body.dataset.sceneReveal === 'inactive';
  }, null, { timeout: 45000 });
}

async function drawerSnapshot(page) {
  return page.evaluate(() => {
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
        height: Math.round(rect.height),
        y: Math.round(rect.y),
        bottom: Math.round(rect.bottom),
        display: style.display,
        visibility: style.visibility,
        visible,
      };
    };
    const boxes = {
      infoPanel: box('#info-panel'),
      searchResults: box('#search-results'),
      focusStage: box('#focus-stage'),
      threadInspector: box('#focus-thread-inspector'),
    };
    const drawerSized = Object.entries(boxes)
      .filter(([, item]) => item?.visible && item.height >= 140)
      .map(([name, item]) => ({ name, height: item.height, y: item.y, bottom: item.bottom }));
    const focusStageEl = document.querySelector('#focus-stage');
    const independentDrawers = Object.entries({
      infoPanel: document.querySelector('#info-panel'),
      searchResults: document.querySelector('#search-results'),
      focusStage: focusStageEl,
      threadInspector: document.querySelector('#focus-thread-inspector'),
    }).filter(([name, el]) => {
      if (!el) return false;
      const item = boxes[name];
      if (!item?.visible || item.height < 140) return false;
      return name === 'focusStage' || !focusStageEl?.contains(el);
    }).map(([name, el]) => {
      const item = boxes[name];
      return {
        name,
        height: item.height,
        y: item.y,
        bottom: item.bottom,
        nestedInFocusStage: name !== 'focusStage' && !!focusStageEl?.contains(el),
      };
    });
    return {
      bodyDataset: { ...document.body.dataset },
      drawerSized,
      independentDrawers,
      boxes,
    };
  });
}

async function followButtonStability(page) {
  return page.evaluate(async () => {
    const button = document.querySelector('#btn-thread-follow');
    const inspector = document.querySelector('#focus-thread-inspector');
    const samples = [];
    for (let i = 0; i < 8; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const rect = button?.getBoundingClientRect();
      const inspectorRect = inspector?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : -1;
      const centerY = rect ? rect.top + rect.height / 2 : -1;
      samples.push({
        surface: document.body.dataset.threadInspectSurface || '',
        active: inspector?.classList.contains('active') || false,
        ariaHidden: inspector?.getAttribute('aria-hidden') || '',
        buttonDisabled: button?.disabled || false,
        buttonRect: rect ? {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        } : null,
        inspectorRect: inspectorRect ? {
          x: Math.round(inspectorRect.x),
          y: Math.round(inspectorRect.y),
          width: Math.round(inspectorRect.width),
          height: Math.round(inspectorRect.height),
        } : null,
        topElementId: document.elementFromPoint(centerX, centerY)?.id || '',
      });
    }
    return samples;
  });
}

// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

try {
  await page.goto(withCacheBust(TARGET_URL), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForReady(page);

  const bridge = await page.evaluate(() => {

    return [
      'search',
      'clearSearch',
      'focusOnNode',
      'setTrailDepth',
      'setSemanticDiveMode',
      'returnToOverview',
      'resetExplorationFocus',
      'refreshCompositionState',
      'traverseNeighbor',
      'inspectThreadNeighbor',
      'pinThreadNeighbor',
      'unpinThreadInspection',
      'clearThreadInspection',
      'walkThreadNeighbor',
    ].reduce((memo, key) => {
      memo[key] = typeof actions[key];
      return memo;
    }, {});
  });

  Object.entries(bridge).forEach(([key, type]) => {
    assert(type === 'function', `__APP_ACTIONS__.${key} should be a function, got ${type}`);
  });

  await page.evaluate((index) => {
    focusOnNode(index, { fromSearchResult: true, skipUrlSync: true });
    refreshCompositionState();
  }, FOCUS_INDEX);

  await page.waitForFunction((index) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return (state.navState?.focusedIndex ?? state.focusedNode) === index &&
      ['focus', 'focus-search'].includes(document.body.dataset.panelSurface);
  }, FOCUS_INDEX, { timeout: 12000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 5000 }).catch(() => {});

  const candidate = await page.evaluate(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const focused = state.navState?.focusedIndex ?? state.focusedNode;
    const fromThreads = (state.navState?.threadCandidates || [])
      .map((item) => item?.index)
      .find((index) => Number.isFinite(index) && index !== focused);
    if (Number.isFinite(fromThreads)) return fromThreads;
    return (state.navState?.focusPocketIndices || [])
      .find((index) => Number.isFinite(index) && index !== focused) ?? null;
  });
  assert(Number.isFinite(candidate), 'focused node should expose a reachable thread/focus candidate');

  await page.evaluate((index) => {
    inspectThreadNeighbor(index, { force: true, surface: 'contract' });
  }, candidate);
  await page.waitForFunction((index) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return state.inspectedThreadIndex === index &&
      document.body.dataset.threadInspectSurface &&
      document.body.dataset.threadInspectSurface !== 'idle';
  }, candidate, { timeout: 8000 });

  const stablePreview = await followButtonStability(page);
  const buttonRects = stablePreview
    .map((sample) => sample.buttonRect)
    .filter(Boolean);
  const uniqueButtonRects = new Set(buttonRects.map((rect) => JSON.stringify(rect)));
  assert(buttonRects.length === stablePreview.length, `follow button should remain measurable, got ${JSON.stringify(stablePreview)}`);
  assert(uniqueButtonRects.size === 1, `follow button rect should be stable before click, got ${JSON.stringify(stablePreview)}`);
  assert(stablePreview.every((sample) => sample.surface !== 'idle'), `thread preview should keep a non-idle surface owner, got ${JSON.stringify(stablePreview)}`);
  assert(stablePreview.every((sample) => sample.active && sample.ariaHidden === 'false'), `thread inspector should remain active/visible, got ${JSON.stringify(stablePreview)}`);
  assert(stablePreview.every((sample) => sample.topElementId === 'btn-thread-follow'), `follow button should own its click point, got ${JSON.stringify(stablePreview)}`);

  await page.evaluate((index) => {
    window.__APP_ACTIONS__.pinThreadNeighbor(index, { surface: 'contract' });
  }, candidate);
  await page.waitForFunction((index) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return state.pinnedThreadIndex === index && state.inspectedThreadIndex === index;
  }, candidate, { timeout: 8000 });

  await page.evaluate(() => {
    window.__APP_ACTIONS__.clearThreadInspection({ force: true });
  });
  await page.waitForFunction(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return state.pinnedThreadIndex === null && state.inspectedThreadIndex === null;
  }, null, { timeout: 8000 });

  const preFollowSurface = await drawerSnapshot(page);
  assert(preFollowSurface.independentDrawers.length === 1 && preFollowSurface.independentDrawers[0].name === 'focusStage',
    `before follow expected focusStage as the only independent primary drawer, got ${JSON.stringify(preFollowSurface.independentDrawers)} from ${JSON.stringify(preFollowSurface.drawerSized)}`);

  const followCandidate = await page.evaluate(() => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const focused = state.navState?.focusedIndex ?? state.focusedNode;
    return (state.navState?.threadCandidates || [])
      .map((item) => item?.index)
      .find((index) => Number.isFinite(index) && index !== focused) ?? null;
  });
  assert(Number.isFinite(followCandidate), 'focused node should expose a fresh follow candidate after pin/clear');

  await page.evaluate((index) => {
    inspectThreadNeighbor(index, { force: true, surface: 'contract' });
  }, followCandidate);
  await page.waitForFunction((index) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    const button = document.querySelector('#btn-thread-follow');
    return state.inspectedThreadIndex === index &&
      document.body.dataset.threadInspectSurface !== 'idle' &&
      button &&
      !button.disabled &&
      button.getAttribute('aria-disabled') !== 'true';
  }, followCandidate, { timeout: 8000 });
  await page.locator('#btn-thread-follow').click({ timeout: 10000 });
  await page.waitForFunction((index) => {
    const state = window.__APP_STATE__ || window.__TEST_STATE__ || {};
    return (state.navState?.focusedIndex ?? state.focusedNode) === index &&
      ['focus', 'focus-search'].includes(document.body.dataset.panelSurface);
  }, followCandidate, { timeout: 12000 });
  await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {});

  const postFollow = await drawerSnapshot(page);
  assert(postFollow.independentDrawers.length === 1 && postFollow.independentDrawers[0].name === 'focusStage',
    `after follow expected focusStage as the only independent primary drawer, got ${JSON.stringify(postFollow.independentDrawers)} from ${JSON.stringify(postFollow.drawerSized)}`);
  assert(postFollow.bodyDataset.trailState === 'active', `follow should keep trail state active, got ${postFollow.bodyDataset.trailState}`);
  assert(['focus', 'focus-search'].includes(postFollow.bodyDataset.graphContext),
    `follow should remain in focused graph context, got ${postFollow.bodyDataset.graphContext}`);

  console.log(JSON.stringify({ bridge, candidate, followCandidate, preFollowSurface, postFollow }, null, 2));
  console.log('Focus interaction ownership contract passed.');
} finally {
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

process.exit(0);
