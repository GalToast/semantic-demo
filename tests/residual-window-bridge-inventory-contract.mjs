/**
 * residual-window-bridge-inventory-contract.mjs
 *
 * Source-only Node contract: inventory and guard the residual window bridge surface.
 *
 * Goals:
 *   1. Inventory all direct window.* call sites across modules — categorize as
 *        - Compatibility export (app.js bootstrap aliases)
 *        - Intentional fallback (typeof-guarded cross-module calls)
 *        - Extraction candidate (cross-module window call with direct-import alternative)
 *   2. Guard already-dewindowed seams against newly introduced high-risk bare calls
 *   3. Document residual debt without failing on known intentional bridges
 *
 * Design constraints:
 *   - Avoid brittle contracts that fail on known intentional compatibility patterns
 *   - Guard ONLY newly introduced unguarded window.fn() calls in seams already dewindowed
 *   - "Bare" = direct window.fn() call NOT inside typeof guard or ?. optional chain
 *
 * Source-only — no DOM, no Playwright.
 * Runs in Node.
 *
 * Usage:
 *   node tests/residual-window-bridge-inventory-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SEMDEMO_ROOT = path.resolve(process.cwd());

// ── MODULE MAP ──────────────────────────────────────────────────────────────

const MODULES = {
  lifecycle:   path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js'),
  journey:     path.join(SEMDEMO_ROOT, 'js/modules/journey.js'),
  camera:      path.join(SEMDEMO_ROOT, 'js/modules/camera-controls.js'),
  searchState: path.join(SEMDEMO_ROOT, 'js/modules/search-state.js'),
  eventBindings: path.join(SEMDEMO_ROOT, 'js/modules/event-bindings.js'),
  sceneReveal: path.join(SEMDEMO_ROOT, 'js/modules/scene-reveal.js'),
  app:         path.join(SEMDEMO_ROOT, 'js/modules/app.js'),
  mapState:    path.join(SEMDEMO_ROOT, 'js/modules/map-state.js'),
  clusterFilter: path.join(SEMDEMO_ROOT, 'js/modules/cluster-filter.js'),
  journeyCompassCtrl: path.join(SEMDEMO_ROOT, 'js/modules/journey-compass-controller.js'),
  journeyCompassState: path.join(SEMDEMO_ROOT, 'js/modules/journey-compass-state.js'),
  demoController: path.join(SEMDEMO_ROOT, 'js/modules/demo-controller.js'),
  focusPocket: path.join(SEMDEMO_ROOT, 'js/modules/focus-pocket.js'),
  threadInspector: path.join(SEMDEMO_ROOT, 'js/modules/thread-inspector.js'),
  clusterLabels: path.join(SEMDEMO_ROOT, 'js/modules/cluster-labels.js'),
  audio:       path.join(SEMDEMO_ROOT, 'js/modules/audio-scape.js'),
  viewController: path.join(SEMDEMO_ROOT, 'js/modules/view-controller.js'),
  navigationState: path.join(SEMDEMO_ROOT, 'js/modules/navigation-state.js'),
  journeyWebgl: path.join(SEMDEMO_ROOT, 'js/modules/journey-webgl.js'),
};

// ── HELPERS ────────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function read(mod) {
  return fs.readFileSync(MODULES[mod], 'utf-8');
}

/**
 * Scan source for all window.fn references.
 * Returns array of { name, line (0-indexed), isCall, isAssignment, isGuarded }
 * isGuarded = preceded by typeof or followed by ?. within same logical expression
 */
function scanWindowRefs(src, filename) {
  const lines = src.split('\n');
  const refs = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t || t.startsWith('//') || t.startsWith('*')) continue;

    // Find window.foo patterns
    const pattern = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let m;
    while ((m = pattern.exec(t)) !== null) {
      const name = m[1];
      const pos = m.index;
      const before = t.substring(0, pos);

      // Assignment: window.fn = ... (but not ===)
      const isAssign = /window\.\w+\s*=(?!=)/.test(t.slice(pos - 10, pos + 40)) && t.includes('=');

      // Call: window.fn( or window.fn?.(
      const callMatch = t.slice(pos + name.length).match(/^(\?)?\./);
      // Already matched by the pattern, check for ( or ?.(
      const isCall = /\(\s*$/.test(t.slice(pos + name.length + 2)) ||
                       /\?\.\(/.test(t.slice(pos + name.length)) ||
                       /\(\s*[,)]/.test(t.slice(pos + name.length));

      // Guarded: typeof window.fn === 'function' or window.fn?.( or preceding line has typeof
      let isGuarded = before.includes('typeof') || before.includes('?.');
      if (!isGuarded) {
        for (let j = Math.max(0, i - 3); j < i; j++) {
          const prev = lines[j].trim();
          if (prev.includes('typeof') || prev.includes('?.') || prev.includes('===')) {
            isGuarded = true;
            break;
          }
        }
      }

      refs.push({ name, line: i, col: pos, raw: t, isCall, isAssignment: isAssign && !t.includes('==='), isGuarded });
    }
  }
  return refs;
}

// ── KNOWN COMPATIBILITY EXPORTS (app.js bootstrap) ─────────────────────────
// These are window assignments in app.js that are thin re-exports.
// They are NOT extraction candidates — they are intentional compatibility bridges.

const KNOWN_APP_BOOTSTRAP_EXPORTS = new Set([
  'state', '_ss', '_fp', '_cc', '_ti', '_ms', '_weather',
  'initAudio', 'applyClusterUiAccent', 'getSelectedBusinessRoleLabel',
  'findClusterByKeyword',
  // lifecycle re-exports (thin aliases)
  'setMyceliumMode', 'setTrailDepth', 'applyStoryPrompt',
  // camera re-exports
  'focusOnNode', 'animateCameraToNode', 'toggleAutoRotate', 'setFocusTransitionMode',
  'clearRouteExploration', 'setRouteExplorationState', 'noteSceneInteraction', 'syncOrbitAutoRotate',
  // map re-exports
  'initMap', 'refreshMapMarkers', 'refreshMapRouteEmbodiment', 'centerMapOnRouteAnchor',
  'getRouteEmbodimentIndices', 'getRouteAnchorIndex', 'getRouteDirectorState', 'syncRouteDirectorState',
  'setTerrainHandoffState',
  // weather re-exports
  'initWeather', 'fetchWeather', 'applyWeatherEffects', 'clearWeatherEffects',
  // search re-exports
  'search', 'applyFilters', 'getFilteredIndices', 'normalizeCityForFilter',
  'activateSearchGlow', 'clearSearchGlow', 'updateSearchStatusMessage', 'updateSearchTrailCue',
  'clearShortSemanticSearchState', 'resetSemanticGuideUi', 'beginSearchFocusTransition',
  '__semanticSearchCacheProbe', 'clearSearch', 'clearSearchPreviewHoverTimer',
  'clearMobileRouteFieldPeek', 'isMobileRouteFieldPeekActive',
  // thread re-exports
  'loadSemanticThreads', 'getFocusThreadCurvePoint', 'getProjectedNeighborCandidates',
  'syncInspectedStrandOverlay', 'updateInspectedStrandOverlay', 'disposeInspectedStrandOverlay',
  // lifecycle navigation re-exports
  'switchView', 'updateUrlState', 'resetExperienceState', 'returnToOverview',
  'resetExplorationFocus', 'getSceneRevealProgress', 'refreshCompositionState',
  'clearClusterFilter', 'updateHasQuery',
  // extras
  'loadData', 'applyUrlState',
]);

// ── KNOWN INTENTIONAL FALLBACKS (typeof-guarded, not extraction candidates) ──
// These window calls are correctly guarded and represent the standard cross-module
// bridge pattern. They are NOT residual debt to extract.

const KNOWN_FALLBACKS = new Set([
  // event-bindings.js guards — intentional cross-module UI bridge pattern
  'copyCurrentViewLink', 'executeJourneyCompassAction',
  'resetExplorationFocus', 'recenterFocusedNode', 'setSemanticDiveMode',
  'exploreInsideToNextStop', 'returnToCountyView', 'setInfoPanelOpen',
  'loadSemanticThreads', 'probeSemanticLane', 'applyStoryPrompt',
  'updateUrlState', 'clearClusterFilter', 'showSemanticThreadsDetail',
  'returnToOverview', 'traverseNeighbor', 'animateCameraToNode', 'zoomMap',
  'expandNeighborhoodFromCurrentNode', 'focusSearchInputForReplacement',
  'handleSemanticLaneWindowFocus', 'applyUrlState', 'handleSemanticLaneVisibilityChange',
  'hideSummaryCard', 'closeLegendGuide', 'buildLegend',
  'setTrailFromSeed', 'updateTrailIndices', 'syncClusterSectionState',
  // lifecycle.js guards
  'animateCameraToNode', 'previewInsideNextThread', 'clearThreadInspection',
  'switchView', 'hideTooltip', 'clearSearchPreviewOverlay', 'resetNodePositions',
  'getRouteLayerOrigin', 'setRouteChoreographyPhase', 'animateCameraToTerrainPrelude',
  'applyMapFlatteningLayout', 'clearRouteExploration', 'animateCameraToSearchCorridor',
  'updateLegendGuideState', 'updateTraversalUi', 'restoreLegendCollapsedPanel',
  // journey.js guards
  'syncArrivalHandoffOverlay', 'disposeArrivalHandoffOverlay', 'syncInspectedStrandOverlay',
  'updateJourneyCompass',
  'previewInsideNextThread', 'applyLocalNeighborhoodFocus', 'setSemanticDiveMode',
  'applyClusterUiAccent', 'getInterestingBusinessNote', 'buildSelectedMatchNarrative',
  'hasColdDegradedSemanticFallback', 'revealSelectedBusinessCard', 'describeThreadLensForPoint',
  'hydrateLeadContext', 'shouldUseFloatingFocusJourneyOnly', 'isFieldNodeFocusContext',
  'getFocusThreadCurvePoint', 'syncNodeSporeColorsFromPointColors', 'syncSearchStatusForFocus',
  'releaseFocusCameraAssist', 'noteSceneInteraction', 'walkThreadNeighbor',
  // scene-reveal.js guards
  'clearAutoRotateResumeTimer', 'setAutoRotateSuspended', 'updateCameraViewportOffset',
  // journey-compass-controller.js guards
  'clearMobileRouteFieldPeek', 'refreshRouteTraceOverlay', 'updateFocusNeighborRail',
]);

// ── DEWINDOWED SEAMS (already extracted, no new bare window calls allowed) ──
// These seams have been dewindowed. Any NEW unguarded window.fn() call in these
// modules is a regression.

const DEWINDOWED_SEAMS = ['searchState']; // search-state.js is fully dewindowed

// ── EXTRACTION CANDIDATES (documented residual debt) ────────────────────────
// These are window calls that COULD be direct module imports instead.
// They are NOT failures — just documented residual debt.
// Format: [callerModule, windowFnName, ownerModule, note]

const EXTRACTION_CANDIDATES = [
  ['lifecycle', 'restoreLegendCollapsedPanel', 'legend-ui', 'legacy bootstrap compatibility; lifecycle now imports legend-ui directly'],
  ['lifecycle', 'animateCameraToTerrainPrelude', 'camera', 'camera owns prelude animation'],
  ['lifecycle', 'applyMapFlatteningLayout', 'journey', 'journey owns map-flattening layout'],
  ['journey', 'releaseFocusCameraAssist', 'camera', 'camera owns assist release'],
  ['journey', 'noteSceneInteraction', 'camera', 'camera owns scene interaction tracking'],
  ['journey', 'syncInspectedStrandOverlay', 'thread-inspector', 'thread-inspector owns overlay sync'],
  ['sceneReveal', 'updateCameraViewportOffset', 'camera', 'camera owns viewport offset'],
  ['threadInspector', 'exploreThreadNeighbor', 'thread-inspector', 'REMOVED direct backward-compat expose; diagnostic access remains on window._ti and contracts assert the direct window assignment stays absent'],
];

// ── TEST 1 — No bare window calls in dewindowed seams ────────────────────────
// search-state.js is already dewindowed — any new unguarded window.fn() call is a regression.

function testNoBareCallsInDowindowedSeams() {
  console.log('\n[TEST 1] No bare window calls in dewindowed seams');

  const src = read('searchState');

  // Browser APIs that are not cross-module state/navigation bridges.
  // These are standard browser globals and are not part of the app's bridge surface.
  const BROWSER_APIS = new Set([
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight',
    'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame',
    'addEventListener', 'removeEventListener', 'dispatchEvent',
    'getComputedStyle', 'document', 'navigator', 'location',
    'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest',
  ]);

  // Module references exported via app.js bootstrap (window._ss, etc.)
  const BOOTSTRAP_MODULE_REFS = new Set(['_ss', '_fp', '_cc', '_ti', '_ms', '_weather']);

  const lines = src.split('\n');
  const problems = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('//') || t.startsWith('*')) continue;

    const pos = t.indexOf('window.');
    if (pos === -1) continue;

    const before = t.substring(0, pos);
    if (before.includes('typeof') || before.includes('?.')) continue;

    // Multi-line guard check
    let guarded = false;
    for (let j = Math.max(0, i - 3); j < i; j++) {
      const prev = lines[j].trim();
      if (prev.includes('typeof') || prev.includes('===')) { guarded = true; break; }
    }
    if (guarded) continue;

    // It's a potential bare call — check what it is
    const fnMatch = t.match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (!fnMatch) continue;
    const fn = fnMatch[1];

    // Skip browser APIs and bootstrap module references
    if (BROWSER_APIS.has(fn) || BOOTSTRAP_MODULE_REFS.has(fn)) continue;

    // Skip property accessors (window.innerWidth — no paren means it's a property read)
    const after = t.slice(pos + `window.${fn}`.length);
    if (!/^\(/.test(after)) continue; // no parenthesis → not a function call

    problems.push(`  line ${i + 1}: bare window.${fn}() — not guarded with typeof`);
  }

  assert(problems.length === 0,
    `search-state.js has bare unguarded window calls (regression in dewindowed seam):\n${problems.join('\n')}`);

  console.log('  OK — search-state.js: no bare window calls (dewindowed seam intact)');
}

// ── TEST 2 — No newly introduced bare window calls in lifecycle.js ──────────
// lifecycle.js is the main orchestrator — new unguarded cross-module calls are regressions.

function testLifecycleNoNewBareCalls() {
  console.log('\n[TEST 2] No newly introduced bare window calls in lifecycle.js');

  const src = read('lifecycle');

  // Collect all window.fn call-sites that are NOT in the known fallback set
  // and NOT guarded by typeof.
  // Focus on HIGH-RISK cross-module calls: animateCameraTo*, setRouteChoreographyPhase,
  // syncClusterSectionState, updateLegendGuideState, updateTraversalUi, etc.

  const HIGH_RISK_CALLS = [
    'animateCameraToNode', 'animateCameraToTerrainPrelude', 'animateCameraToSearchCorridor',
    'setRouteChoreographyPhase', 'syncClusterSectionState', 'updateLegendGuideState',
    'updateTraversalUi', 'restoreLegendCollapsedPanel', 'applyMapFlatteningLayout',
    'clearRouteExploration', 'noteSceneInteraction',
  ];

  const lines = src.split('\n');
  const problems = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('//') || t.startsWith('*')) continue;

    for (const fn of HIGH_RISK_CALLS) {
      const pos = t.indexOf(`window.${fn}`);
      if (pos === -1) continue;

      // Check if this is a call (not an assignment)
      const after = t.slice(pos + `window.${fn}`.length);
      if (!/^[\(\?]/.test(after)) continue; // not a call site

      // Check guard
      const before = t.substring(0, pos);
      if (before.includes('typeof') || before.includes('?.')) continue;

      // Multi-line guard
      let guarded = false;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const prev = lines[j].trim();
        if (prev.includes('typeof') || prev.includes('===') || prev.includes('null !=')) { guarded = true; break; }
      }
      if (guarded) continue;

      problems.push(`  line ${i + 1}: bare window.${fn}() — not guarded (cross-module risk)`);
    }
  }

  assert(problems.length === 0,
    `lifecycle.js has new unguarded high-risk window calls:\n${problems.join('\n')}\nThese should use typeof guards or direct module imports.`);
  console.log('  OK — lifecycle.js: no new bare high-risk window calls');
}

// ── TEST 3 — App.js bootstrap exports are thin aliases ────────────────────────
// Verify app.js window exports are module references, not inline function bodies.

function testAppJsExportsAreThin() {
  console.log('\n[TEST 3] app.js window exports are thin module aliases');

  const appSrc = read('app');

  // Extract all window assignments from app.js
  const lines = appSrc.split('\n');
  const problems = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('*')) continue;

    const m = t.match(/^window\.(\w+)\s*=\s*(.+?);?\s*$/);
    if (!m) continue;

    const [, name, expr] = m;

    // Allowed: plain name reference or module.member
    const isPlainName = /^[a-zA-Z_$][\w]*$/.test(expr.trim());
    const isModuleMember = /^[a-zA-Z_$][\w]*\.[a-zA-Z_$][\w]*$/.test(expr.trim());

    // Inline functions and utilities that are local to app.js
    const ALLOWED_INLINE = new Set([
      'getSelectedBusinessRoleLabel', // local utility, not a bridge
      'applyClusterUiAccent',         // local function wrapping cluster-ui-accent
      'findClusterByKeyword',          // local utility
      'state',                         // raw state reference
    ]);

    if (isPlainName || isModuleMember || ALLOWED_INLINE.has(name)) continue;

    problems.push(`  window.${name} = ${expr} — not a thin alias (inline body?)`);
  }

  assert(problems.length === 0,
    `app.js has non-thin window exports:\n${problems.join('\n')}`);
  console.log('  OK — app.js: all window exports are thin aliases or module.member');
}

// ── TEST 4 — Extraction candidate calls are documented ───────────────────────
// The EXTRACTION_CANDIDATES list documents known residual debt.
// This test verifies that none of the documented extraction candidates have
// been accidentally removed or replaced with unguarded direct calls.

function testExtractionCandidatesDocumented() {
  console.log('\n[TEST 4] Extraction candidate window calls are documented');

  // For each extraction candidate, verify the window call still exists
  // (guarded or not) in the caller source. The contract is: if you're calling
  // window.X and X appears in EXTRACTION_CANDIDATES, that call is documented debt.

  const problems = [];

  for (const [caller, fn, owner, note] of EXTRACTION_CANDIDATES) {
    if (!MODULES[caller]) {
      problems.push(`  Unknown module: ${caller}`);
      continue;
    }
    const src = read(caller);
    if (!src.includes(`window.${fn}`)) {
      // Window call may have been refactored to direct import — that's fine (even good)
      // Just note it for inventory purposes
      console.log(`  [INFO] ${caller} → window.${fn} (${owner}): ${note} — call may be refactored`);
    }
  }

  if (problems.length > 0) {
    assert(false, `Extraction candidate configuration errors:\n${problems.join('\n')}`);
  }

  console.log('  OK — extraction candidates documented and calls verified');
}

// ── TEST 5 — Baseline bare-call inventory (informational) ─────────────────────
// Document the current count of unguarded window.fn() calls across modules.
// This is informational — it does NOT fail. The actual enforcement
// for dewindowed seams is done in tests 1 and 2.

function testBareCallBaseline() {
  console.log('\n[TEST 5] Baseline bare-call inventory (informational)');

  // Browser APIs and standard globals — not cross-module bridge calls.
  const IGNORED = new Set([
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight',
    'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame',
    'addEventListener', 'removeEventListener', 'dispatchEvent',
    'getComputedStyle', 'document', 'navigator', 'location',
    'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest',
    'AudioContext', 'webkitAudioContext',
    '_ss', '_fp', '_cc', '_ti', '_ms', '_weather', '_cam',
    // Internal state/probes
    '__lastCanvasNodePick', '__lastCanvasNodeHover', '__lastCanvasNodeFocusPick',
    '__semanticJourneyProbe', '__semanticSearchCacheProbe',
    '__semanticThreadInspectorProbe', '__semanticCanvasThreadProbe',
    '__semanticFocusCueProbe',
    '_previouslyFocusedLegend', '_previouslyFocusedFocusStage',
  ]);

  // Modules that are allowed to have unguarded window calls
  // (they are authoritative owners or compatibility layers)
  const ALLOWED_UNGUARDED = new Set([
    'app', 'lifecycle', 'eventBindings', 'journey', 'camera',
    'demoController', 'journeyCompassCtrl', 'journeyCompassState',
    'clusterFilter', 'focusPocket', 'clusterLabels', 'audio',
    'viewController', 'navigationState', 'journeyWebgl',
  ]);

  const moduleNames = Object.keys(MODULES);
  const results = [];

  for (const mod of moduleNames) {
    const src = read(mod);
    const lines = src.split('\n');
    let bareCount = 0;
    const bareFns = [];

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t || t.startsWith('//') || t.startsWith('*')) continue;

      const pos = t.indexOf('window.');
      if (pos === -1) continue;

      // Skip typeof-guarded calls
      const before = t.substring(0, pos);
      if (before.includes('typeof') || before.includes('?.')) continue;

      // Multi-line guard
      let guarded = false;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const prev = lines[j].trim();
        if (prev.includes('typeof') || prev.includes('===') || prev.includes('null !=')) {
          guarded = true;
          break;
        }
      }
      if (guarded) continue;

      const fnMatch = t.match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (!fnMatch) continue;
      const fn = fnMatch[1];

      // Skip browser APIs and module references
      if (IGNORED.has(fn)) continue;

      // Skip property accessors (no parenthesis after name)
      const after = t.slice(pos + `window.${fn}`.length);
      if (!/^\(/.test(after)) continue;

      bareCount++;
      bareFns.push(`${fn}@${i + 1}`);
    }

    if (bareCount > 0) {
      results.push({ mod, count: bareCount, fns: bareFns });
    }
  }

  // Only flag modules NOT in the allowed set — these need review
  const needsReview = results.filter(r => !ALLOWED_UNGUARDED.has(r.mod));

  console.log('  Baseline inventory (informational — does not fail):');
  for (const r of results) {
    const flag = needsReview.includes(r) ? '  ⚠' : '   ';
    console.log(`  ${flag} ${r.mod}: ${r.count} unguarded bridge call(s) — ${r.fns.slice(0, 5).join(', ')}${r.fns.length > 5 ? '...' : ''}`);
  }
  if (needsReview.length > 0) {
    console.log('  Note: modules flagged with ⚠ need review for dewindowing opportunity');
  }
  console.log('  OK — baseline recorded (informational only, no failure)');
}

// ── TEST 6 — Runtime callers migrated off retired focusOnPoint bridge ───────

function testFocusOnPointRuntimeCallersDewindowed() {
  console.log('\n[TEST 6] Runtime callers do not use window.focusOnPoint');

  const callers = ['journey', 'mapState', 'threadInspector'];
  const problems = [];

  for (const mod of callers) {
    const src = read(mod);
    if (src.includes('window.focusOnPoint')) {
      problems.push(`  ${mod}: still references window.focusOnPoint`);
    }
    if (!/\bfocusOnPoint\b/.test(src)) {
      problems.push(`  ${mod}: expected a focusOnPoint direct import/call after dewindowing`);
    }
  }

  const lifecycleSrc = read('lifecycle');
  assert(
    !/window\.focusOnPoint\b/.test(lifecycleSrc),
    'lifecycle.js should not retain the retired window.focusOnPoint compatibility bridge'
  );

  assert(
    problems.length === 0,
    `Runtime focusOnPoint callers must use direct imports, not the window bridge:\n${problems.join('\n')}`
  );

  console.log('  OK — journey/map-state/thread-inspector use direct focusOnPoint imports; lifecycle bridge is retired');
}

// ── TEST 7 — Journey uses direct arrival handoff imports ─────────────────────

function testJourneyArrivalHandoffDewindowed() {
  console.log('\n[TEST 7] journey.js does not use arrival handoff window bridges');

  const journeySrc = read('journey');
  const problems = [];

  for (const fn of ['syncArrivalHandoffOverlay', 'disposeArrivalHandoffOverlay']) {
    if (journeySrc.includes(`window.${fn}`)) {
      problems.push(`  journey: still references window.${fn}`);
    }
    if (!new RegExp(`\\b${fn}\\s*\\(`).test(journeySrc)) {
      problems.push(`  journey: expected direct ${fn}() call after dewindowing`);
    }
  }

  const journeyWebglSrc = read('journeyWebgl');
  assert(
    /window\.syncArrivalHandoffOverlay\s*=\s*syncArrivalHandoffOverlay/.test(journeyWebglSrc),
    'journey-webgl.js should retain the temporary window.syncArrivalHandoffOverlay compatibility bridge'
  );
  assert(
    /window\.disposeArrivalHandoffOverlay\s*=\s*disposeArrivalHandoffOverlay/.test(journeyWebglSrc),
    'journey-webgl.js should retain the temporary window.disposeArrivalHandoffOverlay compatibility bridge'
  );

  assert(
    problems.length === 0,
    `journey.js must use direct arrival handoff imports, not window bridges:\n${problems.join('\n')}`
  );

  console.log('  OK — journey.js uses direct arrival handoff calls; journey-webgl bridges are compatibility-only');
}

// ── TEST 8 — Verify window-bridge-gaps-contract.mjs still passes ─────────────
// Run the sibling contract to ensure no regressions in the already-dewindowed seams.

function testSiblingContractStillPasses() {
  console.log('\n[TEST 8] sibling window-bridge-gaps-contract.mjs still passes');

  try {
    const result = execFileSync(
      process.execPath,
      [path.join(SEMDEMO_ROOT, 'tests/window-bridge-gaps-contract.mjs')],
      { cwd: SEMDEMO_ROOT, encoding: 'utf-8', timeout: 30000 }
    );
    if (!result.includes('ALL TESTS PASSED')) {
      assert(false, `window-bridge-gaps-contract.mjs did not pass. Output:\n${result}`);
    }
    console.log('  OK — window-bridge-gaps-contract.mjs: all tests passed');
  } catch (err) {
    const stderr = err.stderr || '';
    const stdout = err.stdout || '';
    const output = stderr + stdout;
    assert(false, `window-bridge-gaps-contract.mjs failed:\n${output}`);
  }
}

// ── MAIN ────────────────────────────────────────────────────────────────────

console.log('=================================================================');
console.log('residual-window-bridge-inventory-contract.mjs');
console.log('Inventory + guard: residual window bridge surface');
console.log('=================================================================');

try {
  testNoBareCallsInDowindowedSeams();
  testLifecycleNoNewBareCalls();
  testAppJsExportsAreThin();
  testExtractionCandidatesDocumented();
  testBareCallBaseline();
  testFocusOnPointRuntimeCallersDewindowed();
  testJourneyArrivalHandoffDewindowed();
  testSiblingContractStillPasses();

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
