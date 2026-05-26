/**
 * lifecycle-semantic-guide-residual-bridge-contract.mjs
 *
 * Documents and guards the residual window bridge between lifecycle.js
 * and the legend/semantic-guide seam:
 *
 *   Bridge A: window.updateLegendGuideState() — lifecycle-owned, self-call
 *   Retired: window.restoreLegendCollapsedPanel() — owned by legend-ui.js and
 *            reached through direct imports.
 *
 * Design:
 *   - Documents intentional residual bridges without failing on them
 *   - Verifies direct-import ownership for extracted legend panel structure
 *   - Guards against introducing a direct import cycle between
 *     lifecycle.js and event-bindings.js (which already imports lifecycle)
 *
 * Runs in Node. No Playwright, no live network.
 *
 * Usage:
 *   node tests/lifecycle-semantic-guide-residual-bridge-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());

const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js');
const VIEW_CONTROLLER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/view-controller.js');
const EVENT_BINDINGS_PATH = path.join(SEMDEMO_ROOT, 'js/modules/event-bindings.js');
const SEMANTIC_GUIDE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/semantic-guide.js');
const LEGEND_UI_PATH = path.join(SEMDEMO_ROOT, 'js/modules/legend-ui.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ── Read sources ────────────────────────────────────────────────────────────

function readSrc(p) {
  return fs.readFileSync(p, 'utf-8');
}

// ── TEST 1: updateLegendGuideState is defined in legend-ui.js, not semantic-guide.js ──

function testUpdateLegendGuideStateOwner() {
  console.log('\n[TEST 1] updateLegendGuideState — owned by legend-ui.js, not semantic-guide.js');

  const lifecycleSrc = readSrc(LIFECYCLE_PATH);
  const semanticGuideSrc = readSrc(SEMANTIC_GUIDE_PATH);
  const viewControllerSrc = readSrc(VIEW_CONTROLLER_PATH);
  const legendUiSrc = readSrc(LEGEND_UI_PATH);

  // legend-ui.js must define (export) updateLegendGuideState
  assert(
    legendUiSrc.includes('export function updateLegendGuideState'),
    'legend-ui.js must export updateLegendGuideState'
  );

  // semantic-guide.js must NOT define updateLegendGuideState
  assert(
    !semanticGuideSrc.includes('function updateLegendGuideState') &&
    !semanticGuideSrc.includes('export function updateLegendGuideState'),
    'semantic-guide.js must NOT define updateLegendGuideState'
  );

  // legend-ui.js must expose it to window
  assert(
    legendUiSrc.includes('window.updateLegendGuideState = updateLegendGuideState'),
    'legend-ui.js exports updateLegendGuideState to window (compatibility bridge)'
  );

  // The call site in view-controller.switchView must be typeof-guarded
  assert(
    viewControllerSrc.includes('typeof window.updateLegendGuideState === \'function\'') ||
    viewControllerSrc.includes('typeof window.updateLegendGuideState === "function"'),
    'view-controller.switchView calls updateLegendGuideState with typeof guard'
  );

  console.log('  OK — updateLegendGuideState: legend-ui-owned, semantic-guide.js NOT owner');
}

// ── TEST 2: restoreLegendCollapsedPanel is owned by legend-ui.js ──

function testRestoreLegendCollapsedPanelOwner() {
  console.log('\n[TEST 2] restoreLegendCollapsedPanel — owned by legend-ui.js');

  const eventBindingsSrc = readSrc(EVENT_BINDINGS_PATH);
  const legendUiSrc = readSrc(LEGEND_UI_PATH);

  assert(
    legendUiSrc.includes('export function restoreLegendCollapsedPanel'),
    'legend-ui.js must export restoreLegendCollapsedPanel'
  );
  assert(
    !legendUiSrc.includes('window.restoreLegendCollapsedPanel'),
    'legend-ui.js must not keep the retired window.restoreLegendCollapsedPanel export'
  );
  assert(
    !eventBindingsSrc.includes('window.restoreLegendCollapsedPanel = restoreLegendCollapsedPanel'),
    'event-bindings.js must not own the restoreLegendCollapsedPanel window export'
  );

  const closeLegendGuideMatch = legendUiSrc.match(/export function closeLegendGuide[\s\S]*?^}/m);
  assert(closeLegendGuideMatch, 'legend-ui.js must define closeLegendGuide');

  const closeLegendGuideBody = closeLegendGuideMatch[0];
  assert(
    closeLegendGuideBody.includes('restoreLegendCollapsedPanel(infoPanel, panelBtn)'),
    'legend-ui.closeLegendGuide calls restoreLegendCollapsedPanel locally'
  );
  assert(
    !closeLegendGuideBody.includes('window.restoreLegendCollapsedPanel'),
    'legend-ui.closeLegendGuide must not call the legacy window bridge'
  );

  console.log('  OK — restoreLegendCollapsedPanel: legend-ui-owned, used locally in closeLegendGuide');
}

// ── TEST 3: No NEW direct lifecycle → event-bindings import cycle introduced ──
// Note: lifecycle.js already imports initEventListeners from event-bindings.js (line 18).
// event-bindings.js already imports from lifecycle.js. The bidirectional cycle pre-exists.
// Adding a direct lifecycle → legend-ui import is safe because legend-ui is import-free.

function testNoNewLifecycleEventBindingsImportCycle() {
  console.log('\n[TEST 3] No NEW lifecycle → event-bindings import cycle introduced');

  const lifecycleSrc = readSrc(LIFECYCLE_PATH);

  const directRestoreImport = lifecycleSrc.match(/import.*restoreLegendCollapsedPanel.*from.*event/);
  assert(
    !directRestoreImport,
    'lifecycle.js must NOT import restoreLegendCollapsedPanel from event-bindings.js'
  );

  console.log('  OK — no new direct import of restoreLegendCollapsedPanel from event-bindings.js');
  console.log('       Note: lifecycle→event-bindings cycle pre-exists via initSemanticDemoEventListeners import');
}

// ── TEST 4: lifecycle does NOT import updateLegendGuideState from semantic-guide.js ──
// Note: lifecycle.js DOES import from semantic-guide.js (setSemanticGuideButtonState,
// showSummaryCard, hideSummaryCard, requestSemanticGuide, semanticGuideIcon,
// getSemanticGuideTitle). That import is intentional re-export/compatibility.
// What this test guards: lifecycle must NOT import updateLegendGuideState specifically
// from semantic-guide, because legend-ui.js OWNS that function.

function testLifecycleDoesNotImportUpdateLegendGuideStateFromSemanticGuide() {
  console.log('\n[TEST 4] lifecycle does NOT import updateLegendGuideState from semantic-guide');

  const lifecycleSrc = readSrc(LIFECYCLE_PATH);

  // Check that lifecycle imports from semantic-guide — it does for other functions
  const hasSemanticGuideImport = lifecycleSrc.includes("from './semantic-guide.js'");
  assert(hasSemanticGuideImport, 'lifecycle.js does import from semantic-guide.js (re-exports)');

  // But lifecycle must NOT import updateLegendGuideState from semantic-guide
  const importDeclarations = lifecycleSrc.match(/^import[\s\S]*?;$/gm) || [];
  const badImport = importDeclarations.some((declaration) =>
    declaration.includes("from './semantic-guide.js'") &&
    declaration.includes('updateLegendGuideState')
  );
  assert(!badImport, 'lifecycle must NOT import updateLegendGuideState from semantic-guide.js (legend-ui.js owns it)');

  console.log('  OK — lifecycle imports semantic-guide functions but NOT updateLegendGuideState');
}

// ── TEST 5: closeLegendGuide is legend-ui-owned and exports to window ──

function testCloseLegendGuideOwnership() {
  console.log('\n[TEST 5] closeLegendGuide — owned by legend-ui.js, exported to window');

  const legendUiSrc = readSrc(LEGEND_UI_PATH);
  const lifecycleSrc = readSrc(LIFECYCLE_PATH);

  // closeLegendGuide must be exported from legend-ui
  assert(
    legendUiSrc.includes('export function closeLegendGuide'),
    'legend-ui.js must export closeLegendGuide'
  );

  // closeLegendGuide must be exported to window
  assert(
    legendUiSrc.includes('window.closeLegendGuide = closeLegendGuide'),
    'legend-ui.js exports closeLegendGuide to window (compatibility bridge)'
  );

  // lifecycle.js re-exports it
  assert(
    lifecycleSrc.includes('closeLegendGuide') && (lifecycleSrc.includes("from './legend-ui.js'") || lifecycleSrc.includes('from "./legend-ui.js"')),
    'lifecycle.js re-exports closeLegendGuide for compatibility'
  );

  console.log('  OK — closeLegendGuide: legend-ui-owned, window bridge for bootstrap compat');
}

// ── MAIN ────────────────────────────────────────────────────────────────────

console.log('=================================================================');
console.log('lifecycle-semantic-guide-residual-bridge-contract.mjs');
console.log('Documents: lifecycle owns updateLegendGuideState, closeLegendGuide');
console.log('          legend-ui owns restoreLegendCollapsedPanel');
console.log('          restoreLegendCollapsedPanel bridge is retired');
console.log('=================================================================');

try {
  testUpdateLegendGuideStateOwner();
  testRestoreLegendCollapsedPanelOwner();
  testNoNewLifecycleEventBindingsImportCycle();
  testLifecycleDoesNotImportUpdateLegendGuideStateFromSemanticGuide();
  testCloseLegendGuideOwnership();

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED — residual bridge state documented and guarded');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
