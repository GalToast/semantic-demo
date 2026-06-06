/**
 * lifecycle-journey-quick-dewindowing-contract.mjs
 *
 * Contract test for Batch 1 quick dewindowing:
 * - Verifies lifecycle.js does NOT assign window.updateExplorationUi
 * - Verifies journey-point-color.js routes search status through the event bus
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
const JOURNEY_POINT_COLOR_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey-point-color.js');

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

  // Verify the function is still exported (not removed) — could be re-exported
  // from lifecycle-modes.js via lifecycle.js grouped re-export
  const exportAsFunction = /^export\s+function\s+updateExplorationUi\s*\(/m.test(src);
  const exportAsReexport = /export\s*\{[^}]*\bupdateExplorationUi\b[^}]*\}/.test(src);
  assert(exportAsFunction || exportAsReexport,
    'lifecycle.js must still export updateExplorationUi as a named function (direct or re-export)');

  console.log('  PASS - no window.updateExplorationUi assignment in lifecycle.js');
}

// ---------------------------------------------------------------------------
// TEST 2: journey-point-color.js routes search status through the event bus
//
// Rationale: point-color applies search glow state by calling the injected
// search status event. This preserves the decoupled boundary without a raw
// window bridge, lifecycle import, or retired lifecycle adapter.
// ---------------------------------------------------------------------------

function testPointColorAdapterSyncSearchStatusForFocus() {
  console.log('\n[TEST 2] journey-point-color.js routes search status through the event bus');

  const src = fs.readFileSync(JOURNEY_POINT_COLOR_PATH, 'utf-8');

  assert(
    /import\s+\{\s*publish,\s*EVENTS\s*\}\s+from\s+['"]\.\/event-bus\.js['"]/.test(src),
    'journey-point-color.js must import publish and EVENTS from event-bus.js'
  );

  const hasPublication = /searchGlowActive[\s\S]{0,650}\bpublish\(EVENTS\.SEARCH_STATUS_SYNC_REQUESTED/.test(src);
  assert(hasPublication, 'journey-point-color.js must publish SEARCH_STATUS_SYNC_REQUESTED in searchGlowActive block');

  assert(!/window\.syncSearchStatusForFocus\b/.test(src), 'journey-point-color.js must not call window.syncSearchStatusForFocus');
  assert(!/search-lifecycle-adapter/.test(src), 'journey-point-color.js must not import the retired search lifecycle adapter');

  console.log('  PASS - search status routed through event bus');
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
// TEST 4: journey-point-color.js does NOT import syncSearchStatusForFocus directly from lifecycle
// (safe boundary: point-color uses an event request, not lifecycle)
// ---------------------------------------------------------------------------

function testPointColorDoesNotDirectImportSyncSearchStatusForFocus() {
  console.log('\n[TEST 4] journey-point-color.js does not directly import syncSearchStatusForFocus from lifecycle');

  const src = fs.readFileSync(JOURNEY_POINT_COLOR_PATH, 'utf-8');

  // syncSearchStatusForFocus should NOT be imported from lifecycle; the event
  // bus request is the decoupled boundary.
  const hasDirectImport = /import\s+\{[^}]*\bsyncSearchStatusForFocus\b[^}]*\}\s+from\s+['"]\.\/lifecycle\.js['"]/.test(src);
  assert(!hasDirectImport,
    'journey-point-color.js must NOT directly import syncSearchStatusForFocus from lifecycle');

  console.log('  PASS - no direct point-color to lifecycle syncSearchStatusForFocus import');
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function run() {
  console.log('=== lifecycle-journey-quick-dewindowing-contract ===');
  try {
    testLifecycleNoWindowUpdateExplorationUi();
    testPointColorAdapterSyncSearchStatusForFocus();
    testNoLifecycleJourneyCycle();
    testPointColorDoesNotDirectImportSyncSearchStatusForFocus();
    console.log('\nAll tests passed.');
    process.exit(0);
  } catch (err) {
    console.error(`\nFAILED: ${err.message}`);
    process.exit(1);
  }
}

run();
