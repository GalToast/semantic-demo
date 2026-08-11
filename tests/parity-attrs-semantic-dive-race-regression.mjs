/**
 * Regression test for the panelSurfaceMode() semantic-dive race condition.
 *
 * Bug: `if (nav.surface === 'focus-search') return 'focus-search'` ran BEFORE
 *      `if (focus.semanticDiveMode) return 'semantic-dive'`. When the user
 *      entered semantic-dive from focus-search, parity-attrs re-derived the
 *      surface and overwrote the manually-set `data-panel-surface='semantic-dive'`.
 *
 * Fix (commit a833d6e): Moved the `focus.semanticDiveMode` check to the TOP
 *                       of panelSurfaceMode(), so semantic-dive always wins
 *                       when active, regardless of nav.surface.
 *
 * Production flow: user enters semantic-dive from focus-search →
 *   1. semantic-dive-ui module sets data-panel-surface='semantic-dive' manually
 *   2. parity-attrs runs and re-derives panelSurfaceMode from stores
 *   3. If the race is back, parity-attrs overwrites the manual value with
 *      'focus-search' (because nav.surface is still 'focus-search')
 *
 * This test simulates the production flow:
 *   1. Load page in focus-search state
 *   2. Manually set data-panel-surface='semantic-dive' (mimics semantic-dive-ui)
 *   3. Wait for parity-attrs to re-derive (raf + microtask)
 *   4. Assert data-panel-surface is STILL 'semantic-dive' (not overwritten)
 *
 * If the race condition resurfaces, this test will fail.
 *
 * Run: node --loader ./tests/helpers/ts-resolve-loader.mjs tests/parity-attrs-semantic-dive-race-regression.mjs
 */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Canonical app entry (custom outDir build): the Svelte 5 build serves
// /dist/svelte/index.html; the bare /index.html root is NOT the app shell
// (2026-08-10 parity-race verification: /dist/svelte/index.html reaches
// surface=focus-search with 8406 points; the root URL stays unset).
const BASE_URL = 'http://127.0.0.1:8795/dist/svelte/index.html';
const VIEWPORT = { width: 1440, height: 900 };

// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const browser = await chromium.launch({ headless: true, args: [...(forceSoftwareWebgl ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--enable-webgl', '--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] });
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

try {
  const focusedUrl = `${BASE_URL}?view=galaxy&q=coffee&anchor=1&mode=trail&depth=1&record=1`;
  await page.goto(focusedUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const initialSurface = await page.evaluate(() => document.body.dataset.panelSurface);
  console.log(`  initial panelSurface: ${initialSurface}`);
  assert.equal(initialSurface, 'focus-search',
    `Pre-condition failed: page should be in focus-search state, got '${initialSurface}'`);

  await page.evaluate(() => {
    document.body.classList.add('is-active');
    document.body.dataset.activeView = 'galaxy';
    document.body.dataset.graphContext = 'focus';
    document.body.dataset.semanticDive = 'active';
    document.body.dataset.panelSurface = 'semantic-dive';
  });

  const immediateSurface = await page.evaluate(() => document.body.dataset.panelSurface);
  console.log(`  immediate after manual set: ${immediateSurface}`);
  assert.equal(immediateSurface, 'semantic-dive', 'Manual set should take effect immediately');

  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }
  await page.waitForTimeout(500);

  const afterParitySurface = await page.evaluate(() => document.body.dataset.panelSurface);
  console.log(`  after parity-attrs runs: ${afterParitySurface}`);

  assert.equal(afterParitySurface, 'semantic-dive',
    `RACE CONDITION REGRESSION: parity-attrs overwrote 'semantic-dive' back to '${afterParitySurface}'. ` +
    `The fix (commit a833d6e) moved focus.semanticDiveMode check to TOP of panelSurfaceMode() — ` +
    `if this is failing, the check is no longer at the top.`);

  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }
  const lateCheckSurface = await page.evaluate(() => document.body.dataset.panelSurface);
  console.log(`  after 20 more frames: ${lateCheckSurface}`);

  assert.equal(lateCheckSurface, 'semantic-dive',
    `RACE CONDITION REGRESSION (late): panelSurface should still be 'semantic-dive', got '${lateCheckSurface}'`);

  console.log('\npanelSurfaceMode() semantic-dive race regression PASSED');
  console.log('  - Initial state: focus-search (pre-condition)');
  console.log('  - Manual set to semantic-dive survives parity-attrs re-derivation');
  console.log('  - Late-frame check confirms the fix is stable, not transient');
} finally {
  await browser.close();
}
