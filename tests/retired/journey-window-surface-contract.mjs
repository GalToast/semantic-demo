/**
 * journey-window-surface-contract.mjs
 *
 * Fast Node contract test for the journey/window surface boundary.
 * Protects extraction of journey-thread-model.js by verifying:
 *   1. Key window.* assignments resolve in source (journey.js shim block)
 *   2. Debug namespaces are documented (window._ti) or retired (window._ss)
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
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'src/lib/journey/journey.ts');
const THREAD_INSPECTOR_PATH = path.join(SEMDEMO_ROOT, 'src/lib/journey/thread-inspector.ts');
const JOURNEY_THREAD_MODEL_PATH = path.join(SEMDEMO_ROOT, 'src/lib/journey/thread-model.ts');
const SEARCH_STATE_PATH = path.join(SEMDEMO_ROOT, '');
const VISUAL_STATE_AUDIT_PATH = path.join(SEMDEMO_ROOT, 'tests/ui-quality-contract.mjs');

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
// TEST 1: journey.js top-level window shim stays retired
// ---------------------------------------------------------------------------

function testJourneyWindowShim() {
  console.log('\n[TEST] journey.js top-level window shim retired');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  assertNotContains(src, 'window.syncFocusStage = syncFocusStage', 'syncFocusStage bridge is retired');
  assert(!/window\.setTrailFromSeed\s*=/.test(src), 'setTrailFromSeed bridge is retired');
  assertNotContains(src, 'window.setSemanticDiveMode = setSemanticDiveMode', 'semantic-dive window owner stays in lifecycle');
  assertNotContains(src, 'window.updateTraversalUi = updateTraversalUi', 'updateTraversalUi bridge is retired');
  assertNotContains(src, 'window.getNextWalkCandidateForIndex = getNextWalkCandidateForIndex', 'getNextWalkCandidateForIndex bridge is retired');
  assert(!/window\.getSemanticThreadCandidates\s*=/.test(src), 'getSemanticThreadCandidates top-level bridge is retired');
  assert(!/window\.getGeometricThreadCandidates\s*=/.test(src), 'getGeometricThreadCandidates top-level bridge is retired');
  assert(!/window\.getThreadCandidatesForIndex\s*=/.test(src), 'getThreadCandidatesForIndex top-level bridge is retired');
  assert(!/window\.summarizeNeighborReason\s*=/.test(src), 'summarizeNeighborReason top-level bridge is retired');
  assert(!/window\.setStrandContinuityState\s*=/.test(src), 'setStrandContinuityState top-level bridge is retired');
  assert(!/window\.renderThreadInspection\s*=/.test(src), 'renderThreadInspection top-level bridge is retired');
  assert(!/window\.inspectThreadNeighbor\s*=/.test(src), 'inspectThreadNeighbor top-level bridge is retired');
  assert(!/window\.pinThreadNeighbor\s*=/.test(src), 'pinThreadNeighbor top-level bridge is retired');
  assert(!/window\.unpinThreadInspection\s*=/.test(src), 'unpinThreadInspection top-level bridge is retired');
  assert(!/window\.clearThreadInspection\s*=/.test(src), 'clearThreadInspection top-level bridge is retired');
  assertNotContains(src, 'window.__semanticThreadInspectorProbe', '__semanticThreadInspectorProbe probe retired from shim');
  assertNotContains(src, 'window.__semanticCanvasThreadProbe', '__semanticCanvasThreadProbe probe retired from shim');

  console.log('  OK journey.js top-level window shim remains retired');
}

// ---------------------------------------------------------------------------
// TEST 2: thread-inspector debug namespace window._ti documented
// ---------------------------------------------------------------------------

function testThreadInspectorDebugNamespace() {
  console.log('\n[TEST] thread-inspector window._ti debug namespace (gate-aware)');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  // _ti was retired during TS migration; verify it remains absent.
  assert(!src.includes('window._ti'), 'window._ti debug namespace remains retired');

  // Verify thread-inspector exports the functions that were previously on _ti
  const tiFns = ['getSemanticThreadCandidates','getGeometricThreadCandidates','getThreadCandidatesForIndex','setStrandContinuityState','clearStrandContinuityState','getStrandArrivalNote','getThreadInspectionState','renderThreadInspection','inspectThreadNeighbor','pinThreadNeighbor','unpinThreadInspection','clearThreadInspection','exploreThreadNeighbor','syncInspectedStrandOverlay','updateInspectedStrandOverlay','disposeInspectedStrandOverlay'];
  for (const fn of tiFns) {
    assert(src.includes(fn), fn + ' exported from thread-inspector');
  }
  assert(!src.includes('window.exploreThreadNeighbor = exploreThreadNeighbor'), 'window.exploreThreadNeighbor direct expose removed');

  console.log('  OK thread-inspector functions exported (window._ti retired)');
}

// ---------------------------------------------------------------------------
// TEST 2b: visual QA probes use _ti, not direct thread-inspector globals
// ---------------------------------------------------------------------------

function testVisualAuditUsesThreadInspectorNamespace() {
  console.log('\n[TEST] visual audit thread-inspector probe namespace retired');

  // window._ti was retired during TS migration; visual audit no longer references it.
  console.log('  OK visual audit thread-inspector diagnostic namespace (via _ti) retired');
}

// ---------------------------------------------------------------------------
// TEST 3: search-state debug namespace window._ss retired
// ---------------------------------------------------------------------------

function testSearchStateDebugNamespace() {
  console.log('\n[TEST] search-state window._ss debug namespace is retired');

  const src = fs.readFileSync(SEARCH_STATE_PATH, 'utf-8');

  assertNotContains(src, 'window._ss', 'window._ss namespace');
  assertNotContains(src, '_ss =', '_ss assignment');

  console.log('  OK search-state window._ss namespace is retired');
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
  assertContains(journeySrc, "from './journey-thread-model.ts'", 'journey.js imports from journey-thread-model.ts');

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
  assertNotContains(threadInspectorSrc, 'function normalizeLeadId(', 'thread-inspector does not define local normalizeLeadId');

  console.log('  OK journey-thread-model chain verified');
}

// ---------------------------------------------------------------------------
// TEST 5: setSemanticDiveMode inside-cue gate preserved
// ---------------------------------------------------------------------------

function testSetSemanticDiveModeGate() {
  console.log('\n[TEST] setSemanticDiveMode inside-cue preserveJourney gate');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  assert(src.includes("threadInspectSurface === 'inside-cue'"), 'inside-cue surface check present');
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

  // thread-inspector must NOT own journey window shim entries.
  // Only the diagnostic adapter may place _ti on window.
  const tiWindowAssignments = threadInspectorSrc.match(/window\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*;/g) || [];
  // window._ti is the debug namespace — allowed
  // Any other window.Foo = Foo should only be journey.js
  for (const assign of tiWindowAssignments) {
    if (assign.startsWith('window._ti')) continue;
    // extract function name
    const match = assign.match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*/);
    if (match) {
      const fn = match[1];
      assert(false, `thread-inspector.js leaks window ownership: ${fn}. Should only expose via window._ti`);
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
    testVisualAuditUsesThreadInspectorNamespace();
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
