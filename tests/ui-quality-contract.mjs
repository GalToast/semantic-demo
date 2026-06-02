/**
 * ui-quality-contract.mjs
 *
 * Opinionated rendered-UI quality gate for Semantic Explorer.
 * This complements surface-contract-check.mjs by checking cross-state
 * problems that usually look "ugly" before they become functional bugs:
 * clipped critical text, undersized visible controls, viewport-clipped chrome,
 * panel overlap, and controls leaking into states where they compete visually.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';
const cliArgs = process.argv.slice(2);
const headed = !cliArgs.includes('--headless')
  && process.env.PW_HEADLESS !== '1'
  && process.env.PLAYWRIGHT_HEADLESS !== '1';
const launchOptions = {
  headless: !headed,
  args: headed
    ? ['--use-gl=angle', '--enable-webgl', '--no-sandbox']
    : ['--no-sandbox'],
};
function positionalUrl(args) {
  const flagsWithValue = new Set(['--surface', '--state', '--states', '--surfaces']);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (flagsWithValue.has(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith('--')) return arg;
  }
  return DEFAULT_URL;
}
const targetUrl = positionalUrl(cliArgs);
const outRoot = path.resolve(process.cwd(), 'tmp', 'ui-quality-contract');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outRoot, runId);

const mobile = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
const desktop = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false };

const states = [
  { name: 'mobile-idle', viewport: mobile, params: { view: 'galaxy' } },
  { name: 'mobile-search', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '1' } },
  { name: 'mobile-search-error', viewport: mobile, params: { view: 'galaxy', q: 'semantic-error-proof' }, setup: forceSearchError },
  { name: 'mobile-focus', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' } },
  { name: 'mobile-focus-search', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' } },
  { name: 'mobile-field-node', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' }, setup: forceFieldNode },
  { name: 'mobile-thread-preview', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' }, setup: forceThreadPreview },
  { name: 'mobile-semantic-dive', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '1', mode: 'trail', depth: '2', record: '1' } },
  { name: 'desktop-idle', viewport: desktop, params: { view: 'galaxy' } },
];

function requestedStateNames(args) {
  const names = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--surface' || arg === '--state') {
      if (args[i + 1]) names.push(args[i + 1]);
      i += 1;
    } else if (arg === '--states' || arg === '--surfaces') {
      if (args[i + 1]) names.push(...args[i + 1].split(',').map((value) => value.trim()).filter(Boolean));
      i += 1;
    } else if (arg.startsWith('--surface=')) {
      names.push(arg.slice('--surface='.length));
    } else if (arg.startsWith('--state=')) {
      names.push(arg.slice('--state='.length));
    } else if (arg.startsWith('--states=')) {
      names.push(...arg.slice('--states='.length).split(',').map((value) => value.trim()).filter(Boolean));
    } else if (arg.startsWith('--surfaces=')) {
      names.push(...arg.slice('--surfaces='.length).split(',').map((value) => value.trim()).filter(Boolean));
    }
  }
  return new Set(names);
}

const requestedStates = requestedStateNames(cliArgs);
const availableStateNames = new Set(states.map((state) => state.name));
const unknownStates = [...requestedStates].filter((name) => !availableStateNames.has(name));
const statesToRun = requestedStates.size
  ? states.filter((state) => requestedStates.has(state.name))
  : states;

if (unknownStates.length) {
  console.error(`Unknown ui-quality state(s): ${unknownStates.join(', ')}`);
  console.error(`Available states: ${states.map((state) => state.name).join(', ')}`);
  process.exit(1);
}

function withParams(baseUrl, params) {
  const url = new URL(baseUrl);
  url.searchParams.set('nodemo', '1');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function waitForReady(page) {
  await page.waitForLoadState('load', { timeout: 7000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForFunction(() => document.body?.dataset?.graphicsMode, { timeout: 7000 }).catch(() => {});
  await page.waitForFunction(() => {
    const { cameraAssist, loadingOverlay, sceneReady, viewHandoffActive } = document.body.dataset;
    const overlay = document.querySelector('#loading-overlay');
    const overlayStyle = overlay ? getComputedStyle(overlay) : null;
    const overlayHidden = !overlay ||
      loadingOverlay === 'hidden' ||
      overlay.classList.contains('hidden') ||
      overlay.getAttribute('aria-hidden') === 'true' ||
      overlayStyle?.display === 'none' ||
      overlayStyle?.visibility === 'hidden' ||
      Number(overlayStyle?.opacity || 1) <= 0.05;
    const routeSettled = sceneReady === 'true' ||
      viewHandoffActive === 'false' ||
      cameraAssist === 'free' ||
      document.body.dataset.graphicsMode === 'fallback';
    return overlayHidden && routeSettled;
  }, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function forceSearchError(page) {
  await page.evaluate(() => {
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'search';
    document.body.dataset.panelSurface = 'search';
    document.body.dataset.laneState = 'degraded';
    const searchContainer = document.querySelector('.search-container');
    searchContainer?.classList.add('has-query');
    const results = document.querySelector('#search-results');
    if (!results) return;
    results.classList.add('active');
    results.innerHTML = `
      <div class="search-error-state" role="alert">
        <span class="search-error-kicker">Connection Lost</span>
        <p class="search-error-text">Semantic lane unavailable. Retrying.</p>
        <div class="search-error-actions">
          <button class="search-error-retry-btn" type="button">Retry</button>
          <button class="search-error-dismiss-btn" type="button">Dismiss</button>
        </div>
      </div>`;
  });
  await page.waitForTimeout(250);
}

async function forceFieldNode(page) {
  await page.evaluate(() => {
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus-search';
    document.body.dataset.panelSurface = 'focus-search';
    document.body.dataset.focusPanelMode = 'field-node';
    document.body.dataset.fieldStepSync = 'active';
    if (typeof (window.__APP_ACTIONS__?.refreshCompositionState) === 'function') (window.__APP_ACTIONS__?.refreshCompositionState)();
  });
  await page.waitForTimeout(350);
}

async function forceThreadPreview(page) {
  const firstResult = page.locator('.search-result-item').first();
  if (await firstResult.count()) {
    await firstResult.click({ timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {};
    if (typeof window.__APP_ACTIONS__?.switchView === 'function') {
      window.__APP_ACTIONS__.switchView('galaxy', { skipUrlSync: true, silentHandoff: true });
    }
    if (state.currentView !== 'galaxy') state.currentView = 'galaxy';

    const seedIndex =
      Number.isFinite(state.navState?.focusedIndex) ? state.navState.focusedIndex :
      Number.isFinite(state.focusedNode) ? state.focusedNode :
      Number.isFinite(state.currentSearchSummary?.anchorIndex) ? state.currentSearchSummary.anchorIndex :
      519;
    if (Number.isFinite(seedIndex)) state.focusedNode = seedIndex;
    if (state.navState && Number.isFinite(seedIndex)) {
      state.navState.focusedIndex = seedIndex;
      if (typeof window.__APP_ACTIONS__?.setTrailFromSeed === 'function') {
        window.__APP_ACTIONS__.setTrailFromSeed(seedIndex);
      }
    }

    const candidate = (state.navState?.threadCandidates || [])
      .find((item) => item && Number.isFinite(item.index) && item.index !== seedIndex && item.relationshipRole) ||
      (state.navState?.threadCandidates || [])
        .find((item) => item && Number.isFinite(item.index) && item.index !== seedIndex);
    if (candidate && !candidate.relationshipRole) {
      candidate.relationshipRole = 'upstream';
      candidate.relationshipAxis = candidate.relationshipAxis || 'ui_quality_support_fixture';
      candidate.roleReason = candidate.roleReason || 'support or infrastructure signal';
      candidate.source = candidate.source || 'semantic';
    }

    const inspectThreadNeighbor =
      typeof window._ti?.inspectThreadNeighbor === 'function' ? window._ti.inspectThreadNeighbor :
      typeof window.inspectThreadNeighbor === 'function' ? window.inspectThreadNeighbor :
      null;
    const renderThreadInspection =
      typeof window._ti?.renderThreadInspection === 'function' ? window._ti.renderThreadInspection :
      typeof window.renderThreadInspection === 'function' ? window.renderThreadInspection :
      null;
    if (candidate && inspectThreadNeighbor) {
      inspectThreadNeighbor(candidate.index, { force: true, surface: 'inspector' });
    } else if (candidate && renderThreadInspection) {
      renderThreadInspection(candidate.index, { force: true, surface: 'inspector' });
    }

    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus';
    document.body.dataset.panelSurface = document.body.dataset.panelSurface === 'focus-search' ? 'focus-search' : 'focus';
    document.body.dataset.threadInspectSurface = 'inspector';
    if (typeof window.__APP_ACTIONS__?.refreshCompositionState === 'function') {
      window.__APP_ACTIONS__.refreshCompositionState();
    }

    const focusStage = document.querySelector('#focus-stage');
    if (focusStage) {
      focusStage.hidden = false;
      focusStage.setAttribute('aria-hidden', 'false');
      focusStage.classList.add('active');
    }
    document.querySelectorAll('#btn-thread-pin, #btn-thread-follow, #btn-thread-clear').forEach((btn) => {
      btn.disabled = false;
    });
  });
  await page.waitForTimeout(350);
}

function checksForState(name) {
  const criticalText = [
    '.journey-compass-title',
    '.journey-compass-action',
    '.search-label',
    '.search-input',
    '.search-error-state',
    '.search-error-kicker',
    '.search-error-text',
    '.focus-stage-name',
    '.focus-stage-dive-btn',
    '.focus-thread-inspector-title',
    '.focus-thread-inspector-copy',
    '.cluster-label',
  ];

  const interactive = [
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    'a[href]',
  ];

  const chrome = [
    '.journey-compass',
    '#info-panel',
    '.search-container',
    '#search-results',
    '#focus-stage',
    '.focus-stage-card',
    '.focus-thread-inspector',
    '.controls',
    '.share-toggle',
    '.view-toggle',
    '#btn-legend',
  ];

  return { criticalText, interactive, chrome, isMobile: name.startsWith('mobile-') };
}

async function auditState(page, name) {
  const selectors = checksForState(name);
  return page.evaluate(({ selectors, name }) => {
    const failures = [];
    const passes = [];
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    function visible(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const inViewport = rect.right > 0 && rect.bottom > 0 && rect.x < window.innerWidth && rect.y < window.innerHeight;
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.05
        && rect.width > 0
        && rect.height > 0
        && inViewport;
    }

    function rectFor(selector) {
      const el = document.querySelector(selector);
      if (!visible(el)) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    }

    function visibleChrome(selector) {
      const el = document.querySelector(selector);
      if (!visible(el)) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        selector,
        x: Number(rect.x.toFixed(1)),
        y: Number(rect.y.toFixed(1)),
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        bottom: Number(rect.bottom.toFixed(1)),
        areaRatio: Number(((rect.width * rect.height) / (viewport.width * viewport.height)).toFixed(3)),
        pointerEvents: style.pointerEvents,
        opacity: Number(style.opacity || 1),
        zIndex: style.zIndex,
      };
    }

    function clipped(el) {
      if (!visible(el)) return false;
      if (parseFloat(getComputedStyle(el).fontSize || '0') === 0) return false;
      const text = (el.textContent || el.value || '').trim();
      if (!text || text.length < 2) return false;
      const style = getComputedStyle(el);
      if (style.overflow === 'visible' && style.whiteSpace !== 'nowrap') return false;
      const rect = el.getBoundingClientRect();
      return el.scrollWidth > rect.width + 1 || el.scrollHeight > rect.height + 1;
    }

    function overlaps(a, b, tolerance = 3) {
      return !(a.right <= b.x + tolerance || b.right <= a.x + tolerance || a.bottom <= b.y + tolerance || b.bottom <= a.y + tolerance);
    }

    const visibleCompassActions = Array.from(document.querySelectorAll('.journey-compass-action')).filter(visible);
    for (const action of visibleCompassActions) {
      const rect = action.getBoundingClientRect();
      const label = (action.innerText || action.textContent || action.getAttribute('aria-label') || '').trim();
      if (action.hidden || action.hasAttribute('hidden') || !action.dataset.journeyAction) {
        failures.push({
          check: 'composition:journey-action-hidden-rendered',
          selector: action.id ? `#${action.id}` : '.journey-compass-action',
          state: name,
          label,
          action: action.dataset.journeyAction || '',
          rect: {
            x: Number(rect.x.toFixed(1)),
            y: Number(rect.y.toFixed(1)),
            width: Number(rect.width.toFixed(1)),
            height: Number(rect.height.toFixed(1)),
          },
        });
      } else if (!label) {
        failures.push({
          check: 'composition:journey-action-blank-label',
          selector: action.id ? `#${action.id}` : '.journey-compass-action',
          state: name,
          action: action.dataset.journeyAction || '',
        });
      }
    }

    for (const selector of selectors.criticalText) {
      const elements = Array.from(document.querySelectorAll(selector)).filter(visible);
      for (const el of elements) {
        if (clipped(el)) {
          failures.push({ check: 'text-clipping', selector, text: (el.textContent || el.value || '').trim().slice(0, 80) });
        }
      }
      passes.push({ check: 'text-clipping', selector, inspected: elements.length });
    }

    if (selectors.isMobile) {
      const interactive = Array.from(document.querySelectorAll(selectors.interactive.join(','))).filter(visible);
      for (const el of interactive) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const label = el.id || el.className || el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName;
        if (style.pointerEvents !== 'none' && rect.width < 43.5 || style.pointerEvents !== 'none' && rect.height < 43.5) {
          failures.push({ check: 'touch-target', selector: label, width: Number(rect.width.toFixed(1)), height: Number(rect.height.toFixed(1)) });
        }
      }
      passes.push({ check: 'touch-targets', inspected: interactive.length });
    }

    for (const selector of selectors.chrome) {
      const rect = rectFor(selector);
      if (!rect) continue;
      const offscreen = rect.x < -1 || rect.y < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1;
      if (offscreen) failures.push({ check: 'viewport-fit', selector, rect });
      passes.push({ check: 'viewport-fit', selector });
    }

    const topChrome = rectFor('.journey-compass');
    const lowerSelectors = ['#info-panel', '.search-container', '#search-results', '#focus-stage', '.focus-stage-card', '.focus-thread-inspector'];
    if (topChrome) {
      for (const selector of lowerSelectors) {
        const lower = rectFor(selector);
        if (lower && overlaps(topChrome, lower)) failures.push({ check: 'chrome-overlap', a: '.journey-compass', b: selector });
      }
    }

    if (name.includes('search') || name.includes('focus') || name.includes('field-node')) {
      const share = rectFor('.share-toggle');
      if (share && selectors.isMobile) failures.push({ check: 'state-leak', selector: '.share-toggle', state: name });
    }

    const visibleChromeSurfaces = selectors.chrome
      .map((selector) => visibleChrome(selector))
      .filter(Boolean);
    passes.push({ check: 'composition:visible-chrome', inspected: visibleChromeSurfaces.length, surfaces: visibleChromeSurfaces });

    if (selectors.isMobile) {
      const controls = visibleChromeSurfaces.find((surface) => surface.selector === '.controls');
      const activeView = document.body.dataset.activeView || '';
      const panelSurface = document.body.dataset.panelSurface || '';
      const tallRail = controls && controls.pointerEvents !== 'none' && controls.height > 120 && controls.width >= 44;
      if (activeView === 'galaxy' && panelSurface && !panelSurface.startsWith('map-') && tallRail) {
        failures.push({
          check: 'composition:controls-rail-prominent',
          selector: '.controls',
          state: name,
          rect: controls,
        });
      }
      if ((panelSurface === 'focus-search' || panelSurface === 'semantic-dive') && controls) {
        failures.push({
          check: 'composition:focus-controls-rail-visible',
          selector: '.controls',
          state: name,
          rect: controls,
        });
      }

      const share = rectFor('.share-toggle');
      const searchContainer = rectFor('.search-container');
      const modeGrid = rectFor('#mode-grid');
      if (panelSurface === 'search' && modeGrid) {
        failures.push({
          check: 'composition:search-mode-grid-visible',
          selector: '#mode-grid',
          state: name,
          rect: modeGrid,
        });
      }

      if (panelSurface === 'search') {
        const compass = visibleChrome('.journey-compass');
        const compassCopy = visibleChrome('.journey-compass-copy');
        const compassActions = visibleChrome('.journey-compass-actions');
        if (compass && compassCopy && compassCopy.width < Math.min(150, compass.width * 0.42)) {
          failures.push({
            check: 'composition:search-compass-copy-squeezed',
            selector: '.journey-compass-copy',
            state: name,
            rect: compassCopy,
          });
        }
        if (compass && compassActions && compassActions.width > Math.min(170, compass.width * 0.48)) {
          failures.push({
            check: 'composition:search-compass-actions-dominate',
            selector: '.journey-compass-actions',
            state: name,
            rect: compassActions,
          });
        }
        for (const action of visibleCompassActions) {
          if (action.dataset.journeyAction && !action.dataset.mobileLabel) {
            failures.push({
              check: 'composition:journey-action-missing-mobile-label',
              selector: action.id ? `#${action.id}` : '.journey-compass-action',
              state: name,
              action: action.dataset.journeyAction,
            });
          }
        }
      }

      if ((panelSurface === 'focus' || panelSurface === 'focus-search') && searchContainer) {
        failures.push({
          check: 'composition:focus-search-bar-visible',
          selector: '.search-container',
          state: name,
          rect: searchContainer,
        });
      }

      if ((panelSurface === 'focus-search' || panelSurface === 'semantic-dive') && modeGrid) {
        failures.push({
          check: 'composition:focus-mode-grid-visible',
          selector: '#mode-grid',
          state: name,
          rect: modeGrid,
        });
      }

      const viewToggle = visibleChrome('.view-toggle');
      if ((panelSurface === 'focus-search' || panelSurface === 'semantic-dive') && viewToggle) {
        failures.push({
          check: 'composition:focus-view-toggle-visible',
          selector: '.view-toggle',
          state: name,
          rect: viewToggle,
        });
      }

      if (panelSurface === 'focus-search' || panelSurface === 'semantic-dive') {
        for (const selector of ['.share-toggle', '.legend-toggle']) {
          const globalAction = visibleChrome(selector);
          if (globalAction) {
            failures.push({
              check: 'composition:focus-global-action-visible',
              selector,
              state: name,
              rect: globalAction,
            });
          }
        }
      }

      if (['focus', 'focus-search', 'semantic-dive'].includes(panelSurface)) {
        const selectedCard = document.querySelector('#selected-card');
        const selectedDetails = document.querySelector('#selected-details');
        if (selectedCard?.dataset.contentOwner !== 'focus-stage') {
          failures.push({
            check: 'composition:focus-selected-content-owner',
            selector: '#selected-card',
            state: name,
            owner: selectedCard?.dataset.contentOwner || '',
            variant: selectedCard?.dataset.contentVariant || '',
          });
        }
        if (selectedCard && selectedCard.getAttribute('aria-hidden') !== 'true') {
          failures.push({
            check: 'composition:focus-selected-card-aria-hidden',
            selector: '#selected-card',
            state: name,
          });
        }
        if (selectedDetails && selectedDetails.getAttribute('aria-hidden') !== 'true') {
          failures.push({
            check: 'composition:focus-selected-details-aria-hidden',
            selector: '#selected-details',
            state: name,
            hidden: selectedDetails.hidden,
            ariaHidden: selectedDetails.getAttribute('aria-hidden'),
            rect: rectFor('#selected-details'),
          });
        }
      }

      if (panelSurface === 'idle' && share && searchContainer && overlaps(share, searchContainer, 0)) {
        failures.push({
          check: 'composition:idle-share-overlaps-search',
          selector: '.share-toggle',
          state: name,
          rect: share,
        });
      }

      const threadInspectSurface = document.body.dataset.threadInspectSurface || '';
      const threadInspector = visibleChrome('#focus-thread-inspector');
      if ((panelSurface === 'focus' || panelSurface === 'focus-search') && threadInspectSurface === 'idle' && threadInspector) {
        failures.push({
          check: 'composition:focus-idle-thread-preview-visible',
          selector: '#focus-thread-inspector',
          state: name,
          rect: threadInspector,
        });
      }

      const diveButton = visibleChrome('.focus-stage-dive-btn');
      if ((panelSurface === 'focus' || panelSurface === 'focus-search') && threadInspectSurface && threadInspectSurface !== 'idle' && diveButton) {
        failures.push({
          check: 'composition:preview-step-inside-visible',
          selector: '.focus-stage-dive-btn',
          state: name,
          rect: diveButton,
        });
      }

      const nearbyStops = visibleChrome('.focus-stage-neighbors');
      if ((panelSurface === 'focus' || panelSurface === 'focus-search') && threadInspectSurface && threadInspectSurface !== 'idle' && nearbyStops && nearbyStops.height < 40) {
        failures.push({
          check: 'composition:preview-nearby-stops-squeezed',
          selector: '.focus-stage-neighbors',
          state: name,
          rect: nearbyStops,
        });
      }

      const infoPanel = visibleChromeSurfaces.find((surface) => surface.selector === '#info-panel');
      if (panelSurface === 'semantic-dive' && infoPanel && infoPanel.height > 48) {
        failures.push({
          check: 'composition:semantic-dive-info-panel-slab',
          selector: '#info-panel',
          state: name,
          rect: infoPanel,
        });
      }

      const compass = visibleChromeSurfaces.find((surface) => surface.selector === '.journey-compass');
      if (panelSurface === 'semantic-dive' && compass && compass.height > 80) {
        failures.push({
          check: 'composition:semantic-dive-compass-too-tall',
          selector: '.journey-compass',
          state: name,
          rect: compass,
        });
      }

      const focusStageCard = visibleChromeSurfaces.find((surface) => surface.selector === '.focus-stage-card');
      if (panelSurface === 'semantic-dive' && focusStageCard && focusStageCard.height > 205) {
        failures.push({
          check: 'composition:semantic-dive-bottom-hud-too-tall',
          selector: '.focus-stage-card',
          state: name,
          rect: focusStageCard,
        });
      }

      if (panelSurface === 'semantic-dive') {
        for (const selector of ['.journey-compass-rail', '.journey-compass-actions']) {
          const navCluster = visibleChrome(selector);
          if (navCluster) {
            failures.push({
              check: 'composition:semantic-dive-compass-nav-visible',
              selector,
              state: name,
              rect: navCluster,
            });
          }
        }
        const completeNext = document.querySelector('#btn-inside-next');
        if (completeNext && visible(completeNext) && completeNext.disabled && /trail complete/i.test(completeNext.textContent || '')) {
          failures.push({
            check: 'composition:semantic-dive-disabled-complete-action-visible',
            selector: '#btn-inside-next',
            state: name,
            rect: rectFor('#btn-inside-next'),
          });
        }
      }
    }

    const overflowX = document.documentElement.scrollWidth > window.innerWidth;
    const overflowY = document.documentElement.scrollHeight > window.innerHeight + 1;
    if (overflowX) failures.push({ check: 'document-overflow-x', scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth });
    passes.push({ check: overflowY ? 'document-overflow-y' : 'document-no-overflow-y' });

    return {
      name,
      viewport,
      bodyDataset: { ...document.body.dataset },
      pass: passes.length,
      failures,
    };
  }, { selectors, name });
}

await fs.promises.mkdir(outDir, { recursive: true });
const browser = await chromium.launch(launchOptions);
const results = [];

try {
  for (const state of statesToRun) {
    const page = await browser.newPage({
      viewport: { width: state.viewport.width, height: state.viewport.height },
      deviceScaleFactor: state.viewport.deviceScaleFactor,
      isMobile: state.viewport.isMobile,
    });
    await page.goto(withParams(targetUrl, state.params), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    if (state.setup) await state.setup(page);
    const result = await auditState(page, state.name);
    await fs.promises.writeFile(path.join(outDir, `${state.name}.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    results.push(result);
    await page.close();
  }
} finally {
  await browser.close();
}

const failCount = results.reduce((sum, result) => sum + result.failures.length, 0);
const passCount = results.reduce((sum, result) => sum + result.pass, 0);
const summary = {
  outDir,
  url: targetUrl,
  states: results.length,
  pass: passCount,
  fail: failCount,
  results: results.map((result) => ({
    name: result.name,
    pass: result.pass,
    fail: result.failures.length,
    failures: result.failures,
  })),
};

await fs.promises.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
if (failCount > 0) process.exit(1);
