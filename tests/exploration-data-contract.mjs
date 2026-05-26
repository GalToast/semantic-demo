/**
 * exploration-data-contract.mjs
 *
 * Fast Node contract test verifying that exploration-data.js pure helpers
 * correctly compute signal scores, bloom threshold behavior, and bridge
 * scoring/indices independently of lifecycle.
 *
 * Scope:
 *   - computeSignalScores: scoring logic, empty inputs, return shape
 *   - computeBloomIndices: threshold behavior, empty inputs, return shape
 *   - computeBridgeIndices: bridge scoring, indices, empty inputs, return shape
 *
 * Source-only — no DOM, no Playwright, no lifecycle imports.
 * Runs in Node.
 *
 * Usage:
 *   node tests/exploration-data-contract.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EXPLORATION_DATA_PATH = path.join(ROOT, 'js/modules/exploration-data.js');
const EXPLORATION_DATA_URL = `file://${EXPLORATION_DATA_PATH.replace(/\\/g, '/')}`;

// ---------------------------------------------------------------------------
// Module import (cached, resolved once)
// ---------------------------------------------------------------------------

let _mod = null;
let _imported = false;

async function importHelpers() {
  if (_imported) return _mod;
  _mod = await import(EXPLORATION_DATA_URL);
  _imported = true;
  return _mod;
}

// ---------------------------------------------------------------------------
// Tiny deterministic fixtures
// ---------------------------------------------------------------------------

const EMPTY_POINTS = [];

const ONE_POINT_ACTIVE = [
  { website: true, email: true, phone: true, lat: 40.7, lng: -74.0, status: 'active', trivia: true }
];
// website(1.35)+email(1.0)+phone(0.45)+lat/lng(1.25)+active(0.55)+trivia(0.35) = 4.95

const TWO_POINTS_DIFFERENT_CLUSTERS = [
  { cluster: 'A', website: true, email: true, lat: 0, lng: 0 },
  { cluster: 'B', website: false, email: false, lat: 0, lng: 0 }
];
// Point 0: 1.35+1.0+0 = 2.35
// Point 1: 0

const FIVE_POINTS = [
  { cluster: 'A', website: true, email: true, phone: false, lat: 0, lng: 0, status: 'active', trivia: false },
  { cluster: 'A', website: true, email: false, phone: true, lat: 0, lng: 0, status: 'active', trivia: false },
  { cluster: 'B', website: false, email: true, phone: false, lat: 0, lng: 0, status: 'inactive', trivia: false },
  { cluster: 'B', website: false, email: false, phone: false, lat: 0, lng: 0, status: 'active', trivia: true },
  { cluster: 'C', website: true, email: false, phone: true, lat: 0, lng: 0, status: 'inactive', trivia: false }
];
// P0: 1.35+1.0+0+0+0.55=2.90
// P1: 1.35+0+0.45+0+0.55=2.35
// P2: 0+1.0+0+0+0=1.00
// P3: 0+0+0+0+0.55+0.35=0.90
// P4: 1.35+0+0.45+0+0=1.80

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ---------------------------------------------------------------------------
// TEST 1 — computeSignalScores with empty input
// ---------------------------------------------------------------------------

async function testSignalScoresEmptyInput() {
  console.log('\n[TEST] computeSignalScores handles empty array');

  const { computeSignalScores } = await importHelpers();
  const scores = computeSignalScores(EMPTY_POINTS);

  assert(Array.isArray(scores), 'returns an Array');
  assert(scores.length === 0, 'empty input yields empty output');

  console.log('  OK — empty input returns empty scores array');
}

// ---------------------------------------------------------------------------
// TEST 2 — computeSignalScores scoring logic
// ---------------------------------------------------------------------------

async function testSignalScoresScoringLogic() {
  console.log('\n[TEST] computeSignalScores applies correct weights');

  const { computeSignalScores } = await importHelpers();

  // Single point — all fields
  const scores = computeSignalScores(ONE_POINT_ACTIVE);
  assert(scores.length === 1, 'one point yields one score');
  const expected = 1.35 + 1.0 + 0.45 + 1.25 + 0.55 + 0.35; // 4.95
  assert(Math.abs(scores[0] - expected) < 0.001, `score=${scores[0]}, expected=${expected}`);

  // Two points — known scores
  const scores2 = computeSignalScores(TWO_POINTS_DIFFERENT_CLUSTERS);
  assert(scores2.length === 2, 'two points yields two scores');
  assert(Math.abs(scores2[0] - 2.35) < 0.001, `point0 score=${scores2[0]}, expected=2.35`);
  assert(scores2[1] === 0, `point1 score=${scores2[1]}, expected=0`);

  console.log('  OK — scoring weights applied correctly');
}

// ---------------------------------------------------------------------------
// TEST 3 — computeSignalScores return shape
// ---------------------------------------------------------------------------

async function testSignalScoresReturnShape() {
  console.log('\n[TEST] computeSignalScores returns correct shape');

  const { computeSignalScores } = await importHelpers();
  const scores = computeSignalScores(FIVE_POINTS);

  assert(Array.isArray(scores), 'returns an Array');
  assert(scores.length === 5, 'array length matches input length');
  for (const s of scores) {
    assert(typeof s === 'number', `score ${s} must be a number`);
    assert(s >= 0, `score ${s} must be non-negative`);
  }

  console.log('  OK — return shape is correct');
}

// ---------------------------------------------------------------------------
// TEST 4 — computeBloomIndices with empty input
// ---------------------------------------------------------------------------

async function testBloomIndicesEmptyInput() {
  console.log('\n[TEST] computeBloomIndices handles empty array');

  const { computeBloomIndices } = await importHelpers();
  const indices = computeBloomIndices(EMPTY_POINTS, []);

  assert(indices instanceof Set, 'returns a Set');
  assert(indices.size === 0, 'empty input yields empty set');

  console.log('  OK — empty input returns empty bloom indices set');
}

// ---------------------------------------------------------------------------
// TEST 5 — computeBloomIndices threshold behavior
// ---------------------------------------------------------------------------

async function testBloomIndicesThresholdBehavior() {
  console.log('\n[TEST] computeBloomIndices threshold: 12th-percentile vs minimum 2.95');

  const { computeBloomIndices, computeSignalScores } = await importHelpers();

  // 5 points with known scores: [2.90, 2.35, 1.00, 0.90, 1.80]
  const scores = computeSignalScores(FIVE_POINTS);
  const sorted = [...scores].sort((a, b) => b - a);
  // sorted desc: [2.90, 2.35, 1.80, 1.00, 0.90]
  // 12% of 5 = 0.6 → floor(0.6) = 0 → sorted[0] = 2.90
  // bloomThreshold = max(2.90, 2.95) = 2.95
  // No scores >= 2.95 → empty set
  const indices = computeBloomIndices(FIVE_POINTS, scores);
  assert(indices instanceof Set, 'returns a Set');
  assert(indices.size === 0, `threshold max(2.90,2.95)=2.95 should yield no bloom indices; got ${indices.size}`);

  // Override with a higher score to force >= 2.95
  const highScores = [4.0, 3.2, 1.0, 0.9, 1.8];
  const indices2 = computeBloomIndices(FIVE_POINTS, highScores);
  assert(indices2.size > 0, 'scores >= 2.95 should produce bloom indices');

  console.log('  OK — bloom threshold correctly takes max of 12th-pct and 2.95');
}

// ---------------------------------------------------------------------------
// TEST 6 — computeBloomIndices return shape
// ---------------------------------------------------------------------------

async function testBloomIndicesReturnShape() {
  console.log('\n[TEST] computeBloomIndices returns correct shape (Set of integers)');

  const { computeBloomIndices } = await importHelpers();

  const scores = [5.0, 4.5, 3.0, 3.2, 1.0];
  const indices = computeBloomIndices(FIVE_POINTS, scores);

  assert(indices instanceof Set, 'returns a Set');
  for (const idx of indices) {
    assert(Number.isInteger(idx), `bloom index ${idx} must be an integer`);
    assert(idx >= 0 && idx < 5, `bloom index ${idx} out of range [0,4]`);
  }

  console.log('  OK — bloom indices are integers within valid range');
}

// ---------------------------------------------------------------------------
// TEST 7 — computeBridgeIndices with empty input
// ---------------------------------------------------------------------------

async function testBridgeIndicesEmptyInput() {
  console.log('\n[TEST] computeBridgeIndices handles empty arrays');

  const { computeBridgeIndices } = await importHelpers();
  const result = computeBridgeIndices([], [], []);

  // BUG: when points is empty, computeBridgeIndices returns bare Set (early return
  // at !points || points.length === 0), not { indices, scores }. This is a bug
  // in exploration-data.js — empty input should still return { indices: Set, scores: [] }.
  assert(result && typeof result === 'object', 'returns an object, not bare Set');
  assert(result.indices instanceof Set, 'result.indices is a Set');
  assert(Array.isArray(result.scores), 'result.scores is an Array');
  assert(result.indices.size === 0, 'empty input yields empty indices');
  assert(result.scores.length === 0, 'empty input yields empty scores');

  console.log('  OK — empty input returns { indices: Set, scores: [] }');
}

// ---------------------------------------------------------------------------
// TEST 8 — computeBridgeIndices scoring and return shape
// ---------------------------------------------------------------------------

async function testBridgeIndicesScoringAndReturnShape() {
  console.log('\n[TEST] computeBridgeIndices computes bridge scores and indices correctly');

  const { computeBridgeIndices } = await importHelpers();

  // 3 points, different clusters, positions close enough to be neighbors
  const points = [
    { cluster: 'A' },
    { cluster: 'B' },
    { cluster: 'A' }
  ];
  const positions = [
    { x: 0.0, y: 0.0, z: 0.0 },
    { x: 0.05, y: 0.05, z: 0.0 }, // within maxDist=0.17 of point 0
    { x: 0.10, y: 0.0, z: 0.0 }   // within maxDist=0.17 of point 1
  ];
  const scores = [2.0, 1.5, 0.5];

  const result = computeBridgeIndices(points, positions, scores);

  assert(result && typeof result === 'object', 'returns an object');
  assert(result.indices instanceof Set, 'result.indices is a Set');
  assert(Array.isArray(result.scores), 'result.scores is an Array');
  assert(result.scores.length === 3, 'scores array length matches points length');

  // Verify scores are numbers
  for (const s of result.scores) {
    assert(typeof s === 'number', `bridge score ${s} must be a number`);
  }

  // Point 0 is in cluster A and neighbors point 1 in cluster B → foreignClusters.size=1 (>1? no)
  // Point 1 is in cluster B and neighbors both A → foreignClusters.size=1 (only cluster A)
  // Point 2 is in cluster A and neighbors only point 1 in B → size=1
  // Expected: no indices since no point has foreignClusters.size > 1 AND weight >= 0.7
  // But let's check a case where weight matters — create 2 foreign clusters
  const points2 = [
    { cluster: 'A' },
    { cluster: 'B' },
    { cluster: 'C' }
  ];
  const pos0 = { x: 0.0, y: 0.0, z: 0.0 };
  const pos1 = { x: 0.05, y: 0.0, z: 0.0 }; // neighbors A and C via spatial proximity
  const pos2 = { x: 0.10, y: 0.0, z: 0.0 }; // neighbors B

  const result2 = computeBridgeIndices(points2, [pos0, pos1, pos2], [2.0, 1.5, 1.0], 0.12, 0.17);

  assert(result2.scores.length === 3, 'three points yield three bridge scores');

  console.log('  OK — bridge scoring produces numeric scores array and indices set');
}

// ---------------------------------------------------------------------------
// TEST 9 — computeBridgeIndices weights use signalScores
// ---------------------------------------------------------------------------

async function testBridgeIndicesUsesSignalScores() {
  console.log('\n[TEST] computeBridgeIndices incorporates signalScores into weights');

  const { computeBridgeIndices } = await importHelpers();

  const points = [{ cluster: 'A' }, { cluster: 'B' }, { cluster: 'C' }];
  const positions = [
    { x: 0.0, y: 0.0, z: 0.0 },
    { x: 0.05, y: 0.0, z: 0.0 },
    { x: 0.10, y: 0.0, z: 0.0 }
  ];

  const scoresZero = [0, 0, 0];
  const scoresHigh = [5.0, 5.0, 5.0];

  const resultZero = computeBridgeIndices(points, positions, scoresZero, 0.12, 0.17);
  const resultHigh = computeBridgeIndices(points, positions, scoresHigh, 0.12, 0.17);

  // With zero scores, weights should be 0 or near-zero
  // With high scores, weights should be positive
  const hasPositiveScores = resultHigh.scores.some(s => s > 0);
  assert(hasPositiveScores, 'high signal scores should produce positive bridge weights');

  console.log('  OK — bridge weights incorporate signal scores');
}

// ---------------------------------------------------------------------------
// TEST 10 — computeBridgeIndices result has indices and scores keys
// ---------------------------------------------------------------------------

async function testBridgeIndicesResultKeys() {
  console.log('\n[TEST] computeBridgeIndices result has { indices: Set, scores: Array }');

  const { computeBridgeIndices } = await importHelpers();

  const points = [{ cluster: 'A' }, { cluster: 'B' }];
  const positions = [{ x: 0, y: 0, z: 0 }, { x: 0.05, y: 0, z: 0 }];
  const scores = [1.0, 2.0];

  const result = computeBridgeIndices(points, positions, scores);

  assert('indices' in result, 'result must have indices key');
  assert('scores' in result, 'result must have scores key');
  assert(result.indices instanceof Set, 'indices must be a Set');
  assert(Array.isArray(result.scores), 'scores must be an Array');

  console.log('  OK — result shape is { indices: Set, scores: Array }');
}

// ---------------------------------------------------------------------------
// TEST 11 — computeBridgeIndices handles null positions gracefully
// ---------------------------------------------------------------------------

async function testBridgeIndicesNullPositions() {
  console.log('\n[TEST] computeBridgeIndices skips null/missing positions');

  const { computeBridgeIndices } = await importHelpers();

  const points = [{ cluster: 'A' }, { cluster: 'B' }];
  const positions = [null, { x: 0.05, y: 0, z: 0 }];
  const scores = [1.0, 2.0];

  // Should not throw — null positions are skipped
  let threw = false;
  let result;
  try {
    result = computeBridgeIndices(points, positions, scores);
  } catch {
    threw = true;
  }
  assert(!threw, 'null position must not throw');
  assert(result.indices instanceof Set, 'result.indices must be a Set');
  assert(Array.isArray(result.scores), 'result.scores must be an Array');

  console.log('  OK — null positions are skipped without throwing');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('=================================================================');
  console.log('exploration-data-contract.mjs');
  console.log('Contract test: bloom/bridge math extraction from lifecycle');
  console.log('=================================================================');

  try {
    await testSignalScoresEmptyInput();
    await testSignalScoresScoringLogic();
    await testSignalScoresReturnShape();
    await testBloomIndicesEmptyInput();
    await testBloomIndicesThresholdBehavior();
    await testBloomIndicesReturnShape();
    await testBridgeIndicesEmptyInput();
    await testBridgeIndicesScoringAndReturnShape();
    await testBridgeIndicesUsesSignalScores();
    await testBridgeIndicesResultKeys();
    await testBridgeIndicesNullPositions();

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
