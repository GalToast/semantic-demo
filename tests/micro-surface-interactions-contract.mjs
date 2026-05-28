/**
 * micro-surface-interactions-contract.mjs
 *
 * Rendered micro-surface and micro-interaction checks for Semantic Explorer.
 * The broad surface contracts catch panel geometry; this catches the smaller
 * affordances that make the UI feel like app chrome: compact labels, sheet
 * handles, focus affordances, active feedback, ARIA hooks, and reduced motion.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:8795/vector-explorer-polished.html';
const cliArgs = process.argv.slice(2);
function positionalUrl(args) {
  for (const arg of args) {
    if (!arg.startsWith('--')) return arg;
  }
  return DEFAULT_URL;
}
const targetUrl = positionalUrl(cliArgs);
const outRoot = path.resolve(process.cwd(), 'tmp', 'micro-surface-interactions-contract');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outRoot, runId);

const mobile = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true };
const desktop = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false };

const states = [
  { name: 'mobile-idle', viewport: mobile, params: { view: 'galaxy' } },
  { name: 'mobile-focus', viewport: mobile, params: { view: 'galaxy', q: 'coffee', anchor: '519' } },
  { name: 'desktop-idle', viewport: desktop, params: { view: 'galaxy' } },
];

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
  await page.waitForTimeout(700);
}

async function forceFocusSurface(page) {
  await page.evaluate(() => {
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus-search';
    document.body.dataset.panelSurface = 'focus-search';
    document.body.dataset.focusPanelMode = 'overview';
    document.body.dataset.routeDirector = 'search-corridor';
    const refreshCompositionState = window.__APP_ACTIONS__?.refreshCompositionState ?? window.refreshCompositionState;
    if (typeof refreshCompositionState === 'function') refreshCompositionState();
  });
  await page.waitForTimeout(300);
}

async function auditMicroState(page, stateName) {
  if (stateName === 'mobile-focus') await forceFocusSurface(page);

  const result = await page.evaluate(async ({ stateName }) => {
    const failures = [];
    const passes = [];
    const isMobile = stateName.startsWith('mobile-');

    function visible(el) {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.05
        && rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.bottom > 0
        && rect.x < window.innerWidth
        && rect.y < window.innerHeight;
    }

    function clipped(el) {
      if (!visible(el)) return false;
      const style = getComputedStyle(el);
      if (parseFloat(style.fontSize || '0') === 0) return false;
      return el.scrollWidth > el.getBoundingClientRect().width + 1
        || el.scrollHeight > el.getBoundingClientRect().height + 1;
    }

    function focusSignal(el) {
      el.focus();
      const style = getComputedStyle(el);
      const outline = parseFloat(style.outlineWidth || '0');
      const hasShadow = style.boxShadow && style.boxShadow !== 'none';
      const borderVisible = !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(style.borderColor);
      return document.activeElement === el && (outline >= 1 || hasShadow || borderVisible);
    }

    function touchTarget(el) {
      const rect = el.getBoundingClientRect();
      return rect.width >= 43.5 && rect.height >= 43.5;
    }

    const routeControls = document.querySelector('[aria-label="Journey route controls"]');
    const primary = document.querySelector('#btn-journey-primary');
    const expectsRouteControls = stateName === 'mobile-focus';
    const allowsIdleRouteControls = stateName === 'desktop-idle';

    if (!expectsRouteControls) {
      if (visible(routeControls) && !allowsIdleRouteControls) failures.push({ check: 'idle-route-controls-hidden', selector: '[aria-label="Journey route controls"]' });
      else passes.push({ check: 'idle-route-controls-hidden' });
    } else if (!visible(primary)) failures.push({ check: 'primary-action-visible', selector: '#btn-journey-primary' });
    else {
      passes.push({ check: 'primary-action-visible' });
      if (!primary.getAttribute('aria-label')) failures.push({ check: 'primary-action-aria-label' });
      else passes.push({ check: 'primary-action-aria-label' });
      if (isMobile && !touchTarget(primary)) failures.push({ check: 'primary-action-touch-target', rect: primary.getBoundingClientRect() });
      else passes.push({ check: 'primary-action-touch-target' });
      if (clipped(primary)) failures.push({ check: 'primary-action-text-clipping', text: primary.textContent.trim(), rect: primary.getBoundingClientRect() });
      else passes.push({ check: 'primary-action-text-clipping' });

      const style = getComputedStyle(primary);
      const before = getComputedStyle(primary, '::before');
      if (isMobile && parseFloat(style.fontSize || '0') === 0 && (before.content === 'none' || before.content === '""')) {
        failures.push({ check: 'primary-action-compact-label', detail: 'font-size is zero without a pseudo-label' });
      } else {
        passes.push({ check: 'primary-action-compact-label' });
      }

      if (!focusSignal(primary)) failures.push({ check: 'primary-action-focus-signal' });
      else passes.push({ check: 'primary-action-focus-signal' });
    }

    const searchInput = document.querySelector('#search-input');
    if (visible(searchInput)) {
      if (!focusSignal(searchInput)) failures.push({ check: 'search-input-focus-signal' });
      else passes.push({ check: 'search-input-focus-signal' });
    }

    const sheet = document.querySelector(stateName === 'mobile-focus' ? '.focus-stage-card' : '#info-panel');
    if (isMobile && visible(sheet)) {
      const rect = sheet.getBoundingClientRect();
      const before = getComputedStyle(sheet, '::before');
      const handleWidth = parseFloat(before.width || '0');
      const handleHeight = parseFloat(before.height || '0');
      if (Math.abs(window.innerHeight - rect.bottom) > 1 || rect.top < -1) failures.push({ check: 'sheet-anchoring', rect });
      else passes.push({ check: 'sheet-anchoring' });
      if (handleWidth < 24 || handleHeight < 3 || before.content === 'none') failures.push({ check: 'sheet-handle-affordance', width: handleWidth, height: handleHeight, content: before.content });
      else passes.push({ check: 'sheet-handle-affordance' });
    }

    const toggles = Array.from(document.querySelectorAll('[aria-expanded]')).filter(visible);
    for (const toggle of toggles) {
      if (!toggle.getAttribute('aria-controls')) {
        failures.push({ check: 'expanded-control-target', selector: toggle.id || toggle.className || toggle.tagName });
      }
    }
    passes.push({ check: 'expanded-control-targets', inspected: toggles.length });

    return {
      name: stateName,
      bodyDataset: { ...document.body.dataset },
      pass: passes.length,
      failures,
    };
  }, { stateName });

  return result;
}

async function auditReducedMotion(page) {
  const result = await page.evaluate(() => {
    const failures = [];
    const passes = [];
    const motionSelectors = [
      '.journey-compass',
      '.journey-compass-action',
      '.focus-stage-card',
      '.search-container',
      '#info-panel',
    ];

    for (const selector of motionSelectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const style = getComputedStyle(el);
      const transitionDuration = style.transitionDuration
        .split(',')
        .map((value) => parseFloat(value) || 0)
        .reduce((max, value) => Math.max(max, value), 0);
      const animationName = style.animationName;
      if (transitionDuration > 0.02 || (animationName && animationName !== 'none')) {
        failures.push({ check: 'reduced-motion-suppression', selector, transitionDuration, animationName });
      } else {
        passes.push({ check: 'reduced-motion-suppression', selector });
      }
    }

    return {
      name: 'mobile-reduced-motion',
      bodyDataset: { ...document.body.dataset },
      pass: passes.length,
      failures,
    };
  });
  return result;
}

await fs.promises.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const state of states) {
    const page = await browser.newPage({
      viewport: { width: state.viewport.width, height: state.viewport.height },
      deviceScaleFactor: state.viewport.deviceScaleFactor,
      isMobile: state.viewport.isMobile,
    });
    await page.goto(withParams(targetUrl, state.params), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    const result = await auditMicroState(page, state.name);
    await fs.promises.writeFile(path.join(outDir, `${state.name}.json`), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    results.push(result);
    await page.close();
  }

  const reducedPage = await browser.newPage({
    viewport: { width: mobile.width, height: mobile.height },
    deviceScaleFactor: mobile.deviceScaleFactor,
    isMobile: true,
  });
  await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
  await reducedPage.goto(withParams(targetUrl, { view: 'galaxy', q: 'coffee', anchor: '519' }), { waitUntil: 'domcontentloaded' });
  await waitForReady(reducedPage);
  await forceFocusSurface(reducedPage);
  const reduced = await auditReducedMotion(reducedPage);
  await fs.promises.writeFile(path.join(outDir, 'mobile-reduced-motion.json'), `${JSON.stringify(reduced, null, 2)}\n`, 'utf8');
  results.push(reduced);
  await reducedPage.close();
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
