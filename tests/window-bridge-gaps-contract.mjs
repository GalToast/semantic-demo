/**
 * window-bridge-gaps-contract.mjs
 *
 * Fast Node contract test for lifecycle window bridge gaps.
 * Verifies each gap is resolved through direct imports, event requests, adapters, or an
 * intentionally documented no-op guard.
 *
 * Gap 1  — getRouteLayerOrigin:  guarded no-op, fallback is 'galaxy'
 * Gap 2  — syncClusterSectionState: resolved (direct module imports)
 * Gap 3a — hydrateLeadContext:   resolved (journey lifecycle adapter)
 * Gap 3b — applySearchGlowVisualState: resolved via event request in journey-point-color.js
 * Gap 4  — updateSelectedCardHeading: resolved via direct module imports
 *
 * Source-only — no DOM, no Playwright.
 * Runs in Node.
 *
 * Usage:
 *   node tests/window-bridge-gaps-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveSource } from './source-path.mjs';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const LIFECYCLE_PATH = resolveSource('js/modules/lifecycle.ts', SEMDEMO_ROOT);
const VIEW_CONTROLLER_PATH = resolveSource('js/modules/view-controller.ts', SEMDEMO_ROOT);
const JOURNEY_PATH = resolveSource('js/modules/journey.ts', SEMDEMO_ROOT);
const JOURNEY_POINT_COLOR_PATH = resolveSource('js/modules/journey-point-color.ts', SEMDEMO_ROOT);
const JOURNEY_SELECTED_CARD_PATH = resolveSource('js/modules/journey-selected-card.ts', SEMDEMO_ROOT);
const UI_RENDERERS_PATH = resolveSource('src/lib/ui-renderers.ts', SEMDEMO_ROOT);
const FOCUS_STAGE_RENDERER_PATH = resolveSource('js/modules/focus-stage-renderer.ts', SEMDEMO_ROOT);
const SCENE_REVEAL_PATH = resolveSource('src/lib/engine/scene-reveal.ts', SEMDEMO_ROOT);
const EVENT_BINDINGS_PATH = resolveSource('js/modules/event-bindings.ts', SEMDEMO_ROOT);
const CAMERA_CONTROLS_PATH = resolveSource('js/modules/camera-controls.ts', SEMDEMO_ROOT);
const SEARCH_STATE_PATH = resolveSource('js/modules/search-state.ts', SEMDEMO_ROOT);
const SEARCH_ORCHESTRATION_PATH = resolveSource('src/lib/search/orchestration.ts', SEMDEMO_ROOT);
const APP_PATH = resolveSource('src/lib/orchestration/adapters.ts', SEMDEMO_ROOT);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertNoDeadCall(src, fn, file, label) {
  // All window.fn() call-sites must be inside typeof guards or ?. optional chains.
  // Assignment lines (window.fn = ...) are not calls and are skipped.
  // For multi-line guards (guard on preceding line), scan back up to 4 lines.
  const lines = src.split('\n');
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    // Skip blank lines
    if (!t) continue;
    // Skip assignment lines
    if (t.includes(`window.${fn} =`) && !t.includes('===')) continue;
    const pos = t.indexOf(`window.${fn}`);
    if (pos === -1) continue;
    // Scan full text of current line before window.fn
    const before = t.substring(0, pos);
    if (before.includes('typeof') || before.includes('?.')) continue;
    // Multi-line guard: scan up to 4 preceding non-blank lines for typeof/?. guard
    let guarded = false;
    for (let j = Math.max(0, i - 4); j < i; j++) {
      const prev = lines[j].trim();
      if (prev.includes('typeof') || prev.includes('?.')) { guarded = true; break; }
    }
    if (guarded) continue;
    // Bare call
    problems.push(`  line ${i + 1}: ${t}`);
  }
  assert(problems.length === 0, `${label}: ${file} has bare window.${fn}() calls:\n${problems.join('\n')}`);
}

// ---------------------------------------------------------------------------
// GAP 1 — getRouteLayerOrigin: guarded no-op (intentional, documented)
// lifecycle.js calls it at lines 1127 and 1227 with a 'galaxy' fallback
// ---------------------------------------------------------------------------

function testGap1_getRouteLayerOrigin() {
  console.log('\n[TEST] Gap 1 — getRouteLayerOrigin (intentional no-op guard)');

  const src = fs.readFileSync(VIEW_CONTROLLER_PATH, 'utf-8');

  // Must have the direct ESM import OR the legacy window guard
  const hasDirectImport = /const\s+handoffFrom\s*=\s*options\.handoffFrom\s*\|\|\s*getRouteLayerOrigin\(/.test(src);
  const hasLegacyGuard = /typeof\s+window\.getRouteLayerOrigin\s*===\s*['"]function['"]\s*\?\s*window\.getRouteLayerOrigin\(\)\s*:\s*['"]galaxy['"]/.test(src);

  assert(
    hasDirectImport || hasLegacyGuard,
    'view-controller.js must use getRouteLayerOrigin (either via direct import or guarded window call)'
  );

  // Must NOT have an assignment (it IS intentionally a no-op)
  const hasAssign = /window\.getRouteLayerOrigin\s*=\s*(?!=)/.test(src);
  assert(!hasAssign, 'getRouteLayerOrigin should NOT be assigned — it is an intentional no-op guard');

  console.log('  OK — getRouteLayerOrigin: guarded no-op confirmed, fallback is "galaxy"');
}

// ---------------------------------------------------------------------------
// GAP 2 — syncClusterSectionState: resolved through direct module imports
// Direct imports in scene-reveal.js and event-bindings.js remove the lifecycle window shim.
// ---------------------------------------------------------------------------

function testGap2_syncClusterSectionState() {
  console.log('\n[TEST] Gap 2 — syncClusterSectionState (RESOLVED by direct imports)');

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const sceneRevealSrc = fs.readFileSync(SCENE_REVEAL_PATH, 'utf-8');
  const eventBindingsSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8');

  assert(
    !/window\.syncClusterSectionState\s*=/.test(lifecycleSrc),
    'Gap 2: lifecycle.js must not assign window.syncClusterSectionState after direct-import migration'
  );

  assert(
    /import\s*\{\s*syncClusterSectionState\s*\}\s*from\s*['"](?:\.\/cluster-labels(?:\.ts)?|\.\.\/\.\.\/\.\.\/js\/modules\/cluster-labels)['"]\s?;?/.test(sceneRevealSrc),
    'Gap 2: scene-reveal.ts must import syncClusterSectionState directly'
  );

  assert(
    /import\s*\{\s*syncClusterSectionState\s*\}\s*from\s*['"]\.\/cluster-labels(\.ts)?['"]\s?;?/.test(eventBindingsSrc),
    'Gap 2: event-bindings.ts must import syncClusterSectionState directly'
  );

  // No remaining call site should depend on the retired window bridge.
  assertNoDeadCall(lifecycleSrc, 'syncClusterSectionState', 'lifecycle.ts', 'Gap 2');
  assertNoDeadCall(sceneRevealSrc, 'syncClusterSectionState', 'scene-reveal.ts', 'Gap 2');
  assertNoDeadCall(eventBindingsSrc, 'syncClusterSectionState', 'event-bindings.ts', 'Gap 2');

  assert(
    /syncClusterSectionState\s*\(\s*\)/.test(sceneRevealSrc),
    'Gap 2: scene-reveal.js resize path must call syncClusterSectionState directly'
  );

  console.log('  OK — syncClusterSectionState: RESOLVED');
}

// ---------------------------------------------------------------------------
// GAP 3a — hydrateLeadContext: resolved through journey lifecycle adapter
// ---------------------------------------------------------------------------

function testGap3a_hydrateLeadContext() {
  console.log('\n[TEST] Gap 3a — hydrateLeadContext (RESOLVED by adapter injection)');

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');
  const selectedCardSrc = fs.readFileSync(JOURNEY_SELECTED_CARD_PATH, 'utf-8');
  const appSrc = fs.readFileSync(APP_PATH, 'utf-8');

  assert(
    /export\s+function\s+hydrateLeadContext\s*\(/.test(lifecycleSrc),
    'Gap 3a: lifecycle.js must export hydrateLeadContext as the owner API'
  );
  assert(
    !/window\.hydrateLeadContext\s*=/.test(lifecycleSrc),
    'Gap 3a: lifecycle.js must not reinstall retired window.hydrateLeadContext bridge'
  );

  // selected-card owner call site must not depend on the retired window bridge.
  assertNoDeadCall(journeySrc, 'hydrateLeadContext', 'journey.ts', 'Gap 3a');
  assert(
    /selectedCardAdapter\.hydrateLeadContext/.test(selectedCardSrc),
    'Gap 3a: journey-selected-card.js must call hydrateLeadContext through the lifecycle adapter'
  );

  assert(
    /hydrateLeadContext:\s*\(point(?:\s*:\s*[^,\)]+)?,\s*options(?:\s*:\s*[^,\)]+)?\)\s*=>[\s\S]{0,160}hydrateLeadContext\(point,\s*options\)/.test(appSrc),
    'Gap 3a: app.ts must inject lifecycle.hydrateLeadContext into the journey adapter'
  );

  console.log('  OK — hydrateLeadContext: RESOLVED by lifecycle adapter');
}

// ---------------------------------------------------------------------------
// GAP 3b — applySearchGlowVisualState: resolved via alternate call chain.
// point-color owner publishes a search status request, which handles search
// glow state without a raw window bridge or retired lifecycle adapter.
// ---------------------------------------------------------------------------

function testGap3b_applySearchGlowVisualState() {
  console.log('\n[TEST] Gap 3b — applySearchGlowVisualState (RESOLVED via event alt call)');

  const pointColorSrc = fs.readFileSync(JOURNEY_POINT_COLOR_PATH, 'utf-8');

  // The old window.applySearchGlowVisualState call must be replaced
  // with a SEARCH_STATUS_SYNC_REQUESTED publication inside the same state block.
  assert(
    /searchGlowActive[\s\S]{0,650}\bpublish\(EVENTS\.SEARCH_STATUS_SYNC_REQUESTED/.test(pointColorSrc),
    'journey-point-color.js must publish SEARCH_STATUS_SYNC_REQUESTED in searchGlowActive block'
  );
  assert(
    /import\s+\{\s*publish,\s*EVENTS\s*\}\s+from\s+['"](?:\.\/event-bus\.(?:js|ts)|@lib\/orchestration\/event-bus)['"]/.test(pointColorSrc),
    'journey-point-color.js must import publish and EVENTS from event-bus.ts'
  );
  assert(!/search-lifecycle-adapter/.test(pointColorSrc), 'journey-point-color.js must not import retired search lifecycle adapter');

  // The original guard pattern should NOT appear as a standalone dead call
  // (it's fine if the function name still appears in comments)
  const lines = pointColorSrc.split('\n');
  let bareApplySearchGlowVisualState = false;
  lines.forEach((line, i) => {
    const pos = line.indexOf('window.applySearchGlowVisualState');
    if (pos === -1) return;
    const before = line.substring(0, pos);
    if (before.includes('typeof') || before.includes('?.')) return;
    bareApplySearchGlowVisualState = true;
  });
  assert(!bareApplySearchGlowVisualState, 'journey-point-color.js must not have bare window.applySearchGlowVisualState calls');

  console.log('  OK — applySearchGlowVisualState: RESOLVED via alternate SEARCH_STATUS_SYNC_REQUESTED publication');
}

// ---------------------------------------------------------------------------
// GAP 4 — updateSelectedCardHeading: resolved through the selected-card renderer
// owner chain. focus-stage-renderer.js owns the DOM write, and
// journey-selected-card.js/journey.js call that renderer path directly.
// lifecycle.js only publishes COMPOSITION_UPDATED.
// ---------------------------------------------------------------------------

function testGap4_updateSelectedCardHeading() {
  console.log('\n[TEST] Gap 4 — updateSelectedCardHeading (RESOLVED via direct imports)');

  const uiRendererSrc = fs.readFileSync(UI_RENDERERS_PATH, 'utf-8');
  const focusRendererSrc = fs.readFileSync(FOCUS_STAGE_RENDERER_PATH, 'utf-8');
  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');
  const selectedCardSrc = fs.readFileSync(JOURNEY_SELECTED_CARD_PATH, 'utf-8');

  assert(
    /export\s+function\s+updateSelectedCardHeading\s*\(/.test(focusRendererSrc),
    'focus-stage-renderer.js must export updateSelectedCardHeading as the DOM owner'
  );
  assert(
    /selected-card-title/.test(focusRendererSrc),
    'focus-stage-renderer.js updateSelectedCardHeading must target #selected-card-title'
  );
  assert(
    !/selected-card-title/.test(uiRendererSrc),
    'ui-renderers.js must not keep dummy selected-card-title markers after the focus-stage transfer'
  );
  assert(
    /import\s*\{[\s\S]*updateSelectedCardHeading[\s\S]*\}\s*from\s*['"]\.\/focus-stage-renderer\.(?:js|ts)['"]/.test(selectedCardSrc),
    'journey-selected-card.js must import updateSelectedCardHeading from focus-stage-renderer.ts'
  );
  assert(
    /import\s*\{[\s\S]*updateSelectedCardHeading[\s\S]*\}\s*from\s*['"]\.\/focus-stage-renderer\.(?:js|ts)['"]/.test(journeySrc),
    'journey.js must re-export updateSelectedCardHeading through the focus-stage-renderer selected-card path'
  );
  assert(
    /publish\s*\(\s*EVENTS\.COMPOSITION_UPDATED\s*\)/.test(lifecycleSrc),
    'lifecycle.js must refresh selected-card heading/content through COMPOSITION_UPDATED fanout, not a direct heading import'
  );
  assert(
    !/import\s*\{[\s\S]*updateSelectedCardHeading[\s\S]*\}\s*from\s*['"]\.\/ui-renderers\.(?:js|ts)['"]/.test(lifecycleSrc),
    'lifecycle.js must not re-own updateSelectedCardHeading after selected-card transfer'
  );
  assertNoDeadCall(lifecycleSrc, 'updateSelectedCardHeading', 'lifecycle.ts', 'Gap 4');
  assertNoDeadCall(journeySrc, 'updateSelectedCardHeading', 'journey.ts', 'Gap 4');
  assertNoDeadCall(selectedCardSrc, 'updateSelectedCardHeading', 'journey-selected-card.ts', 'Gap 4');

  console.log('  OK — updateSelectedCardHeading: RESOLVED via direct imports');
}

// ---------------------------------------------------------------------------
// GAP 5 — focusOnNode: exported from camera-controls.js.
// event-bindings.js/lifecycle.js avoid window focus calls. search-state.js now
// publishes SEARCH_FOCUS_REQUESTED and app.ts owns the camera-controls call.
// ---------------------------------------------------------------------------

function testGap5_focusOnNode() {
  console.log('\n[TEST] Gap 5 — focusOnNode (dewindowing seam tracked)');

  const cameraControlsSrc = fs.readFileSync(CAMERA_CONTROLS_PATH, 'utf-8');
  const eventBindingsSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8');
  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const searchStateSrc = fs.readFileSync(SEARCH_STATE_PATH, 'utf-8');
  const searchOrchestrationSrc = fs.readFileSync(SEARCH_ORCHESTRATION_PATH, 'utf-8');
  const appSrc = fs.readFileSync(APP_PATH, 'utf-8');
  const eventBusSrc = fs.readFileSync(resolveSource('src/lib/orchestration/event-bus.ts', SEMDEMO_ROOT), 'utf-8');

  assert(
    /^export\s+function\s+focusOnNode\s*\(/m.test(cameraControlsSrc),
    'camera-controls.js must export focusOnNode as a named function'
  );

  // event-bindings.js and lifecycle.js must use direct imports (no window.focusOnNode calls)
  assertNoDeadCall(eventBindingsSrc, 'focusOnNode', 'event-bindings.ts', 'Gap 5');
  assertNoDeadCall(lifecycleSrc, 'focusOnNode', 'lifecycle.ts', 'Gap 5');

  assert(
    /SEARCH_FOCUS_REQUESTED:\s*['"]SEARCH_FOCUS_REQUESTED['"]/.test(eventBusSrc),
    'event-bus.js must expose SEARCH_FOCUS_REQUESTED for search-state focus requests'
  );
  assert(
    /publish\s*\(\s*EVENTS\.SEARCH_FOCUS_REQUESTED\s*,\s*\{[^}]*\bpoint\b[^}]*\bindex\b/.test(searchOrchestrationSrc),
    'search orchestration must publish SEARCH_FOCUS_REQUESTED with point and index'
  );
  assert(
    !/import\s+\{[^}]*\bfocusOnNode\b[^}]*\}\s+from\s+['"]\.\/camera-controls\.(?:js|ts)['"]/.test(searchStateSrc),
    'search-state.js must not re-own focusOnNode after the event migration'
  );
  assert(
    !/window\.focusOnNode\b/.test(searchStateSrc),
    'search-state.js must not call window.focusOnNode after dewindowing'
  );
  assert(
    /subscribeKeyed\s*\(\s*['"]app:search-focus-requested['"]\s*,\s*EVENTS\.SEARCH_FOCUS_REQUESTED[\s\S]{0,320}cameraModule\.focusOnNode\s*\(\s*index\s*,\s*\{\s*fromSearchResult:\s*true\s*\}/.test(appSrc),
    'app.ts must key-subscribe to SEARCH_FOCUS_REQUESTED and call cameraModule.focusOnNode(index, { fromSearchResult: true })'
  );

  console.log('  OK — focusOnNode: export verified and search focus flows through event-owned app camera call');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('=================================================================');
  console.log('window-bridge-gaps-contract.mjs');
  console.log('Contract test: lifecycle window bridge gaps');
  console.log('=================================================================');

  try {
    testGap1_getRouteLayerOrigin();
    testGap2_syncClusterSectionState();
    testGap3a_hydrateLeadContext();
    testGap3b_applySearchGlowVisualState();
    testGap4_updateSelectedCardHeading();
    testGap5_focusOnNode();

    console.log('\n=================================================================');
    console.log('ALL TESTS PASSED');
    console.log('=================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
}

main();
