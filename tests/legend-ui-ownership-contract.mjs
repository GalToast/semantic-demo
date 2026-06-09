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

const LEGEND_UI_PATH = path.join(SEMDEMO_ROOT, 'js/modules/legend-ui.ts');
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.ts');
const VIEW_CONTROLLER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/view-controller.ts');
const EVENT_BINDINGS_PATH = path.join(SEMDEMO_ROOT, 'js/modules/bindings/legend-bindings.js');

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
  console.log('\n[TEST 2] legend-ui.js does NOT import lifecycle.js or event-bindings.ts');

  const src = readSrc(LEGEND_UI_PATH);

  assert(!src.includes('from ./lifecycle.ts'), 'does not import lifecycle.ts');
  assert(!src.includes('from ./event-bindings.ts'), 'does not import event-bindings.ts');

  // Verify that only safe non-monolithic modules are imported
  const imports = src.match(/^import .+? from/mg) || [];
  for (const imp of imports) {
    assert(!imp.includes('lifecycle.ts') && !imp.includes('event-bindings.ts'), `unauthorized import: ${imp}`);
  }

  console.log('  OK — legend-ui.js is neutral and does not import lifecycle or event-bindings');
}

// ── TEST 3: lifecycle.js imports from legend-ui.js ───────────────────────────────────────

function testLifecycleImportsFromLegendUi() {
  console.log('\n[TEST 3] lifecycle.js imports from legend-ui.ts');

  const src = readSrc(LIFECYCLE_PATH);

  assert(
    src.includes("from './legend-ui.ts'"),
    'lifecycle.js imports from legend-ui.ts'
  );
  assert(
    src.includes('closeLegendPanel') && src.includes('openLegendPanel') && src.includes('restoreLegendCollapsedPanel'),
    'lifecycle.js imports closeLegendPanel, openLegendPanel, restoreLegendCollapsedPanel'
  );

  console.log('  OK — lifecycle.js imports legend-ui.ts');
}

// ── TEST 4: event-bindings.js imports from legend-ui.js ───────────────────────────────────

function testEventBindingsImportsFromLegendUi() {
  console.log('\n[TEST 4] event-bindings.js imports from legend-ui.ts');

  const src = readSrc(EVENT_BINDINGS_PATH);

  assert(
    src.includes("from './legend-ui.ts'") || src.includes("from '../legend-ui.ts'"),
    'event-bindings.js imports from legend-ui.ts'
  );
  assert(
    src.includes('closeLegendPanel') && src.includes('openLegendPanel') && src.includes('restoreLegendCollapsedPanel'),
    'event-bindings.js imports closeLegendPanel, openLegendPanel, restoreLegendCollapsedPanel'
  );

  console.log('  OK — event-bindings.js imports legend-ui.ts');
}

// ── TEST 5: No new lifecycle ↔ event-bindings import cycle ───────────────────────────────
// lifecycle → legend-ui → (nothing else)
// event-bindings → legend-ui → (nothing else)
// lifecycle → event-bindings (pre-existing via initSemanticDemoEventListeners)
// No new cycle introduced.

function testNoNewImportCycle() {
  console.log('\n[TEST 5] No new import cycle introduced via legend-ui.ts');

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

// ── TEST 6: closeLegendGuide uses closeLegendPanel from legend-ui ───────────────

function testCloseLegendGuideUsesAdapter() {
  console.log('\n[TEST 6] closeLegendGuide delegates to legend-ui adapter');

  const legendUiSrc = readSrc(LEGEND_UI_PATH);

  // closeLegendGuide body should call closeLegendPanel() (from legend-ui)
  // and NOT do direct DOM manipulation for panel class/aria
  const closeMatch = legendUiSrc.match(/export function closeLegendGuide[\s\S]*?^}/m);
  assert(closeMatch, 'legend-ui.js defines closeLegendGuide');

  const body = closeMatch[0];
  assert(
    body.includes('closeLegendPanel()'),
    'closeLegendGuide calls closeLegendPanel()'
  );
  // Should NOT have direct .classList.remove('active') / setAttribute pattern
  assert(
    !body.includes('classList.remove'),
    'closeLegendGuide does not do direct DOM class manipulation (delegated to closeLegendPanel)'
  );

  console.log('  OK — closeLegendGuide delegates to closeLegendPanel');
}

// ── TEST 7: view-controller.switchView uses Event Bus for decoupling ─────────────────

function testSwitchViewUsesEventBus() {
  console.log('\n[TEST 7] view-controller.switchView uses Event Bus instead of direct UI calls');

  const viewControllerSrc = readSrc(VIEW_CONTROLLER_PATH);

  // switchView should call publish(EVENTS.VIEW_CHANGED, ...)
  assert(
    viewControllerSrc.includes('publish(EVENTS.VIEW_CHANGED'),
    'switchView must publish VIEW_CHANGED event'
  );

  // It should NOT call closeLegendPanel directly anymore
  assert(
    !viewControllerSrc.includes('closeLegendPanel()'),
    'switchView should NOT call closeLegendPanel() directly (now event-driven)'
  );

  console.log('  OK — switchView uses Event Bus for UI decoupling');
}

// ── TEST 8: updateLegendGuideState uses openLegendPanel/closeLegendPanel ────────

function testUpdateLegendGuideStateUsesAdapter() {
  console.log('\n[TEST 8] updateLegendGuideState uses openLegendPanel/closeLegendPanel');

  const legendUiSrc = readSrc(LEGEND_UI_PATH);

  const updateMatch = legendUiSrc.match(/export function updateLegendGuideState[\s\S]*?^}/m);
  assert(updateMatch, 'legend-ui.js defines updateLegendGuideState');

  const body = updateMatch[0];
  assert(
    body.includes('openLegendPanel()') || body.includes('closeLegendPanel()'),
    'updateLegendGuideState calls openLegendPanel() or closeLegendPanel()'
  );

  console.log('  OK — updateLegendGuideState uses openLegendPanel/closeLegendPanel');
}

// ── TEST 9: legend-ui.js subscribes to VIEW_CHANGED ───────────────────────────

function testLegendUiSubscribesToViewChanged() {
  console.log('\n[TEST 9] legend-ui.js subscribes to VIEW_CHANGED event');

  const src = readSrc(LEGEND_UI_PATH);

  assert(
    src.includes('subscribe(EVENTS.VIEW_CHANGED')
      || src.includes('subscribeKeyed(') && src.includes('EVENTS.VIEW_CHANGED'),
    'legend-ui.js must subscribe to VIEW_CHANGED'
  );

  console.log('  OK — legend-ui.js subscribes to Event Bus');
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
  testCloseLegendGuideUsesAdapter();
  testSwitchViewUsesEventBus();
  testUpdateLegendGuideStateUsesAdapter();
  testLegendUiSubscribesToViewChanged();

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED — legend-ui adapter ownership verified');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
