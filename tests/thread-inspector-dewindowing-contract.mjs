/**
 * thread-inspector-dewindowing-contract.mjs
 *
 * Fast Node contract test for thread-inspector.js backward-compatible window surface.
 *
 * Coverage:
 *   1. window.exploreThreadNeighbor direct assignment has been removed (Wave70).
 *   2. _ti.exploreThreadNeighbor remains for diagnostic access.
 *   3. All other thread-inspector functions are exposed via window._ti debug namespace only.
 *   4. No other window.* assignments exist in thread-inspector.js beyond window._ti.
 *   5. A comment documents the Wave70 removal and diagnostic-only state of _ti.exploreThreadNeighbor.
 *   6. window.exploreThreadNeighbor does NOT appear as a direct window assignment.
 *
 * This contract exists so future dewindowing work cannot accidentally re-widen the window surface.
 * Only window._ti (diagnostic namespace) is allowed — no bare window.fn direct assignments.
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

// Returns the window._ti block content for direct inspection
function getWindowTiBlock(src) {
  const tiStart = src.indexOf('window._ti = {');
  assert(tiStart !== -1, 'window._ti = { block found');
  const tiEnd = src.indexOf('};', tiStart);
  return src.slice(tiStart, tiEnd + 2);
}

// TEST 1: window.exploreThreadNeighbor direct assignment removed (Wave70)
// ---------------------------------------------------------------------------

function testExploreThreadNeighborDirectAssignmentRemoved() {
  console.log('\n[TEST] window.exploreThreadNeighbor direct assignment removed (Wave70)');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  // The direct window.exploreThreadNeighbor = ... assignment must NOT exist
  assertNotContains(src, 'window.exploreThreadNeighbor = exploreThreadNeighbor',
    'window.exploreThreadNeighbor direct assignment removed');

  // window._ti.exploreThreadNeighbor (diagnostic access) MUST exist
  const tiBlock = getWindowTiBlock(src);
  assert(tiBlock.includes('exploreThreadNeighbor'),
    '_ti.exploreThreadNeighbor diagnostic access remains');

  // A comment documenting the Wave70 removal must exist near end of file
  const last300 = src.slice(Math.max(0, src.length - 400));
  const hasWave70Comment = /Wave70|diagnostic|removed|window\._ti/.test(last300);
  assert(hasWave70Comment, 'Wave70 removal comment present at end of file');

  console.log('  OK window.exploreThreadNeighbor removed; _ti.exploreThreadNeighbor diagnostic remains');
}

// TEST 2: window._ti is the debug namespace and contains all internal functions
// ---------------------------------------------------------------------------

function testWindowTiDebugNamespace() {
  console.log('\n[TEST] window._ti debug namespace contains all internal functions');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  assert(src.includes('window._ti = {'), 'window._ti namespace exposed');

  const tiBlock = getWindowTiBlock(src);

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

// TEST 3: No other window.* direct assignments beyond window._ti
// Only window._ti is allowed as a direct window assignment (diagnostic namespace).
// window.exploreThreadNeighbor has been removed (Wave70).

function testNoOtherWindowAssignments() {
  console.log('\n[TEST] No other window.* direct assignments in thread-inspector.js');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  const windowAssignments = [];
  const re = /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?!function|const|let|var|import)/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    windowAssignments.push(match[0]);
  }

  const directExposes = windowAssignments.filter(line => {
    return line.includes('= ') && !line.includes('= function') && !line.includes('= () =>');
  });

  for (const assignment of directExposes) {
    const fnMatch = assignment.match(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
    if (fnMatch) {
      const fn = fnMatch[1];
      // Only window._ti is allowed — window.exploreThreadNeighbor removed (Wave70)
      assert(
        fn === '_ti',
        `thread-inspector.js: unexpected window.${fn} assignment. Only window._ti is allowed.`
      );
    }
  }

  console.log('  OK no unexpected window.* direct assignments');
}

// TEST 4: window.exploreThreadNeighbor direct assignment is absent
// (Wave70 removal — only window._ti is allowed now)

function testExploreThreadNeighborDirectAssignmentAbsent() {
  console.log('\n[TEST] window.exploreThreadNeighbor direct assignment is absent');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  const lastExploreOccurrence = src.lastIndexOf('window.exploreThreadNeighbor = exploreThreadNeighbor');
  assert(lastExploreOccurrence === -1,
    'window.exploreThreadNeighbor direct assignment removed (not found)');

  // Verify _ti.exploreThreadNeighbor still exists in diagnostic namespace
  const tiBlock = getWindowTiBlock(src);
  assert(tiBlock.includes('exploreThreadNeighbor'),
    '_ti.exploreThreadNeighbor diagnostic access is intact');

  console.log('  OK window.exploreThreadNeighbor direct assignment absent; _ti diagnostic intact');
}

// TEST 5: Wave70 removal comment is specific and accurate
// The comment at end of file must document the Wave70 removal state accurately.

function testWave70RemovalComment() {
  console.log('\n[TEST] Wave70 removal comment documents current state');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  const last300 = src.slice(Math.max(0, src.length - 400));

  // Must reference Wave70 and explain removal
  assert(/Wave70/.test(last300), 'Wave70 reference in removal comment');
  // Must acknowledge diagnostic path via _ti
  assert(/_ti/.test(last300), 'Diagnostic namespace _ti mentioned in removal comment');
  // Must reference walkThreadNeighbor as the active seam
  assert(/walkThreadNeighbor/.test(last300), 'walkThreadNeighbor active seam acknowledged');

  console.log('  OK Wave70 removal comment is accurate and specific');
}

// TEST 6: No wildcard or dynamic window[key] assignments in thread-inspector.js
// ---------------------------------------------------------------------------

function testNoWildcardWindowAssignments() {
  console.log('\n[TEST] No wildcard or dynamic window[key] assignments');

  const src = fs.readFileSync(THREAD_INSPECTOR_PATH, 'utf-8');

  const dynamicWindowRe = /window\[.*\]\s*=/;
  assert(!dynamicWindowRe.test(src), 'No dynamic window[key] assignment pattern found');

  assert(!src.includes('for (const k in window)'), 'No for-in over window pattern');
  assert(!src.includes('for (const key in window)'), 'No for-in over window pattern');

  assert(!src.includes('Object.assign(window'), 'No Object.assign(window, ...) pattern');

  console.log('  OK no wildcard or dynamic window assignments');
}

// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('============================================================');
  console.log('thread-inspector-dewindowing-contract.mjs');
  console.log('Contract test: thread-inspector backward-compatible window surface');
  console.log('============================================================');

  try {
    testExploreThreadNeighborDirectAssignmentRemoved();
    testWindowTiDebugNamespace();
    testNoOtherWindowAssignments();
    testExploreThreadNeighborDirectAssignmentAbsent();
    testWave70RemovalComment();
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
