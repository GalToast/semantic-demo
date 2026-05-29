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
  { name: 'mobile-search-error', viewport: mobile, params: { view: 'galaxy', q: 'semantic-error-proof' }, setup: forceSearchError },
  { name: 'mobile-focus', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' } },
  { name: 'mobile-field-node', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' }, setup: forceFieldNode },
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
const statesToRun = requestedStates.size
  ? states.filter((state) => requestedStates.has(state.name))
  : states;

if (requestedStates.size && statesToRun.length === 0) {
  console.error(`No ui-quality states matched: ${Array.from(requestedStates).join(', ')}`);
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
  await page.waitForTimeout(900);
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
const browser = await chromium.launch({ headless: true });
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
