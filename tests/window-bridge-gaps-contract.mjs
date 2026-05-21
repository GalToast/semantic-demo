/**
 * window-bridge-gaps-contract.mjs
 *
 * Fast Node contract test for lifecycle window bridge gaps.
 * Verifies each gap is either resolved (assigned to window) or
 * intentionally documented as a no-op guard.
 *
 * Gap 1  — getRouteLayerOrigin:  guarded no-op, fallback is 'galaxy'
 * Gap 2  — syncClusterSectionState: resolved (lifecycle.js window shim)
 * Gap 3a — hydrateLeadContext:   resolved (lifecycle.js window shim)
 * Gap 3b — applySearchGlowVisualState: resolved via alternate call in journey.js
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

const SEMDEMO_ROOT = path.resolve(process.cwd());
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js');
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey.js');
const UI_RENDERERS_PATH = path.join(SEMDEMO_ROOT, 'js/modules/ui-renderers.js');
const SCENE_REVEAL_PATH = path.join(SEMDEMO_ROOT, 'js/modules/scene-reveal.js');
const EVENT_BINDINGS_PATH = path.join(SEMDEMO_ROOT, 'js/modules/event-bindings.js');
const CAMERA_CONTROLS_PATH = path.join(SEMDEMO_ROOT, 'js/modules/camera-controls.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertHasAssignment(src, fn, file, label) {
  // Look for window.fn = ... where the = is NOT followed by == (guard)
  // This catches: window.fn = function() { ... } and window.fn = someRef
  const lines = src.split('\n');
  const found = lines.some(line => {
    const t = line.trim();
    return t.includes(`window.${fn} =`) && !t.includes('===');
  });
  assert(found, `${label}: ${file} must assign window.${fn} (e.g., window.${fn} = function(...) { ... })`);
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

  const src = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  // Must have the typeof guard + 'galaxy' fallback pattern
  assert(
    /typeof\s+window\.getRouteLayerOrigin\s*===\s*['"]function['"]\s*\?\s*window\.getRouteLayerOrigin\(\)\s*:\s*['"]galaxy['"]/.test(src),
    'lifecycle.js must guard getRouteLayerOrigin with typeof check and "galaxy" fallback'
  );

  // Must NOT have an assignment (it IS intentionally a no-op)
  const hasAssign = /window\.getRouteLayerOrigin\s*=\s*(?!=)/.test(src);
  assert(!hasAssign, 'getRouteLayerOrigin should NOT be assigned — it is an intentional no-op guard');

  console.log('  OK — getRouteLayerOrigin: guarded no-op confirmed, fallback is "galaxy"');
}

// ---------------------------------------------------------------------------
// GAP 2 — syncClusterSectionState: resolved in lifecycle.js window shim
// Called from lifecycle.js:1479, scene-reveal.js:56, event-bindings.js:693
// Resolved by installing window.syncClusterSectionState in the lifecycle.js shim
// ---------------------------------------------------------------------------

function testGap2_syncClusterSectionState() {
  console.log('\n[TEST] Gap 2 — syncClusterSectionState (RESOLVED in lifecycle.js)');

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const sceneRevealSrc = fs.readFileSync(SCENE_REVEAL_PATH, 'utf-8');
  const eventBindingsSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8');

  // lifecycle.js MUST assign the window shim
  assertHasAssignment(lifecycleSrc, 'syncClusterSectionState', 'lifecycle.js', 'Gap 2');

  // All callers must use typeof guards (which now pass)
  assertNoDeadCall(lifecycleSrc, 'syncClusterSectionState', 'lifecycle.js', 'Gap 2');
  assertNoDeadCall(sceneRevealSrc, 'syncClusterSectionState', 'scene-reveal.js', 'Gap 2');
  assertNoDeadCall(eventBindingsSrc, 'syncClusterSectionState', 'event-bindings.js', 'Gap 2');

  // The shim must handle the cluster-section element
  assert(
    /cluster-section/.test(lifecycleSrc),
    'syncClusterSectionState shim must reference the cluster-section element'
  );

  console.log('  OK — syncClusterSectionState: RESOLVED');
}

// ---------------------------------------------------------------------------
// GAP 3a — hydrateLeadContext: resolved in lifecycle.js window shim
// Called from journey.js:1490 only
// Resolved by installing window.hydrateLeadContext in lifecycle.js shim
// ---------------------------------------------------------------------------

function testGap3a_hydrateLeadContext() {
  console.log('\n[TEST] Gap 3a — hydrateLeadContext (RESOLVED in lifecycle.js)');

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // lifecycle.js MUST assign the window shim
  assertHasAssignment(lifecycleSrc, 'hydrateLeadContext', 'lifecycle.js', 'Gap 3a');

  // journey.js call site must be guarded (which now passes)
  assertNoDeadCall(journeySrc, 'hydrateLeadContext', 'journey.js', 'Gap 3a');

  // The shim must call updateSelectedBusiness (the actual card renderer)
  assert(
    /hydrateLeadContext[\s\S]*updateSelectedBusiness/.test(lifecycleSrc) ||
    /updateSelectedBusiness[\s\S]*hydrateLeadContext/.test(lifecycleSrc),
    'hydrateLeadContext shim must delegate to window.updateSelectedBusiness'
  );

  console.log('  OK — hydrateLeadContext: RESOLVED');
}

// ---------------------------------------------------------------------------
// GAP 3b — applySearchGlowVisualState: resolved via alternate call chain
// journey.js:3039 guarded call — resolved by calling the already-wired
// window.syncSearchStatusForFocus instead, which handles search glow state
// ---------------------------------------------------------------------------

function testGap3b_applySearchGlowVisualState() {
  console.log('\n[TEST] Gap 3b — applySearchGlowVisualState (RESOLVED via alt call)');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // The old window.applySearchGlowVisualState call must be replaced
  // with a window.syncSearchStatusForFocus call inside the same guard block
  assert(
    /searchGlowActive[\s\S]{0,200}window\.syncSearchStatusForFocus/.test(journeySrc),
    'journey.js must call window.syncSearchStatusForFocus in searchGlowActive block'
  );

  // The original guard pattern should NOT appear as a standalone dead call
  // (it's fine if the function name still appears in comments)
  const lines = journeySrc.split('\n');
  let bareApplySearchGlowVisualState = false;
  lines.forEach((line, i) => {
    const pos = line.indexOf('window.applySearchGlowVisualState');
    if (pos === -1) return;
    const before = line.substring(0, pos);
    if (before.includes('typeof') || before.includes('?.')) return;
    // allow it if it's been replaced with the alt call
    if (line.includes('window.syncSearchStatusForFocus')) return;
    bareApplySearchGlowVisualState = true;
  });
  assert(!bareApplySearchGlowVisualState, 'journey.js must not have bare window.applySearchGlowVisualState calls');

  console.log('  OK — applySearchGlowVisualState: RESOLVED via alternate window.syncSearchStatusForFocus call');
}

// ---------------------------------------------------------------------------
// GAP 4 — updateSelectedCardHeading: resolved via direct module imports.
// Called from lifecycle.js and journey.js to keep selected-card chrome honest
// across map, focus, and search-result transitions without a window bridge.
// ---------------------------------------------------------------------------

function testGap4_updateSelectedCardHeading() {
  console.log('\n[TEST] Gap 4 — updateSelectedCardHeading (RESOLVED via direct imports)');

  const uiRendererSrc = fs.readFileSync(UI_RENDERERS_PATH, 'utf-8');
  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  assert(
    /export\s+function\s+updateSelectedCardHeading\s*\(/.test(uiRendererSrc),
    'ui-renderers.js must export updateSelectedCardHeading'
  );
  assert(
    /import\s*\{[\s\S]*updateSelectedCardHeading[\s\S]*\}\s*from\s*['"]\.\/ui-renderers\.js['"]/.test(lifecycleSrc),
    'lifecycle.js must import updateSelectedCardHeading from ui-renderers.js'
  );
  assert(
    /import\s*\{[\s\S]*updateSelectedCardHeading[\s\S]*\}\s*from\s*['"]\.\/ui-renderers\.js['"]/.test(journeySrc),
    'journey.js must import updateSelectedCardHeading from ui-renderers.js'
  );
  assert(
    /selected-card-title/.test(uiRendererSrc),
    'updateSelectedCardHeading must target #selected-card-title'
  );
  assertNoDeadCall(lifecycleSrc, 'updateSelectedCardHeading', 'lifecycle.js', 'Gap 4');
  assertNoDeadCall(journeySrc, 'updateSelectedCardHeading', 'journey.js', 'Gap 4');

  console.log('  OK — updateSelectedCardHeading: RESOLVED via direct imports');
}

// ---------------------------------------------------------------------------
// GAP 5 — focusOnNode: exported from camera-controls.js, guarded at all call sites.
// The window shim (app.js:85) bridges during transition.
// Seam: callers switch to direct named import from camera-controls.js.
// ---------------------------------------------------------------------------

function testGap5_focusOnNode() {
  console.log('\n[TEST] Gap 5 — focusOnNode (dewindowing seam tracked)');

  const cameraControlsSrc = fs.readFileSync(CAMERA_CONTROLS_PATH, 'utf-8');
  const eventBindingsSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8');
  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  assert(
    /^export\s+function\s+focusOnNode\s*\(/m.test(cameraControlsSrc),
    'camera-controls.js must export focusOnNode as a named function'
  );

  assertNoDeadCall(eventBindingsSrc, 'focusOnNode', 'event-bindings.js', 'Gap 5');
  assertNoDeadCall(lifecycleSrc, 'focusOnNode', 'lifecycle.js', 'Gap 5');

  console.log('  OK — focusOnNode: export verified, typeof guards confirmed at all call sites');
  console.log('  TRACKED — dewindowing seam: replace window.focusOnNode calls with import from camera-controls.js');
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
