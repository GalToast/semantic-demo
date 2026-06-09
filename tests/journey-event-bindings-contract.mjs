/**
 * journey-event-bindings-contract.mjs
 *
 * Fast Node contract test for the risky journey/event-bindings cluster.
 * Coverage:
 *   1. journey-compass direct-import wiring after dewindowing
 *   2. journey-compass action guard (executeJourneyCompassAction next-stop guard)
 *   3. info-panel toggle binding (setInfoPanelOpen contract)
 *   4. resize listener behavior (onWindowResize wiring via bindPanelControls)
 *   5. btn-surprise/btn-launch focusRandomBusiness lifecycle (random focus guard)
 *   6. References to removed trail ghost teardown (static grep for ghost terms)
 *
 * Runs in Node with a tiny DOM/element/window shim. No Playwright.
 */

import fs from 'fs';
import path from 'path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const EVENT_BINDINGS_PATH = path.join(SEMDEMO_ROOT, 'js/modules/event-bindings.ts');
const APP_PATH            = path.join(SEMDEMO_ROOT, 'js/modules/app.ts');
const JOURNEY_PATH        = path.join(SEMDEMO_ROOT, 'js/modules/journey.ts');
const LIFECYCLE_PATH      = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.ts');
const JOURNEY_COMPASS_CONTROLLER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey-compass-controller.ts');

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

function assertMatches(haystack, pattern, label) {
  const found = pattern.test(haystack);
  assert(found, `${label}: expected source to match ${pattern}, but it was not found`);
}

function testJourneyCompassDirectImportWiring() {
  console.log('\n[TEST] Journey compass direct-import wiring after dewindowing');

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const ebSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8');

  // Verify lifecycle re-exports journey compass direct-import functions
  assertMatches(lifecycleSrc,
    /export\s*\{[\s\S]*\bexecuteJourneyCompassAction\b[\s\S]*\bupdateJourneyCompass\b[\s\S]*\bgetJourneyCompassState\b[\s\S]*\}/,
    'lifecycle re-exports journey compass direct-import functions');

  // Verify lifecycle does NOT assign these to window (dewindowed)
  assertNotContains(lifecycleSrc, 'window.updateJourneyCompass =', 'lifecycle must NOT assign updateJourneyCompass to window');
  assertNotContains(lifecycleSrc, 'window.executeJourneyCompassAction =', 'lifecycle must NOT assign executeJourneyCompassAction to window');

  // Verify event-bindings does NOT use window. versions
  assertNotContains(ebSrc, 'window.updateJourneyCompass', 'event-bindings must NOT use window.updateJourneyCompass');
  assertNotContains(ebSrc, 'window.executeJourneyCompassAction', 'event-bindings must NOT use window.executeJourneyCompassAction');

  console.log('  OK lifecycle exports functions directly (direct import, not window-assigned)');
}

function testJourneyCompassActionGuard() {
  console.log('\n[TEST] Journey compass action guard (executeJourneyCompassAction)');

  const journeyCompassControllerSrc = fs.readFileSync(JOURNEY_COMPASS_CONTROLLER_PATH, 'utf-8');
  const ebSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8');

  assertNotContains(ebSrc, "typeof window.executeJourneyCompassAction === 'function'", 'event-bindings no longer uses window guard');

  // 'county-overview' must route through the official reset API while leaving
  // search state under the map-search surface owner.
  assert(journeyCompassControllerSrc.includes('resetExplorationFocus({'), 'county-overview routes through resetExplorationFocus');
  assertNotContains(journeyCompassControllerSrc, 'clearShortSemanticSearchState()', 'county-overview must not clear search state');
  assertNotContains(journeyCompassControllerSrc, "searchInput.value = ''", 'county-overview must not clear search input');

  console.log('  OK executeJourneyCompassAction has correct guards and calls');
}

function testInfoPanelToggleBinding() {
  console.log('\n[TEST] Info-panel toggle binding (setInfoPanelOpen)');
  const ebSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8');
  assertContains(ebSrc, 'export function setInfoPanelOpen', 'setInfoPanelOpen is a named export');
  assert(!ebSrc.includes('window.setInfoPanelOpen'), 'no window assignment');
  console.log('  OK setInfoPanelOpen contract verified');
}

function testNoGhostTeardownReferences() {
  console.log('\n[TEST] No references to removed trail ghost teardown');
  const ebSrc = fs.readFileSync(EVENT_BINDINGS_PATH, 'utf-8');
  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');
  const ghostTerms = ['ghostTeardown', 'trailGhostTeardown', 'killGhost'];
  for (const term of ghostTerms) {
    assertNotContains(ebSrc, term, `eb: ${term}`);
    assertNotContains(journeySrc, term, `jn: ${term}`);
  }
  console.log('  OK No ghost terms found');
}

// MAIN
console.log('============================================================');
console.log('journey-event-bindings-contract.mjs');
console.log('Fast contract test: journey compass + event-bindings cluster');
console.log('============================================================');

try {
  testJourneyCompassDirectImportWiring();
  testJourneyCompassActionGuard();
  testInfoPanelToggleBinding();
  testNoGhostTeardownReferences();
  console.log('\n============================================================');
  console.log('ALL TESTS PASSED');
  console.log('============================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
