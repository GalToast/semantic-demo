/**
 * journey-thread-inspector-contract.mjs
 *
 * Fast Node contract test for the journey + thread-inspector cluster.
 * Coverage:
 *   1. No ghost teardown references in journey.js and thread-inspector.js
 *   2. setSemanticDiveMode exit path guard (inside-cue surface gate)
 *   3. applyPointFilterColors brightness factor ranges
 *   4. buildRouteTraceMaterial returns ShaderMaterial with AdditiveBlending
 *   5. getCanvasNodePickingMode URL override (?picking=nearest)
 *   6. Thread-inspector dual candidates - semantic-first strategy
 *
 * Runs in Node - no Playwright, no browser, no DOM.
 * Source-only assertions via string search + structural analysis.
 *
 * Usage:
 *   node tests/journey-thread-inspector-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey.js');
const THREAD_INSPECTOR_PATH = path.join(SEMDEMO_ROOT, 'js/modules/thread-inspector.js');
const JOURNEY_THREAD_MODEL_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey-thread-model.js');
const JOURNEY_WEBGL_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey-webgl.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(found, `${label}: expected source to contain "${needle}", but it was not found`);
}

function assertNotContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(!found, `${label}: source should NOT contain "${needle}" (removed dead code), but it was found`);
}

// ---------------------------------------------------------------------------
// TEST 1: No ghost teardown references in journey.js and thread-inspector.js
// ---------------------------------------------------------------------------

function testNoGhostTeardownReferences() {
  console.log('\n[TEST] No ghost teardown references in journey.js and thread-inspector.js');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');
  const threadInspectorSrc = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  const ghostTerms = [
    'ghostTeardown', 'ghost-teardown', 'trailGhostTeardown', 'ghostStrandTeardown',
    '__ghost', 'disposeGhost', 'killGhost', 'ghostLineTeardown',
    'teardownGhost', 'ghostTrailTeardown', 'autoPin', 'auto-pin'
  ];

  for (const term of ghostTerms) {
    assertNotContains(journeySrc, term, 'journey.js');
    assertNotContains(threadInspectorSrc, term, 'thread-inspector.js');
  }

  // 'disqualified-ghosts' is a valid story name - must appear in story-prompt context only
  const tiGhostIdx = threadInspectorSrc.indexOf('disqualified-ghosts');
  assert(tiGhostIdx === -1, 'thread-inspector.js: "disqualified-ghosts" should not appear at all');

  console.log('  OK No ghost teardown references found');
}

// ---------------------------------------------------------------------------
// TEST 2: setSemanticDiveMode exit path guard
// ---------------------------------------------------------------------------

function testSemanticDiveModeExitPath() {
  console.log('\n[TEST] setSemanticDiveMode exit path guard');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // setSemanticDiveMode exit path must gate clearThreadInspection on surface === 'inside-cue'
  // for preserveJourney=true, and call clearThreadInspection with preserveJourney=false for other surfaces.
  // The new pattern uses: } else { if (surface === 'inside-cue') { preserveJourney:true } else { preserveJourney:false } }
  const insideCueIdx = journeySrc.indexOf('document.body.dataset.threadInspectSurface === \'inside-cue\'');
  assert(insideCueIdx !== -1, 'setSemanticDiveMode exit path checks threadInspectSurface === \'inside-cue\'');

  // clearThreadInspection with preserveJourney: true must exist for inside-cue path
  assertContains(journeySrc,
    'clearThreadInspection({ force: true, preserveJourney: true })',
    'inside-cue path calls clearThreadInspection with force + preserveJourney: true');

  // clearThreadInspection with preserveJourney: false must exist for non-inside-cue paths
  assertContains(journeySrc,
    'clearThreadInspection({ force: true, preserveJourney: false })',
    'non-inside-cue path calls clearThreadInspection with force + preserveJourney: false');

  // setSemanticDiveMode must not own the window bridge here; lifecycle owns it.
  assertNotContains(journeySrc, 'window.setSemanticDiveMode = setSemanticDiveMode', 'setSemanticDiveMode window bridge in journey');

  console.log('  OK setSemanticDiveMode exit path guard verified');
}

// ---------------------------------------------------------------------------
// TEST 3: applyPointFilterColors factor ranges
// ---------------------------------------------------------------------------

function testApplyPointFilterColorsFactorRanges() {
  console.log('\n[TEST] applyPointFilterColors brightness factor ranges');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // nodeMinFloor must be 0.65 (applied in pocket mode)
  assertContains(journeySrc, 'const nodeMinFloor = 0.65', 'nodeMinFloor = 0.65');
  assertContains(journeySrc, 'Math.max(raw, nodeMinFloor)', 'nodeMinFloor applied via Math.max');

  // Trail mode unvisited factor must be >= 0.08 (not invisible)
  assertContains(journeySrc, 'isVisited ? 1.18 : (semanticFocus ? 0.24 : 0.18)', 'trail mode unvisited factor >= 0.18');
  assertContains(journeySrc, 'isVisited ? 1.18 : 0.28', 'trail mode pre-trailIndices unvisited factor');

  // Pocket mode non-focusLocalIndices factor must be >= 0.22
  assertContains(journeySrc, 'isVisited ? 1.28 : (semanticFocus ? 0.32 : 0.22)', 'pocket mode non-focusLocal factor >= 0.22');

  // Bloom mode dimmed factor must be 0.08 (invisible)
  assertContains(journeySrc, 'visible ? 1 : 0.08', 'invisible factor is 0.08');

  // Focus anchor factor must be brightest (> 2.0)
  assertContains(journeySrc, 'i === state.navState.focusedIndex ? 2.14', 'focus anchor factor 2.14');

  console.log('  OK applyPointFilterColors factor ranges verified');
}

// ---------------------------------------------------------------------------
// TEST 4: buildRouteTraceMaterial returns ShaderMaterial with AdditiveBlending
// ---------------------------------------------------------------------------

function testBuildRouteTraceMaterial() {
  console.log('\n[TEST] buildRouteTraceMaterial shader material');

  const webglSrc = fs.readFileSync(JOURNEY_WEBGL_PATH, 'utf-8');

  // Must return THREE.ShaderMaterial
  assertContains(webglSrc, 'return new THREE.ShaderMaterial({', 'buildRouteTraceMaterial returns ShaderMaterial');

  // Must have depthWrite: false, depthTest: false
  assertContains(webglSrc, 'depthWrite: false', 'depthWrite: false in route trace material');
  assertContains(webglSrc, 'depthTest: false', 'depthTest: false in route trace material');

  // Must have AdditiveBlending
  assertContains(webglSrc, 'blending: THREE.AdditiveBlending', 'AdditiveBlending in route trace material');

  // Shader must declare time uniform for animation
  assertContains(webglSrc, 'uniform float time;', 'time uniform declared in fragment shader');

  // Must update time uniform in refreshRouteTraceOverlay
  assertContains(webglSrc, 'material.uniforms.time.value = now / 1000', 'time uniform updated in updateRouteTraceOverlayPositions');

  // Semantic dive mode must boost baseOpacity to 0.34
  assertContains(webglSrc, 'material.uniforms.baseOpacity.value = 0.34', 'semantic dive mode boosts baseOpacity to 0.34');
  assertContains(webglSrc, 'material.uniforms.opacity.value = 0.34', 'semantic dive mode boosts opacity to 0.34');

  console.log('  OK buildRouteTraceMaterial verified');
}

// ---------------------------------------------------------------------------
// TEST 5: getCanvasNodePickingMode URL override
// ---------------------------------------------------------------------------

function testGetCanvasNodePickingMode() {
  console.log('\n[TEST] getCanvasNodePickingMode URL override');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // Must read URL search params
  assertContains(journeySrc, 'new URLSearchParams(window.location.search)', 'URLSearchParams used for picking mode');

  // Must check ?picking= parameter
  assertContains(journeySrc, "get('picking')", 'get("picking") called on URLSearchParams');

  // Must return 'nearest' when urlMode === 'nearest'
  assertContains(journeySrc, "urlMode === 'nearest'", 'nearest URL mode check');
  assertContains(journeySrc, "return urlMode === 'nearest' || datasetMode === 'nearest' ? 'nearest' : 'raycast'", 'fallback to raycast');

  // Touch/pen must use 34px radius
  assertContains(journeySrc, "pointerType === 'touch' || pointerType === 'pen'", 'touch/pen pointer type check');
  assertContains(journeySrc, "return 34;", 'touch/pen returns 34px');
  assertContains(journeySrc, "window.matchMedia?.('(pointer: coarse)')?.matches ? 34 : 26", 'coarse pointer uses 34px else 26px');

  console.log('  OK getCanvasNodePickingMode URL override verified');
}

// ---------------------------------------------------------------------------
// TEST 6: Thread-inspector dual candidates - semantic-first strategy
// ---------------------------------------------------------------------------

function testThreadInspectorSemanticFirst() {
  console.log('\n[TEST] Thread-inspector dual candidates - semantic-first strategy');

  const threadInspectorSrc = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');
  const journeyModelSrc = fs.readFileSync(JOURNEY_THREAD_MODEL_PATH, 'utf-8');
  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // Both files must have getSemanticThreadCandidates
  assertContains(threadInspectorSrc, 'export function getSemanticThreadCandidates', 'thread-inspector exports getSemanticThreadCandidates');
  assertContains(journeyModelSrc, 'export function getSemanticThreadCandidates', 'journey-thread-model exports getSemanticThreadCandidates');

  // Both must have getThreadCandidatesForIndex
  assertContains(threadInspectorSrc, 'export function getThreadCandidatesForIndex', 'thread-inspector exports getThreadCandidatesForIndex');
  assertContains(journeyModelSrc, 'export function getThreadCandidatesForIndex', 'journey-thread-model exports getThreadCandidatesForIndex');

  // getThreadCandidatesForIndex must use semantic-first: return semantic if length > 0
  assertContains(threadInspectorSrc,
    'if (semanticCandidates.length) return semanticCandidates;',
    'thread-inspector: semantic-first strategy');
  assertContains(journeyModelSrc,
    'if (semanticCandidates.length) return semanticCandidates;',
    'journey-thread-model: semantic-first strategy');

  // journey.js must import from journey-thread-model.js, not thread-inspector.js
  assertContains(journeySrc, "from './journey-thread-model.js'", 'journey.js imports from journey-thread-model.js');

  // thread-inspector.js must use the shared normalizeLeadId to avoid lookup drift.
  assertContains(threadInspectorSrc, "import { normalizeLeadId } from './journey-thread-model.js';", 'thread-inspector imports shared normalizeLeadId');
  assertNotContains(threadInspectorSrc, 'function normalizeLeadId(', 'thread-inspector local normalizeLeadId removed');

  // thread-inspector.js must expose functions on window._ti
  assertContains(threadInspectorSrc, 'window._ti = {', 'window._ti exposed on thread-inspector');
  assertContains(threadInspectorSrc, 'getSemanticThreadCandidates,', 'window._ti.getSemanticThreadCandidates');
  assertContains(threadInspectorSrc, 'getGeometricThreadCandidates,', 'window._ti.getGeometricThreadCandidates');
  assertContains(threadInspectorSrc, 'getThreadCandidatesForIndex,', 'window._ti.getThreadCandidatesForIndex');
  assertContains(threadInspectorSrc, 'exploreThreadNeighbor', 'window._ti.exploreThreadNeighbor diagnostic access');

  // Journey imports normalizeLeadId from journey-thread-model
  const importBlockEnd = journeySrc.indexOf("} from './journey-thread-model.js'");
  const normalizeLeadIdNear = journeySrc.indexOf('normalizeLeadId,');
  assert(importBlockEnd !== -1, "journey-thread-model.js import block closing found");
  assert(normalizeLeadIdNear !== -1, 'normalizeLeadId, token found in journey.js');
  // normalizeLeadId must appear before the import block closes - part of the same import statement
  assert(normalizeLeadIdNear < importBlockEnd, 'normalizeLeadId is imported from journey-thread-model.js');

  console.log('  OK thread-inspector dual candidates strategy verified');
}

// ---------------------------------------------------------------------------
// TEST 9: Wave60 - exploreThreadNeighbor stranded phase='arrived' fix
// ---------------------------------------------------------------------------

function testWave60ExploreThreadNeighborSettleBehavior() {
  console.log('\n[TEST] Wave60: exploreThreadNeighbor stranded phase=arrived fix + followTargetsCurrent');

  const tiSrc = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  // exploreThreadNeighbor must clear existing arrivalTimeout before setting phase='exploring'
  assertContains(tiSrc,
    'if (Number.isFinite(state.strandContinuityState.arrivalTimeoutId))',
    'exploreThreadNeighbor clears existing arrivalTimeoutId');
  assertContains(tiSrc,
    'window.clearTimeout(state.strandContinuityState.arrivalTimeoutId)',
    'exploreThreadNeighbor calls clearTimeout on arrivalTimeoutId');
  assertContains(tiSrc,
    'state.strandContinuityState.arrivalTimeoutId = undefined',
    'exploreThreadNeighbor nulls arrivalTimeoutId after clear');

  // exploreThreadNeighbor must clear existing settleTimeout before setting phase='exploring'
  assertContains(tiSrc,
    'if (Number.isFinite(state.strandContinuityState.settleTimeoutId))',
    'exploreThreadNeighbor clears existing settleTimeoutId');
  assertContains(tiSrc,
    'window.clearTimeout(state.strandContinuityState.settleTimeoutId)',
    'exploreThreadNeighbor calls clearTimeout on settleTimeoutId');
  assertContains(tiSrc,
    'state.strandContinuityState.settleTimeoutId = undefined',
    'exploreThreadNeighbor nulls settleTimeoutId after clear');

  // Both clear-timeout blocks must appear BEFORE setStrandContinuityState('exploring'...)
  const arrivalClearIdx = tiSrc.indexOf('if (Number.isFinite(state.strandContinuityState.arrivalTimeoutId))');
  const settleClearIdx = tiSrc.indexOf('if (Number.isFinite(state.strandContinuityState.settleTimeoutId))');
  const exploringIdx = tiSrc.indexOf("setStrandContinuityState('exploring'");
  assert(arrivalClearIdx !== -1, 'arrivalTimeoutId clear block found');
  assert(settleClearIdx !== -1, 'settleTimeoutId clear block found');
  assert(exploringIdx !== -1, "setStrandContinuityState('exploring') found");
  assert(arrivalClearIdx < exploringIdx, 'arrivalTimeoutId clear appears before exploring phase');
  assert(settleClearIdx < exploringIdx, 'settleTimeoutId clear appears before exploring phase');

  // exploreThreadNeighbor must schedule a settle-timeout that transitions phase='arrived' -> 'idle'
  assertContains(tiSrc,
    "state.strandContinuityState.phase === 'arrived'",
    'settle-timeout checks phase === arrived');
  assertContains(tiSrc,
    "clearStrandContinuityState('arrival-settled')",
    'settle-timeout calls clearStrandContinuityState with arrival-settled');
  assertContains(tiSrc,
    'const settleDelay = options.settleDelay',
    'exploreThreadNeighbor computes settleDelay');
  assertContains(tiSrc,
    'const arrivalTid = window.setTimeout',
    'exploreThreadNeighbor captures arrival timeout id');
  assertContains(tiSrc,
    'state.strandContinuityState.arrivalTimeoutId = arrivalTid',
    'exploreThreadNeighbor stores arrival timeout id for cancellation');
  assertContains(tiSrc,
    'const settleTid = window.setTimeout',
    'exploreThreadNeighbor captures settle timeout id');
  assertContains(tiSrc,
    'state.strandContinuityState.settleTimeoutId = settleTid',
    'exploreThreadNeighbor stores settle timeout id for cancellation');

  // renderThreadInspection followBtn must guard on followTargetsCurrent
  assertContains(tiSrc, 'const followTargetsCurrent =', 'renderThreadInspection defines followTargetsCurrent');
  assertContains(tiSrc,
    'inspectionState.index === state.navState.focusedIndex',
    'followTargetsCurrent checks index === focusedIndex');
  assertContains(tiSrc,
    'followBtn.disabled = !inspectionState.active || followTargetsCurrent',
    'followTargetsCurrent disables followBtn');
  assertContains(tiSrc,
    "Current Stop",
    'followTargetsCurrent changes button text to Current Stop');

  console.log('  OK Wave60 exploreThreadNeighbor settle + followTargetsCurrent verified');
}

// ---------------------------------------------------------------------------
// TEST 7: journey-text-helpers extraction
// ---------------------------------------------------------------------------

function testJourneyTextHelpersExtraction() {
  console.log('\n[TEST] journey-text-helpers extraction');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');
  const jthSrc = fs.readFileSync(path.join(SEMDEMO_ROOT, 'js/modules/journey-text-helpers.js'), 'utf-8');

  // journey.js must import from journey-text-helpers.js
  assertContains(journeySrc, "from './journey-text-helpers.js'", 'journey.js imports journey-text-helpers');

  // journey.js must NOT contain inline truncateMicrocopy definition
  assertNotContains(journeySrc, 'function truncateMicrocopy(text, max = 74)', 'truncateMicrocopy inline removed');

  // journey.js must NOT contain inline getSharedTrailTopicLabel definition
  assertNotContains(journeySrc, 'function getSharedTrailTopicLabel(', 'getSharedTrailTopicLabel inline removed');

  // journey-text-helpers.js must export truncateMicrocopy
  assertContains(jthSrc, 'export function truncateMicrocopy', 'journey-text-helpers exports truncateMicrocopy');

  // journey-text-helpers.js must export getSharedTrailTopicLabel
  assertContains(jthSrc, 'export function getSharedTrailTopicLabel', 'journey-text-helpers exports getSharedTrailTopicLabel');

  // journey.js previously exported these helpers; the extraction must preserve that public surface.
  const textReExport = journeySrc.match(/export\s*\{[^}]*truncateMicrocopy[^}]*getSharedTrailTopicLabel[^}]*\}\s*;/s);
  assert(textReExport, 'journey.js re-exports journey-text-helpers public helpers');

  console.log('  OK journey-text-helpers extraction verified');
}

// ---------------------------------------------------------------------------
// TEST 8: thread-inspector-text-helpers extraction
// ---------------------------------------------------------------------------

function testThreadInspectorTextHelpersExtraction() {
  console.log('\n[TEST] thread-inspector-text-helpers extraction');

  const threadInspectorSrc = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');
  const helperSrc = fs.readFileSync(path.join(SEMDEMO_ROOT, 'js/modules/thread-inspector-text-helpers.js'), 'utf-8');

  assertContains(threadInspectorSrc, "from './thread-inspector-text-helpers.js'", 'thread-inspector imports text helpers');
  assertNotContains(threadInspectorSrc, 'function truncateMicrocopy(text, limit)', 'thread-inspector inline truncateMicrocopy removed');
  assertContains(helperSrc, 'export function truncateMicrocopy', 'thread-inspector-text-helpers exports truncateMicrocopy');
  assertNotContains(helperSrc, 'window.', 'thread-inspector-text-helpers has no window dependency');
  assertNotContains(helperSrc, 'state.', 'thread-inspector-text-helpers has no state dependency');
  assertNotContains(helperSrc, 'new THREE', 'thread-inspector-text-helpers has no THREE dependency');

  console.log('  OK thread-inspector-text-helpers extraction verified');
}

// ---------------------------------------------------------------------------
// TEST 10: journey WebGL line shader ownership
// ---------------------------------------------------------------------------

function testJourneyWebglLineShaderOwnership() {
  console.log('\n[TEST] journey WebGL line shader ownership');

  const webglSrc = fs.readFileSync(JOURNEY_WEBGL_PATH, 'utf-8');

  // Route trace uses a plain ShaderMaterial with direct uniforms. It should
  // not depend on LineMaterial's late onBeforeCompile userData.shader path.
  assertContains(webglSrc, 'function buildRouteTraceMaterial()', 'buildRouteTraceMaterial function exists');
  assertContains(webglSrc, 'return new THREE.ShaderMaterial({', 'route trace returns ShaderMaterial');
  assertContains(webglSrc, 'material.uniforms.time.value = now / 1000;', 'route trace updates direct uniforms');

  // Focus semantic lines use LineMaterial; onBeforeCompile must retain the
  // compiled shader handle for custom uniforms, and all update paths must guard it.
  assertContains(webglSrc, 'function buildFocusThreadLineMaterial()', 'buildFocusThreadLineMaterial function exists');
  assertContains(webglSrc, 'lineMaterial.onBeforeCompile((shader) => {', 'focus semantic line material uses onBeforeCompile');
  assertContains(webglSrc, 'lineMaterial.userData.shader = shader;', 'buildFocusThreadLineMaterial assigns shader to lineMaterial.userData.shader');
  assertContains(webglSrc, 'uniform float time;', 'shader declares time uniform');
  assertContains(webglSrc, 'uniform float semanticScore;', 'shader declares semanticScore uniform');
  assertContains(webglSrc, 'uniform float reducedMotion;', 'shader declares reducedMotion uniform');
  assertContains(webglSrc, 'varying float vProgress;', 'shader declares vProgress varying');
  assertContains(webglSrc, 'varying float vCue;', 'shader declares vCue varying');
  assertContains(webglSrc, 'varying float vPriority;', 'shader declares vPriority varying');
  assertContains(webglSrc, 'varying float vLane;', 'shader declares vLane varying');

  assertContains(webglSrc, 'if (lineMaterial.userData?.shader)', 'refreshFocusSemanticOverlay guards lineMaterial.userData?.shader');
  assertContains(webglSrc, 'lineMaterial.userData.shader.uniforms.semanticScore.value = avgSemanticScore', 'semanticScore uniform set via guarded access');
  assertContains(webglSrc, 'if (line.material?.userData?.shader)', 'updateFocusSemanticOverlayPositions guards line.material.userData.shader');
  assertContains(webglSrc, 'if (!reducedMotion && line.material?.uniforms?.time)', 'updateFocusSemanticOverlayPositions keeps direct-uniform fallback');

  console.log('  OK journey WebGL line shader ownership verified');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('============================================================');
  console.log('journey-thread-inspector-contract.mjs');
  console.log('Fast contract test: journey + thread-inspector cluster');
  console.log('============================================================');

  try {
    testNoGhostTeardownReferences();
    testSemanticDiveModeExitPath();
    testApplyPointFilterColorsFactorRanges();
    testBuildRouteTraceMaterial();
    testGetCanvasNodePickingMode();
    testThreadInspectorSemanticFirst();
    testJourneyTextHelpersExtraction();
    testThreadInspectorTextHelpersExtraction();
    testWave60ExploreThreadNeighborSettleBehavior();
    testJourneyWebglLineShaderOwnership();

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
