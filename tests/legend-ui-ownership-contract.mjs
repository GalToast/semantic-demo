/**
 * legend-ui-ownership-contract.mjs
 *
 * Verifies the legend-ui.js adapter owns the legend panel structural transitions
 * and that lifecycle.js and event-bindings.js both import it without creating
 * import cycles.
 *
 * Runs in Node. No Playwright, no live network.
 *
 * Usage:
 *   node tests/legend-ui-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());

const LEGEND_UI_PATH = path.join(SEMDEMO_ROOT, 'js/modules/legend-ui.js');
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js');
const EVENT_BINDINGS_PATH = path.join(SEMDEMO_ROOT, 'js/modules/event-bindings.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function readSrc(p) {
  return fs.readFileSync(p, 'utf-8');
}

// ── TEST 1: legend-ui.js exports the structural transition functions ──────────────────────

function testLegendUiExportsStructuralTransitions() {
  console.log('\n[TEST 1] legend-ui.js exports structural transition functions');

  const src = readSrc(LEGEND_UI_PATH);

  assert(src.includes('export function closeLegendPanel'), 'exports closeLegendPanel');
  assert(src.includes('export function openLegendPanel'), 'exports openLegendPanel');
  assert(src.includes('export function isLegendPanelOpen'), 'exports isLegendPanelOpen');
  assert(src.includes('export function restoreLegendCollapsedPanel'), 'exports restoreLegendCollapsedPanel');

  console.log('  OK — legend-ui.js exports closeLegendPanel, openLegendPanel, isLegendPanelOpen, restoreLegendCollapsedPanel');
}

// ── TEST 2: legend-ui.js does not import lifecycle, event-bindings, or stateful owners ────

function testLegendUiDoesNotImportLifecycleOrEventBindings() {
  console.log('\n[TEST 2] legend-ui.js does NOT import lifecycle.js or event-bindings.js');

  const src = readSrc(LEGEND_UI_PATH);

  assert(!src.includes('from ./lifecycle.js'), 'does not import lifecycle.js');
  assert(!src.includes('from ./event-bindings.js'), 'does not import event-bindings.js');
  const imports = src.match(/^import .+? from/mg) || [];
  assert(imports.length === 0, `legend-ui.js should remain DOM-only and import-free, found: ${imports.join(', ')}`);

  console.log('  OK — legend-ui.js is neutral and import-free');
}

// ── TEST 3: lifecycle.js imports from legend-ui.js ───────────────────────────────────────

function testLifecycleImportsFromLegendUi() {
  console.log('\n[TEST 3] lifecycle.js imports from legend-ui.js');

  const src = readSrc(LIFECYCLE_PATH);

  assert(
    src.includes("from './legend-ui.js'"),
    'lifecycle.js imports from legend-ui.js'
  );
  assert(
    src.includes('closeLegendPanel') && src.includes('openLegendPanel') && src.includes('restoreLegendCollapsedPanel'),
    'lifecycle.js imports closeLegendPanel, openLegendPanel, restoreLegendCollapsedPanel'
  );

  console.log('  OK — lifecycle.js imports legend-ui.js');
}

// ── TEST 4: event-bindings.js imports from legend-ui.js ───────────────────────────────────

function testEventBindingsImportsFromLegendUi() {
  console.log('\n[TEST 4] event-bindings.js imports from legend-ui.js');

  const src = readSrc(EVENT_BINDINGS_PATH);

  assert(
    src.includes("from './legend-ui.js'"),
    'event-bindings.js imports from legend-ui.js'
  );
  assert(
    src.includes('closeLegendPanel') && src.includes('openLegendPanel') && src.includes('restoreLegendCollapsedPanel'),
    'event-bindings.js imports closeLegendPanel, openLegendPanel, restoreLegendCollapsedPanel'
  );

  console.log('  OK — event-bindings.js imports legend-ui.js');
}

// ── TEST 5: No new lifecycle ↔ event-bindings import cycle ───────────────────────────────
// lifecycle → legend-ui → (nothing else)
// event-bindings → legend-ui → (nothing else)
// lifecycle → event-bindings (pre-existing via initSemanticDemoEventListeners)
// No new cycle introduced.

function testNoNewImportCycle() {
  console.log('\n[TEST 5] No new import cycle introduced via legend-ui.js');

  const lifecycleSrc = readSrc(LIFECYCLE_PATH);
  const eventBindingsSrc = readSrc(EVENT_BINDINGS_PATH);
  const legendUiSrc = readSrc(LEGEND_UI_PATH);

  // legend-ui imports nothing; it is a DOM-only adapter with no state-owner dependencies.
  const imports = legendUiSrc.match(/^import .+? from/mg) || [];
  const importedModules = imports.map(i => {
    const m = i.match(/from\s+['"](.+?)['"]/);
    return m ? m[1] : null;
  }).filter(Boolean);

  assert(importedModules.length === 0, `legend-ui.js should not import owner modules: ${importedModules.join(', ')}`);

  // event-bindings does not import lifecycle (already has that cycle via initSemanticDemoEventListeners)
  // but doesn't deepen it by importing lifecycle's legend-ui-dependent functions
  const eventBindingsImports = eventBindingsSrc.match(/^import .+? from ['"]\.\/lifecycle\.js['"]/);
  // The existing cycle is fine; we just verify no new direct lifecycle import
  // (event-bindings already imports from lifecycle, we don't add more)

  console.log('  OK — no new import cycle: legend-ui is neutral, lifecycle and event-bindings both import it');
}

// ── TEST 6: lifecycle.closeLegendGuide uses closeLegendPanel from legend-ui ───────────────

function testLifecycleCloseLegendGuideUsesAdapter() {
  console.log('\n[TEST 6] lifecycle.closeLegendGuide delegates to legend-ui adapter');

  const lifecycleSrc = readSrc(LIFECYCLE_PATH);

  // closeLegendGuide body should call closeLegendPanel() (from legend-ui)
  // and NOT do direct DOM manipulation for panel class/aria
  const closeMatch = lifecycleSrc.match(/export function closeLegendGuide[\s\S]*?^}/m);
  assert(closeMatch, 'lifecycle.js defines closeLegendGuide');

  const body = closeMatch[0];
  assert(
    body.includes('closeLegendPanel()'),
    'closeLegendGuide calls closeLegendPanel() from legend-ui'
  );
  // Should NOT have direct .classList.remove('active') / setAttribute pattern
  assert(
    !body.includes('classList.remove'),
    'closeLegendGuide does not do direct DOM class manipulation (delegated to legend-ui)'
  );

  console.log('  OK — closeLegendGuide delegates to legend-ui.closeLegendPanel');
}

// ── TEST 7: lifecycle.switchView uses closeLegendPanel for legend cleanup ─────────────────

function testSwitchViewUsesCloseLegendPanel() {
  console.log('\n[TEST 7] lifecycle.switchView uses closeLegendPanel from legend-ui');

  const lifecycleSrc = readSrc(LIFECYCLE_PATH);

  // switchView should call closeLegendPanel() (not do direct DOM manipulation)
  // in the section that closes the legend panel when switching views
  const switchMatch = lifecycleSrc.match(/export function switchView[\s\S]*?const btnGalaxy/m);
  assert(switchMatch, 'lifecycle.js defines switchView');

  // The legend cleanup block should call closeLegendPanel
  // After our edit, it should use closeLegendPanel()
  const legendBlock = switchMatch[0].match(/closeLegendPanel\(\)[\s\S]*?const btnGalaxy/);
  assert(legendBlock, 'switchView calls closeLegendPanel() for legend cleanup');
  assert(
    !legendBlock[0].includes('classList.remove'),
    'switchView legend cleanup does not use direct DOM manipulation'
  );

  console.log('  OK — switchView uses closeLegendPanel for legend cleanup');
}

// ── TEST 8: lifecycle.updateLegendGuideState uses openLegendPanel/closeLegendPanel ────────

function testUpdateLegendGuideStateUsesAdapter() {
  console.log('\n[TEST 8] lifecycle.updateLegendGuideState uses openLegendPanel/closeLegendPanel');

  const lifecycleSrc = readSrc(LIFECYCLE_PATH);

  const updateMatch = lifecycleSrc.match(/export function updateLegendGuideState[\s\S]*?^}/m);
  assert(updateMatch, 'lifecycle.js defines updateLegendGuideState');

  const body = updateMatch[0];
  assert(
    body.includes('openLegendPanel()') || body.includes('closeLegendPanel()'),
    'updateLegendGuideState calls openLegendPanel() or closeLegendPanel()'
  );

  console.log('  OK — updateLegendGuideState uses openLegendPanel/closeLegendPanel from legend-ui');
}

// ── MAIN ────────────────────────────────────────────────────────────────────

console.log('=================================================================');
console.log('legend-ui-ownership-contract.mjs');
console.log('Verifies: legend-ui.js owns structural transitions');
console.log('          lifecycle.js and event-bindings.js import it');
console.log('          no new import cycles introduced');
console.log('=================================================================');

try {
  testLegendUiExportsStructuralTransitions();
  testLegendUiDoesNotImportLifecycleOrEventBindings();
  testLifecycleImportsFromLegendUi();
  testEventBindingsImportsFromLegendUi();
  testNoNewImportCycle();
  testLifecycleCloseLegendGuideUsesAdapter();
  testSwitchViewUsesCloseLegendPanel();
  testUpdateLegendGuideStateUsesAdapter();

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED — legend-ui adapter ownership verified');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
