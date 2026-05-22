/**
 * thread-inspector-dewindowing-contract.mjs
 *
 * Fast Node contract test for thread-inspector.js backward-compatible window surface.
 *
 * Coverage:
 *   1. window.exploreThreadNeighbor is explicitly exposed as the single direct window assignment.
 *   2. The expose is constrained, documented, and NOT wrapped in a broad wildcard.
 *   3. All other thread-inspector functions are exposed via window._ti debug namespace only.
 *   4. No other window.* assignments exist in thread-inspector.js beyond the two known exposes.
 *   5. A comment documents the purpose and constraint of the window.exploreThreadNeighbor expose.
 *   6. The expose is at the end of the file, clearly separated from window._ti block.
 *
 * This contract exists so future dewindowing work cannot accidentally widen the window surface
 * beyond window.exploreThreadNeighbor (the backward-compatibility seam) and window._ti (debug ns).
 *
 * Runs in Node — no Playwright, no browser, no DOM.
 * Source-only assertions via string search + structural analysis.
 *
 * Usage:
 *   node tests/thread-inspector-dewindowing-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const THREAD_INSPECTOR_PATH = path.join(SEMDEMO_ROOT, 'js/modules/thread-inspector.js');

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
// TEST 1: window.exploreThreadNeighbor is explicitly exposed at end of file
// ---------------------------------------------------------------------------

function testExploreThreadNeighborExplicitExpose() {
  console.log('\n[TEST] window.exploreThreadNeighbor explicit expose at end of file');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  // The direct expose must exist — this is the backward-compatibility seam
  assertContains(src, 'window.exploreThreadNeighbor = exploreThreadNeighbor',
    'window.exploreThreadNeighbor explicitly assigned');

  // It must appear at the END of the file (after window._ti block)
  const lastOccurrence = src.lastIndexOf('window.exploreThreadNeighbor = exploreThreadNeighbor');
  const tiBlockStart = src.lastIndexOf('window._ti = {');
  assert(lastOccurrence > tiBlockStart,
    'window.exploreThreadNeighbor expose appears after window._ti block (at end of file)');

  // There must be a comment above it explaining the backward-compat purpose
  // The preceding ~200 chars should contain a comment referencing lifecycle or backward-compat
  const preceding = src.slice(Math.max(0, lastOccurrence - 250), lastOccurrence);
  const hasComment = /[/][/]|\/\*| Also expose|backward|for callers that use|lifecycle/.test(preceding);
  assert(hasComment, 'window.exploreThreadNeighbor expose has a comment documenting its purpose');

  console.log('  OK window.exploreThreadNeighbor explicitly exposed with documentation');
}

// ---------------------------------------------------------------------------
// TEST 2: window._ti is the debug namespace and contains all internal functions
// ---------------------------------------------------------------------------

function testWindowTiDebugNamespace() {
  console.log('\n[TEST] window._ti debug namespace contains all internal functions');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  // window._ti block must exist
  assert(src.includes('window._ti = {'), 'window._ti namespace exposed');

  const tiStart = src.indexOf('window._ti = {');
  const tiEnd = src.indexOf('};', tiStart);
  const tiBlock = src.slice(tiStart, tiEnd + 2);

  // All expected functions must be in window._ti (trailing comma optional on last entry)
  const expectedTiExports = [
    'getSemanticThreadCandidates',
    'getGeometricThreadCandidates',
    'getThreadCandidatesForIndex',
    'setStrandContinuityState',
    'clearStrandContinuityState',
    'getStrandArrivalNote',
    'getThreadInspectionState',
    'renderThreadInspection',
    'inspectThreadNeighbor',
    'pinThreadNeighbor',
    'unpinThreadInspection',
    'scheduleCanvasThreadInspectionClear',
    'clearThreadInspection',
    'exploreThreadNeighbor',
    'syncInspectedStrandOverlay',
    'updateInspectedStrandOverlay',
    'disposeInspectedStrandOverlay'
  ];

  for (const fn of expectedTiExports) {
    // Match fn with optional trailing comma, or at end-of-block with no comma
    const lastFn = expectedTiExports[expectedTiExports.length - 1];
    const isLast = fn === lastFn;
    assert(
      isLast
        ? (tiBlock.includes(fn) && tiBlock.includes('};'))
        : (tiBlock.includes(fn + ',') || tiBlock.includes(fn + '\n')),
      `window._ti contains ${fn}`
    );
  }

  console.log('  OK window._ti debug namespace verified');
}

// ---------------------------------------------------------------------------
// TEST 3: No other window.* direct assignments beyond window._ti and window.exploreThreadNeighbor
// ---------------------------------------------------------------------------

function testNoOtherWindowAssignments() {
  console.log('\n[TEST] No other window.* direct assignments in thread-inspector.js');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  // Find all window.XXX = YYY patterns (direct assignment, not declaration)
  const windowAssignments = [];
  const re = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?!function|const|let|var|import)/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    windowAssignments.push(match[0]);
  }

  // Filter to only those with a simple identifier on the RHS (not a function keyword)
  const directExposes = windowAssignments.filter(line => {
    return line.includes('= ') && !line.includes('= function') && !line.includes('= () =>');
  });

  for (const assignment of directExposes) {
    const fnMatch = assignment.match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
    if (fnMatch) {
      const fn = fnMatch[1];
      // Only window._ti and window.exploreThreadNeighbor are allowed
      assert(
        fn === '_ti' || fn === 'exploreThreadNeighbor',
        `thread-inspector.js: unexpected window.${fn} assignment. Only window._ti and window.exploreThreadNeighbor are allowed.`
      );
    }
  }

  console.log('  OK no unexpected window.* direct assignments');
}

// ---------------------------------------------------------------------------
// TEST 4: The window.exploreThreadNeighbor expose is NOT inside window._ti block
// ---------------------------------------------------------------------------

function testExploreThreadNeighborOutsideTiBlock() {
  console.log('\n[TEST] window.exploreThreadNeighbor is outside window._ti block');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  const tiStart = src.indexOf('window._ti = {');
  const tiEnd = src.indexOf('};', tiStart);
  const lastExploreOccurrence = src.lastIndexOf('window.exploreThreadNeighbor = exploreThreadNeighbor');

  // window.exploreThreadNeighbor must appear after the window._ti block closes
  assert(lastExploreOccurrence > tiEnd,
    'window.exploreThreadNeighbor is outside and after window._ti block');

  console.log('  OK window.exploreThreadNeighbor is cleanly separated from window._ti block');
}

// ---------------------------------------------------------------------------
// TEST 5: window.exploreThreadNeighbor comment documents backward-compat purpose
// ---------------------------------------------------------------------------

function testBackwardCompatDocumentation() {
  console.log('\n[TEST] window.exploreThreadNeighbor backward-compat documentation');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  // The comment must mention callers that depend on this window expose
  // and that it is for backward compatibility with lifecycle.js
  const lastExploreIdx = src.lastIndexOf('window.exploreThreadNeighbor = exploreThreadNeighbor');
  const preceding = src.slice(Math.max(0, lastExploreIdx - 300), lastExploreIdx);

  const documented = /lifecycle|backward|callers that use|window\.exploreThreadNeighbor/.test(preceding);
  assert(documented, 'window.exploreThreadNeighbor has a comment documenting backward-compat purpose');

  // The comment should not be vague — it should reference the specific consumers
  const hasSpecificRef = /lifecycle|event-bindings|window\.exploreThreadNeighbor/.test(preceding);
  assert(hasSpecificRef, 'backward-compat comment references specific consumers (lifecycle, event-bindings, etc.)');

  console.log('  OK backward-compat documentation is specific and present');
}

// ---------------------------------------------------------------------------
// TEST 6: No wildcard or dynamic window[key] assignments in thread-inspector.js
// ---------------------------------------------------------------------------

function testNoWildcardWindowAssignments() {
  console.log('\n[TEST] No wildcard or dynamic window[key] assignments');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  // No window[...] = ... patterns (dynamic/indirect exposure)
  const dynamicWindowRe = /window\[.*\]\s*=/;
  assert(!dynamicWindowRe.test(src), 'No dynamic window[key] assignment pattern found');

  // No for-in loop over window
  assert(!src.includes('for (const k in window)'), 'No for-in over window pattern');
  assert(!src.includes('for (const key in window)'), 'No for-in over window pattern');

  // No Object.assign(window, ...) patterns
  assert(!src.includes('Object.assign(window'), 'No Object.assign(window, ...) pattern');

  console.log('  OK no wildcard or dynamic window assignments');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('============================================================');
  console.log('thread-inspector-dewindowing-contract.mjs');
  console.log('Contract test: thread-inspector backward-compatible window surface');
  console.log('============================================================');

  try {
    testExploreThreadNeighborExplicitExpose();
    testWindowTiDebugNamespace();
    testNoOtherWindowAssignments();
    testExploreThreadNeighborOutsideTiBlock();
    testBackwardCompatDocumentation();
    testNoWildcardWindowAssignments();

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