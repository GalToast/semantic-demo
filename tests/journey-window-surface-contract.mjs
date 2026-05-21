/**
 * journey-window-surface-contract.mjs
 *
 * Fast Node contract test for the journey/window surface boundary.
 * Protects extraction of journey-thread-model.js by verifying:
 *   1. Key window.* assignments resolve in source (journey.js shim block)
 *   2. Debug namespaces are documented (window._ti, window._ss)
 *   3. Delegated journey-thread-model functions are imported/re-exported
 *      through the expected chain
 *
 * Source-only — no DOM, no Playwright, no browser.
 * Runs in Node.
 *
 * Usage:
 *   node tests/journey-window-surface-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey.js');
const THREAD_INSPECTOR_PATH = path.join(SEMDEMO_ROOT, 'js/modules/thread-inspector.js');
const JOURNEY_THREAD_MODEL_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey-thread-model.js');
const SEARCH_STATE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/search-state.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(found, `${label}: expected source to contain "${needle}", but it was not found`);
}

function assertNotContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(!found, `${label}: source should NOT contain "${needle}", but it was found`);
}

// ---------------------------------------------------------------------------
// TEST 1: journey.js window shim block exists intact
// ---------------------------------------------------------------------------

function testJourneyWindowShim() {
  console.log('\n[TEST] journey.js window shim block intact');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // The shim block must exist as one contiguous block guarded by typeof window check
  assert(src.includes('window.syncFocusStage = syncFocusStage'), 'window.syncFocusStage in shim');
  assert(src.includes('window.setTrailFromSeed = setTrailFromSeed'), 'window.setTrailFromSeed in shim');
  assertNotContains(src, 'window.setSemanticDiveMode = setSemanticDiveMode', 'semantic-dive window owner stays in lifecycle');
  assert(src.includes('window.getSemanticThreadCandidates = getSemanticThreadCandidates'), 'window.getSemanticThreadCandidates in shim');
  assert(src.includes('window.getGeometricThreadCandidates = getGeometricThreadCandidates'), 'window.getGeometricThreadCandidates in shim');
  assert(src.includes('window.getThreadCandidatesForIndex = getThreadCandidatesForIndex'), 'window.getThreadCandidatesForIndex in shim');
  assert(src.includes('window.summarizeNeighborReason = summarizeNeighborReason'), 'window.summarizeNeighborReason in shim');
  assert(src.includes('window.setStrandContinuityState = setStrandContinuityState'), 'window.setStrandContinuityState in shim');
  assert(src.includes('window.renderThreadInspection = renderThreadInspection'), 'window.renderThreadInspection in shim');
  assert(src.includes('window.inspectThreadNeighbor = inspectThreadNeighbor'), 'window.inspectThreadNeighbor in shim');
  assert(src.includes('window.pinThreadNeighbor = pinThreadNeighbor'), 'window.pinThreadNeighbor in shim');
  assert(src.includes('window.unpinThreadInspection = unpinThreadInspection'), 'window.unpinThreadInspection in shim');
  assert(src.includes('window.clearThreadInspection = clearThreadInspection'), 'window.clearThreadInspection in shim');
  assert(src.includes('window.__semanticThreadInspectorProbe'), 'window.__semanticThreadInspectorProbe probe in shim');
  assert(src.includes('if (typeof window !== \'undefined\')'), 'typeof window guard present');

  console.log('  OK journey.js window shim block verified');
}

// ---------------------------------------------------------------------------
// TEST 2: thread-inspector debug namespace window._ti documented
// ---------------------------------------------------------------------------

function testThreadInspectorDebugNamespace() {
  console.log('\n[TEST] thread-inspector window._ti debug namespace');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  assert(src.includes('window._ti = {'), 'window._ti namespace exposed');
  assert(src.includes('getSemanticThreadCandidates,'), 'window._ti.getSemanticThreadCandidates');
  assert(src.includes('getGeometricThreadCandidates,'), 'window._ti.getGeometricThreadCandidates');
  assert(src.includes('getThreadCandidatesForIndex,'), 'window._ti.getThreadCandidatesForIndex');
  assert(src.includes('setStrandContinuityState,'), 'window._ti.setStrandContinuityState');
  assert(src.includes('clearStrandContinuityState,'), 'window._ti.clearStrandContinuityState');
  assert(src.includes('getStrandArrivalNote,'), 'window._ti.getStrandArrivalNote');
  assert(src.includes('getThreadInspectionState,'), 'window._ti.getThreadInspectionState');
  assert(src.includes('renderThreadInspection,'), 'window._ti.renderThreadInspection');
  assert(src.includes('inspectThreadNeighbor,'), 'window._ti.inspectThreadNeighbor');
  assert(src.includes('pinThreadNeighbor,'), 'window._ti.pinThreadNeighbor');
  assert(src.includes('unpinThreadInspection,'), 'window._ti.unpinThreadInspection');
  assert(src.includes('clearThreadInspection,'), 'window._ti.clearThreadInspection');
  assert(src.includes('exploreThreadNeighbor,'), 'window._ti.exploreThreadNeighbor');
  assert(src.includes('syncInspectedStrandOverlay,'), 'window._ti.syncInspectedStrandOverlay');
  assert(src.includes('updateInspectedStrandOverlay,'), 'window._ti.updateInspectedStrandOverlay');
  assert(src.includes('disposeInspectedStrandOverlay'), 'window._ti.disposeInspectedStrandOverlay');
  assert(src.includes('window.exploreThreadNeighbor = exploreThreadNeighbor'), 'window.exploreThreadNeighbor direct expose');

  console.log('  OK thread-inspector window._ti namespace verified');
}

// ---------------------------------------------------------------------------
// TEST 3: search-state debug namespace window._ss documented
// ---------------------------------------------------------------------------

function testSearchStateDebugNamespace() {
  console.log('\n[TEST] search-state window._ss debug namespace');

  const src = fs.readFileSync(SEARCH_STATE_PATH, 'utf-8');

  assert(src.includes('window._ss = {'), 'window._ss namespace exposed');
  assert(src.includes('tokenizeSearchText,'), 'window._ss.tokenizeSearchText');
  assert(src.includes('expandSearchIntent,'), 'window._ss.expandSearchIntent');
  assert(src.includes('countTokenMatches,'), 'window._ss.countTokenMatches');
  assert(src.includes('getSearchResultStrength,'), 'window._ss.getSearchResultStrength');
  assert(src.includes('setSearchPanelState,'), 'window._ss.setSearchPanelState');

  console.log('  OK search-state window._ss namespace verified');
}

// ---------------------------------------------------------------------------
// TEST 4: Delegated journey-thread-model chain intact
// ---------------------------------------------------------------------------

function testJourneyThreadModelChain() {
  console.log('\n[TEST] delegated journey-thread-model import/re-export chain');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');
  const threadInspectorSrc = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');
  const journeyModelSrc = fs.readFileSync(JOURNEY_THREAD_MODEL_PATH, 'utf-8');

  // journey-thread-model must export the core computation functions
  assert(journeyModelSrc.includes('export function normalizeLeadId'), 'journey-thread-model exports normalizeLeadId');
  assert(journeyModelSrc.includes('export function getSemanticThreadCandidates'), 'journey-thread-model exports getSemanticThreadCandidates');
  assert(journeyModelSrc.includes('export function getGeometricThreadCandidates'), 'journey-thread-model exports getGeometricThreadCandidates');
  assert(journeyModelSrc.includes('export function getThreadCandidatesForIndex'), 'journey-thread-model exports getThreadCandidatesForIndex');
  assert(journeyModelSrc.includes('export function getProjectedNeighborCandidates'), 'journey-thread-model exports getProjectedNeighborCandidates');
  assert(journeyModelSrc.includes('export function buildProjectedNeighborGrid'), 'journey-thread-model exports buildProjectedNeighborGrid');

  // journey.js must import from journey-thread-model.js
  assertContains(journeySrc, "from './journey-thread-model.js'", 'journey.js imports from journey-thread-model.js');

  // journey.js re-exports from journey-thread-model (export { ... } block at lines 30-38)
  // Each function name appears as a distinct token in the re-export block
  const reExportBlock = journeySrc.match(/export\s*\{[^}]+\}\s*;/);
  assert(reExportBlock, 'journey.js has re-export block from journey-thread-model');
  const reExportText = reExportBlock[0];
  assert(reExportText.includes('getSemanticThreadCandidates'), 'journey.js re-exports getSemanticThreadCandidates');
  assert(reExportText.includes('getGeometricThreadCandidates'), 'journey.js re-exports getGeometricThreadCandidates');
  assert(reExportText.includes('getThreadCandidatesForIndex'), 'journey.js re-exports getThreadCandidatesForIndex');

  // thread-inspector.js must NOT re-implement normalizeLeadId; it must use the shared version.
  assert(journeyModelSrc.includes('function normalizeLeadId'), 'journey-thread-model has canonical normalizeLeadId');
  assert(journeyModelSrc.includes('export function normalizeLeadId'), 'journey-thread-model normalizes exported normalizeLeadId');
  assertContains(threadInspectorSrc, "import { normalizeLeadId } from './journey-thread-model.js';", 'thread-inspector imports shared normalizeLeadId');
  assertNotContains(threadInspectorSrc, 'function normalizeLeadId(', 'thread-inspector does not define local normalizeLeadId');

  console.log('  OK journey-thread-model chain verified');
}

// ---------------------------------------------------------------------------
// TEST 5: setSemanticDiveMode inside-cue gate preserved
// ---------------------------------------------------------------------------

function testSetSemanticDiveModeGate() {
  console.log('\n[TEST] setSemanticDiveMode inside-cue preserveJourney gate');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  assert(src.includes("document.body.dataset.threadInspectSurface === 'inside-cue'"), 'inside-cue surface check present');
  assert(src.includes('clearThreadInspection({ force: true, preserveJourney: true })'), 'preserveJourney: true for inside-cue');
  assert(src.includes('clearThreadInspection({ force: true, preserveJourney: false })'), 'preserveJourney: false for other surfaces');

  console.log('  OK setSemanticDiveMode gate verified');
}

// ---------------------------------------------------------------------------
// TEST 6: No cross-module window.* leakage — journey owns journey window.*
// ---------------------------------------------------------------------------

function testNoCrossModuleLeakage() {
  console.log('\n[TEST] No cross-module window.* ownership leakage');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');
  const threadInspectorSrc = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');
  const journeyModelSrc = fs.readFileSync(JOURNEY_THREAD_MODEL_PATH, 'utf-8');

  // journey-thread-model must NOT expose anything on window
  assertNotContains(journeyModelSrc, 'window.', 'journey-thread-model: no window.* (pure module)');

  // thread-inspector must NOT own journey window shim entries
  // (it exposes window._ti and window.exploreThreadNeighbor — that's expected)
  // but it must NOT reassign journey's window functions
  const tiWindowAssignments = threadInspectorSrc.match(/window\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*;/g) || [];
  // window._ti is the debug namespace — allowed
  // window.exploreThreadNeighbor is the direct expose — allowed
  // Any other window.Foo = Foo should only be journey.js
  for (const assign of tiWindowAssignments) {
    if (assign.startsWith('window._ti') || assign.startsWith('window.exploreThreadNeighbor')) continue;
    // extract function name
    const match = assign.match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*/);
    if (match) {
      const fn = match[1];
      // These are the only two thread-inspector direct exposes — anything else is a leak
      assert(false, `thread-inspector.js leaks window ownership: ${fn}. Should only expose via window._ti or window.exploreThreadNeighbor`);
    }
  }

  console.log('  OK no cross-module window.* leakage verified');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('============================================================');
  console.log('journey-window-surface-contract.mjs');
  console.log('Contract test: journey/window surface boundary');
  console.log('============================================================');

  try {
    testJourneyWindowShim();
    testThreadInspectorDebugNamespace();
    testSearchStateDebugNamespace();
    testJourneyThreadModelChain();
    testSetSemanticDiveModeGate();
    testNoCrossModuleLeakage();

    console.log('\n============================================================');
    console.log('ALL TESTS PASSED');
    console.log('============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
}

main();
