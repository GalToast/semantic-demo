/**
 * lifecycle-journey-quick-dewindowing-contract.mjs
 *
 * Contract test for Batch 1 quick dewindowing:
 * - Verifies lifecycle.js does NOT assign window.updateExplorationUi
 * - Verifies journey.js guarded syncSearchStatusForFocus call pattern is preserved
 *
 * Source-only; no DOM, no Playwright. Runs in Node.
 *
 * Usage:
 *   node tests/lifecycle-journey-quick-dewindowing-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js');
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ---------------------------------------------------------------------------
// TEST 1: lifecycle.js must NOT assign window.updateExplorationUi
//
// Rationale: updateExplorationUi is locally defined and exported. Runtime
// callers use direct imports/adapters, so lifecycle.js should not expose a
// duplicate window assignment.
// ---------------------------------------------------------------------------

function testLifecycleNoWindowUpdateExplorationUi() {
  console.log('\n[TEST 1] lifecycle.js does NOT assign window.updateExplorationUi');

  const src = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  // Check that window.updateExplorationUi = ... does not appear as an assignment
  // (allow it inside comments or as a read)
  const lines = src.split('\n');
  const badLines = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Detect window.updateExplorationUi = ... (assignment, not comparison or guard)
    if (trimmed.includes('window.updateExplorationUi =') && !trimmed.includes('===')) {
      // Allow inside comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      badLines.push(`  line ${i + 1}: ${trimmed}`);
    }
  });

  assert(badLines.length === 0,
    `lifecycle.js must NOT assign window.updateExplorationUi:\n${badLines.join('\n')}`);

  // Verify the function is still exported (not removed)
  assert(/^export\s+function\s+updateExplorationUi\s*\(/m.test(src),
    'lifecycle.js must still export updateExplorationUi as a named function');

  console.log('  PASS - no window.updateExplorationUi assignment in lifecycle.js');
}

// ---------------------------------------------------------------------------
// TEST 2: journey.js guarded window.syncSearchStatusForFocus call is preserved
//
// Rationale: journey.js applies search glow state by calling
// window.syncSearchStatusForFocus when searchGlowActive is set.
// This must remain a guarded call (typeof check) because the function is
// injected via search-lifecycle-adapter and may not be present in all contexts.
// A direct import of the lifecycle no-op stub would silently break search glow
// state propagation; the guarded window call is the correct pattern here.
// ---------------------------------------------------------------------------

function testJourneyGuardedSyncSearchStatusForFocus() {
  console.log('\n[TEST 2] journey.js guarded window.syncSearchStatusForFocus call preserved');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // Must have the guard pattern inside the searchGlowActive block
  const hasGuard = /searchGlowActive[\s\S]{0,300}typeof\s+window\.syncSearchStatusForFocus\s*===\s*['"]function['"]/.test(src);
  assert(hasGuard, 'journey.js must have typeof guard for window.syncSearchStatusForFocus in searchGlowActive block');

  // Must call window.syncSearchStatusForFocus (not a local import)
  const hasCall = /window\.syncSearchStatusForFocus\s*\(/.test(src);
  assert(hasCall, 'journey.js must call window.syncSearchStatusForFocus');

  console.log('  PASS - guarded window.syncSearchStatusForFocus call preserved');
}

// ---------------------------------------------------------------------------
// TEST 3: lifecycle.js does NOT import syncSearchStatusForFocus from journey
// (no import cycle: lifecycle must not depend on journey for this stub)
// ---------------------------------------------------------------------------

function testNoLifecycleJourneyCycle() {
  console.log('\n[TEST 3] lifecycle.js does not import syncSearchStatusForFocus from journey');

  const src = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  // lifecycle.js imports from journey.js (setTrailFromSeed, syncFocusStage, etc.)
  // but must NOT re-import syncSearchStatusForFocus from there
  const hasBadImport = /import\s+\{[^}]*\bsyncSearchStatusForFocus\b[^}]*\}\s+from\s+['"]\.\/journey\.js['"]/.test(src);
  assert(!hasBadImport, 'lifecycle.js must NOT import syncSearchStatusForFocus from journey.js (no cycle)');

  console.log('  PASS - no lifecycle to journey syncSearchStatusForFocus import cycle');
}

// ---------------------------------------------------------------------------
// TEST 4: journey.js does NOT import syncSearchStatusForFocus directly from lifecycle
// (safe boundary: journey uses the window bridge, not a direct import,
// to allow the search-lifecycle-adapter injection to take precedence)
// ---------------------------------------------------------------------------

function testJourneyDoesNotDirectImportSyncSearchStatusForFocus() {
  console.log('\n[TEST 4] journey.js does not directly import syncSearchStatusForFocus from lifecycle');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // journey.js imports many things from lifecycle (refreshCompositionState, dispatchNavTransition, etc.)
  // but syncSearchStatusForFocus should NOT be among them; the window bridge is intentional
  const hasDirectImport = /import\s+\{[^}]*\bsyncSearchStatusForFocus\b[^}]*\}\s+from\s+['"]\.\/lifecycle\.js['"]/.test(src);
  assert(!hasDirectImport,
    'journey.js must NOT directly import syncSearchStatusForFocus from lifecycle (window bridge is intentional)');

  console.log('  PASS - no direct journey to lifecycle syncSearchStatusForFocus import');
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function run() {
  console.log('=== lifecycle-journey-quick-dewindowing-contract ===');
  try {
    testLifecycleNoWindowUpdateExplorationUi();
    testJourneyGuardedSyncSearchStatusForFocus();
    testNoLifecycleJourneyCycle();
    testJourneyDoesNotDirectImportSyncSearchStatusForFocus();
    console.log('\nAll tests passed.');
    process.exit(0);
  } catch (err) {
    console.error(`\nFAILED: ${err.message}`);
    process.exit(1);
  }
}

run();
