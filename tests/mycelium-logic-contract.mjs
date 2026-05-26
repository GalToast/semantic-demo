/**
 * mycelium-logic-contract.mjs
 *
 * Fast Node contract test for js/modules/mycelium-engine.js
 *
 * Coverage:
 *   1. Intra-cluster neighbors with semanticScore >= 0.62       → corePairs
 *   2. Intra-cluster neighbors with semanticScore 0.42–0.61    → wispyPairs
 *   3. Cross-cluster neighbors with bridgeScore >= 0.62        → bridgePairs (max 2 per node)
 *   4. Cross-cluster neighbors with threadType including 'bridge' → bridgePairs
 *   5. Returns null when semanticNeighborMapByLeadId is empty
 *   6. Pair key deduplication (no duplicate pairs)
 *
 * Runs in Node with no Playwright, no DOM dependency.
 * Follows the style of connection-analysis-contract.mjs.
 *
 * Usage:
 *   node tests/mycelium-logic-contract.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SEMDEMO_ROOT = path.resolve(__dirname, '..');
const ENGINE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/mycelium-engine.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertArraysEqual(actual, expected, label) {
  const actualStr = JSON.stringify(actual.sort((a, b) => a.a - b.a || a.b - b.b));
  const expectedStr = JSON.stringify(expected.sort((a, b) => a.a - b.a || a.b - b.b));
  if (actualStr !== expectedStr) {
    throw new Error(`${label}: expected ${expectedStr}, got ${actualStr}`);
  }
}

// ---------------------------------------------------------------------------
// Fake DOM — not used by mycelium-engine but required by the import chain
// ---------------------------------------------------------------------------

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.classList = { add: () => {}, remove: () => {}, contains: () => false };
    this.dataset = {};
  }
  get textContent()    { return ''; }
  set textContent(v)   { }
  setAttribute(k, v)   { }
  getAttribute(k)       { return null; }
  removeAttribute(k)   { }
  addEventListener()    { }
  removeEventListener(){ }
}

globalThis.document = {
  body: new FakeElement('body'),
  getElementById: () => null,
  querySelectorAll: () => [],
};

Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'fake-uuid-test' },
  configurable: true,
  writable: true,
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const { state } = await import('../js/state.js');

function resetState() {
  state.points = [];
  state.nodePositions = [];
  state.semanticNeighborMapByLeadId = new Map();
  state.pointIndexByLeadId = new Map();
}

function buildTestState() {
  resetState();

  // Three points in cluster 1, with nodePositions for distance calculations
  state.points = [
    { lead_id: 'LI_001', cluster: 1 },
    { lead_id: 'LI_002', cluster: 1 },
    { lead_id: 'LI_003', cluster: 2 },
  ];

  state.nodePositions = [
    { x: 0.0,  y: 0.0,  z: 0.0  },  // index 0: LI_001
    { x: 0.05, y: 0.0, z: 0.0  },  // index 1: LI_002
    { x: 0.3,  y: 0.0, z: 0.0  },  // index 2: LI_003 (different cluster)
  ];

  state.pointIndexByLeadId = new Map([
    ['LI_001', 0],
    ['LI_002', 1],
    ['LI_003', 2],
  ]);

  // semanticNeighborMapByLeadId: lead_id → { neighbors: [ ... ] }
  //
  // LI_001 → LI_002 (same cluster, semanticScore 0.71 ≥ 0.62)  → corePairs
  // LI_001 → LI_003 (cross cluster, bridgeScore 0.75 ≥ 0.62)   → bridgePairs
  //
  // LI_002 → LI_001 (same cluster, semanticScore 0.65 ≥ 0.62)  → corePairs (dedup of above)
  // LI_002 → LI_003 (cross cluster, threadType 'bridge-thread') → bridgePairs
  //
  // LI_003 → LI_001 (cross cluster, semanticScore 0.55 < 0.42 → NOT bridgeLike) → ignored
  // LI_003 → LI_002 (cross cluster, bridgeScore 0.72 ≥ 0.62)  → bridgePairs
  state.semanticNeighborMapByLeadId = new Map([
    [
      'LI_001',
      {
        neighbors: [
          { leadId: 'LI_002', semanticScore: 0.71, bridgeScore: 0.0,  sameCity: false, threadType: 'intra-thread' },
          { leadId: 'LI_003', semanticScore: 0.30, bridgeScore: 0.75, sameCity: false, threadType: 'cross-cluster' },
        ]
      }
    ],
    [
      'LI_002',
      {
        neighbors: [
          { leadId: 'LI_001', semanticScore: 0.65, bridgeScore: 0.0,  sameCity: false, threadType: 'intra-thread' },
          { leadId: 'LI_003', semanticScore: 0.40, bridgeScore: 0.0,  sameCity: false, threadType: 'bridge-thread' },
        ]
      }
    ],
    [
      'LI_003',
      {
        neighbors: [
          { leadId: 'LI_001', semanticScore: 0.55, bridgeScore: 0.0,  sameCity: false, threadType: 'cross-cluster' },
          { leadId: 'LI_002', semanticScore: 0.20, bridgeScore: 0.72, sameCity: false, threadType: 'cross-cluster' },
        ]
      }
    ],
  ]);
}

// ---------------------------------------------------------------------------
// Test 1: corePairs — intra-cluster neighbor with semanticScore >= 0.62
// ---------------------------------------------------------------------------

async function testCorePairs() {
  console.log('\n[TEST] corePairs: intra-cluster neighbor with semanticScore >= 0.62');

  buildTestState();

  const engineUrl = pathToFileURL(ENGINE_PATH).href;
  const { buildSemanticMyceliumEdges } = await import(engineUrl);

  const result = buildSemanticMyceliumEdges();

  assert(result !== null, 'result must not be null when pairs exist');

  // LI_001 ↔ LI_002 (both same cluster 1, semanticScore 0.71 / 0.65 ≥ 0.62)
  // Both directions produce the same pair key so deduplication should keep one
  const corePairKeys = result.corePairs.map(p => {
    const a = Math.min(p.a, p.b);
    const b = Math.max(p.a, p.b);
    return `${a}:${b}`;
  });

  assert(corePairKeys.includes('0:1'), `corePairs should contain 0:1 (LI_001↔LI_002), got: ${JSON.stringify(result.corePairs)}`);

  console.log('  OK intra-cluster semanticScore >= 0.62 → corePairs');
}

// ---------------------------------------------------------------------------
// Test 2: wispyPairs — intra-cluster neighbor with semanticScore between 0.42–0.62
// ---------------------------------------------------------------------------

async function testWispyPairs() {
  console.log('\n[TEST] wispyPairs: intra-cluster neighbor with semanticScore 0.42–0.62');

  resetState();

  state.points = [
    { lead_id: 'LI_001', cluster: 1 },
    { lead_id: 'LI_002', cluster: 1 },
  ];

  state.nodePositions = [
    { x: 0.0, y: 0.0, z: 0.0 },
    { x: 0.06, y: 0.0, z: 0.0 },
  ];

  state.pointIndexByLeadId = new Map([
    ['LI_001', 0],
    ['LI_002', 1],
  ]);

  // LI_001 has neighbor with semanticScore 0.50 (between 0.42 and 0.62) — should land in wispyPairs
  state.semanticNeighborMapByLeadId = new Map([
    [
      'LI_001',
      {
        neighbors: [
          { leadId: 'LI_002', semanticScore: 0.50, bridgeScore: 0.0, sameCity: false, threadType: 'intra-thread' },
        ]
      }
    ],
    [
      'LI_002',
      {
        neighbors: [
          { leadId: 'LI_001', semanticScore: 0.50, bridgeScore: 0.0, sameCity: false, threadType: 'intra-thread' },
        ]
      }
    ],
  ]);

  const engineUrl = pathToFileURL(ENGINE_PATH).href;
  const { buildSemanticMyceliumEdges } = await import(engineUrl);

  const result = buildSemanticMyceliumEdges();

  assert(result !== null, 'result must not be null when pairs exist');
  assert(result.corePairs.length === 0, `corePairs should be empty, got: ${JSON.stringify(result.corePairs)}`);
  assert(result.wispyPairs.length > 0, `wispyPairs should not be empty, got: ${JSON.stringify(result.wispyPairs)}`);

  // Check the pair is for indices 0 and 1
  const wispyPairKeys = result.wispyPairs.map(p => {
    const a = Math.min(p.a, p.b);
    const b = Math.max(p.a, p.b);
    return `${a}:${b}`;
  });
  assert(wispyPairKeys.includes('0:1'), `wispyPairs should contain 0:1, got: ${wispyPairKeys}`);

  console.log('  OK intra-cluster semanticScore 0.42–0.62 → wispyPairs');
}

// ---------------------------------------------------------------------------
// Test 3: bridgePairs — cross-cluster neighbor with bridgeScore >= 0.62
// ---------------------------------------------------------------------------

async function testBridgePairsByBridgeScore() {
  console.log('\n[TEST] bridgePairs: cross-cluster neighbor with bridgeScore >= 0.62');

  resetState();

  state.points = [
    { lead_id: 'LI_001', cluster: 1 },
    { lead_id: 'LI_002', cluster: 2 },
  ];

  state.nodePositions = [
    { x: 0.0, y: 0.0, z: 0.0 },
    { x: 0.35, y: 0.0, z: 0.0 },
  ];

  state.pointIndexByLeadId = new Map([
    ['LI_001', 0],
    ['LI_002', 1],
  ]);

  // LI_001 → LI_002: cross-cluster, bridgeScore 0.75 >= 0.62 → bridgePairs
  state.semanticNeighborMapByLeadId = new Map([
    [
      'LI_001',
      {
        neighbors: [
          { leadId: 'LI_002', semanticScore: 0.30, bridgeScore: 0.75, sameCity: false, threadType: 'cross-cluster' },
        ]
      }
    ],
    [
      'LI_002',
      {
        neighbors: [
          { leadId: 'LI_001', semanticScore: 0.28, bridgeScore: 0.68, sameCity: false, threadType: 'cross-cluster' },
        ]
      }
    ],
  ]);

  const engineUrl = pathToFileURL(ENGINE_PATH).href;
  const { buildSemanticMyceliumEdges } = await import(engineUrl);

  const result = buildSemanticMyceliumEdges();

  assert(result !== null, 'result must not be null when bridge pairs exist');
  assert(result.bridgePairs.length > 0, `bridgePairs should not be empty, got: ${JSON.stringify(result.bridgePairs)}`);

  // Check bridge pair is for indices 0 and 1
  const bridgePairKeys = result.bridgePairs.map(p => {
    const a = Math.min(p.a, p.b);
    const b = Math.max(p.a, p.b);
    return `${a}:${b}`;
  });
  assert(bridgePairKeys.includes('0:1'), `bridgePairs should contain 0:1, got: ${bridgePairKeys}`);

  console.log('  OK cross-cluster bridgeScore >= 0.62 → bridgePairs');
}

// ---------------------------------------------------------------------------
// Test 4: bridgePairs — cross-cluster neighbor with threadType containing 'bridge'
// ---------------------------------------------------------------------------

async function testBridgePairsByThreadType() {
  console.log('\n[TEST] bridgePairs: cross-cluster neighbor with threadType containing "bridge"');

  resetState();

  state.points = [
    { lead_id: 'LI_001', cluster: 1 },
    { lead_id: 'LI_002', cluster: 2 },
  ];

  state.nodePositions = [
    { x: 0.0, y: 0.0, z: 0.0 },
    { x: 0.35, y: 0.0, z: 0.0 },
  ];

  state.pointIndexByLeadId = new Map([
    ['LI_001', 0],
    ['LI_002', 1],
  ]);

  // LI_001 → LI_002: cross-cluster, bridgeScore 0.0, threadType 'my-bridge-thread' (contains "bridge")
  state.semanticNeighborMapByLeadId = new Map([
    [
      'LI_001',
      {
        neighbors: [
          { leadId: 'LI_002', semanticScore: 0.30, bridgeScore: 0.0, sameCity: false, threadType: 'my-bridge-thread' },
        ]
      }
    ],
    [
      'LI_002',
      {
        neighbors: [
          { leadId: 'LI_001', semanticScore: 0.28, bridgeScore: 0.0, sameCity: false, threadType: 'cross-cluster' },
        ]
      }
    ],
  ]);

  const engineUrl = pathToFileURL(ENGINE_PATH).href;
  const { buildSemanticMyceliumEdges } = await import(engineUrl);

  const result = buildSemanticMyceliumEdges();

  assert(result !== null, 'result must not be null when bridge pairs exist');
  assert(result.bridgePairs.length > 0, `bridgePairs should not be empty, got: ${JSON.stringify(result.bridgePairs)}`);

  const bridgePairKeys = result.bridgePairs.map(p => {
    const a = Math.min(p.a, p.b);
    const b = Math.max(p.a, p.b);
    return `${a}:${b}`;
  });
  assert(bridgePairKeys.includes('0:1'), `bridgePairs should contain 0:1, got: ${bridgePairKeys}`);

  console.log('  OK cross-cluster threadType containing "bridge" → bridgePairs');
}

// ---------------------------------------------------------------------------
// Test 5: Returns null when semanticNeighborMapByLeadId is empty
// ---------------------------------------------------------------------------

async function testReturnsNullOnEmpty() {
  console.log('\n[TEST] Returns null when semanticNeighborMapByLeadId is empty');

  resetState();

  state.points = [
    { lead_id: 'LI_001', cluster: 1 },
  ];

  state.nodePositions = [
    { x: 0.0, y: 0.0, z: 0.0 },
  ];

  state.pointIndexByLeadId = new Map([
    ['LI_001', 0],
  ]);

  // semanticNeighborMapByLeadId is empty (size 0)
  state.semanticNeighborMapByLeadId = new Map();

  const engineUrl = pathToFileURL(ENGINE_PATH).href;
  const { buildSemanticMyceliumEdges } = await import(engineUrl);

  const result = buildSemanticMyceliumEdges();

  assert(result === null, `expected null for empty semanticNeighborMapByLeadId, got: ${JSON.stringify(result)}`);

  console.log('  OK empty semanticNeighborMapByLeadId → null');
}

// ---------------------------------------------------------------------------
// Test 6: Bridge pair max 2 per node
// ---------------------------------------------------------------------------

async function testBridgePairMaxPerNode() {
  console.log('\n[TEST] Bridge pairs: max 2 bridge pairs per node');

  resetState();

  // 5 points in two clusters
  state.points = [
    { lead_id: 'LI_001', cluster: 1 },
    { lead_id: 'LI_002', cluster: 2 },
    { lead_id: 'LI_003', cluster: 2 },
    { lead_id: 'LI_004', cluster: 2 },
    { lead_id: 'LI_005', cluster: 2 },
  ];

  state.nodePositions = [
    { x: 0.0,  y: 0.0, z: 0.0 },
    { x: 0.3,  y: 0.0, z: 0.0 },
    { x: 0.32, y: 0.0, z: 0.0 },
    { x: 0.34, y: 0.0, z: 0.0 },
    { x: 0.36, y: 0.0, z: 0.0 },
  ];

  state.pointIndexByLeadId = new Map([
    ['LI_001', 0],
    ['LI_002', 1],
    ['LI_003', 2],
    ['LI_004', 3],
    ['LI_005', 4],
  ]);

  // LI_001 has 4 cross-cluster neighbors, all with bridgeScore >= 0.62
  // but should be capped at 2 bridge pairs for LI_001
  state.semanticNeighborMapByLeadId = new Map([
    [
      'LI_001',
      {
        neighbors: [
          { leadId: 'LI_002', semanticScore: 0.30, bridgeScore: 0.75, sameCity: false, threadType: 'cross-cluster' },
          { leadId: 'LI_003', semanticScore: 0.28, bridgeScore: 0.80, sameCity: false, threadType: 'cross-cluster' },
          { leadId: 'LI_004', semanticScore: 0.25, bridgeScore: 0.70, sameCity: false, threadType: 'cross-cluster' },
          { leadId: 'LI_005', semanticScore: 0.22, bridgeScore: 0.65, sameCity: false, threadType: 'cross-cluster' },
        ]
      }
    ],
    [
      'LI_002',
      { neighbors: [{ leadId: 'LI_001', semanticScore: 0.30, bridgeScore: 0.75, sameCity: false, threadType: 'cross-cluster' }] }
    ],
    [
      'LI_003',
      { neighbors: [{ leadId: 'LI_001', semanticScore: 0.28, bridgeScore: 0.80, sameCity: false, threadType: 'cross-cluster' }] }
    ],
    [
      'LI_004',
      { neighbors: [{ leadId: 'LI_001', semanticScore: 0.25, bridgeScore: 0.70, sameCity: false, threadType: 'cross-cluster' }] }
    ],
    [
      'LI_005',
      { neighbors: [{ leadId: 'LI_001', semanticScore: 0.22, bridgeScore: 0.65, sameCity: false, threadType: 'cross-cluster' }] }
    ],
  ]);

  const engineUrl = pathToFileURL(ENGINE_PATH).href;
  const { buildSemanticMyceliumEdges } = await import(engineUrl);

  const result = buildSemanticMyceliumEdges();

  assert(result !== null, 'result must not be null when bridge pairs exist');

  // Count how many bridge pairs include node 0 (LI_001)
  const bridgePairsWithNode0 = result.bridgePairs.filter(p => p.a === 0 || p.b === 0);

  assert(bridgePairsWithNode0.length <= 2,
    `node 0 should have at most 2 bridge pairs, got: ${bridgePairsWithNode0.length} (${JSON.stringify(result.bridgePairs)})`);

  console.log(`  OK bridge pairs for node 0 capped at ${bridgePairsWithNode0.length} (max 2)`);
}

// ---------------------------------------------------------------------------
// Test 7: Pair key deduplication — no duplicate pairs in output
// ---------------------------------------------------------------------------

async function testPairKeyDeduplication() {
  console.log('\n[TEST] Pair key deduplication: no duplicate pairs in output');

  buildTestState();

  const engineUrl = pathToFileURL(ENGINE_PATH).href;
  const { buildSemanticMyceliumEdges } = await import(engineUrl);

  const result = buildSemanticMyceliumEdges();

  // Collect all pair keys across all categories
  const allKeys = [];
  for (const cat of ['corePairs', 'wispyPairs', 'bridgePairs']) {
    for (const pair of result[cat]) {
      const a = Math.min(pair.a, pair.b);
      const b = Math.max(pair.a, pair.b);
      allKeys.push(`${a}:${b}`);
    }
  }

  // Check for duplicates
  const seen = new Set();
  for (const key of allKeys) {
    assert(!seen.has(key), `Duplicate pair key found: ${key}`);
    seen.add(key);
  }

  console.log(`  OK ${allKeys.length} unique pairs, no duplicates`);
}

// ---------------------------------------------------------------------------
// Test 8: Cross-cluster neighbor with low bridgeScore and no "bridge" in threadType → ignored
// ---------------------------------------------------------------------------

async function testCrossClusterIgnored() {
  console.log('\n[TEST] Cross-cluster neighbor with low bridgeScore and no "bridge" threadType → ignored');

  resetState();

  state.points = [
    { lead_id: 'LI_001', cluster: 1 },
    { lead_id: 'LI_002', cluster: 2 },
  ];

  state.nodePositions = [
    { x: 0.0, y: 0.0, z: 0.0 },
    { x: 0.3, y: 0.0, z: 0.0 },
  ];

  state.pointIndexByLeadId = new Map([
    ['LI_001', 0],
    ['LI_002', 1],
  ]);

  // LI_001 → LI_002: cross-cluster, bridgeScore 0.20 (< 0.62), threadType 'generic-thread' (no "bridge")
  state.semanticNeighborMapByLeadId = new Map([
    [
      'LI_001',
      {
        neighbors: [
          { leadId: 'LI_002', semanticScore: 0.30, bridgeScore: 0.20, sameCity: false, threadType: 'generic-thread' },
        ]
      }
    ],
    [
      'LI_002',
      {
        neighbors: [
          { leadId: 'LI_001', semanticScore: 0.28, bridgeScore: 0.20, sameCity: false, threadType: 'generic-thread' },
        ]
      }
    ],
  ]);

  const engineUrl = pathToFileURL(ENGINE_PATH).href;
  const { buildSemanticMyceliumEdges } = await import(engineUrl);

  const result = buildSemanticMyceliumEdges();

  // No bridge pairs should be created, and no intra-cluster pairs since clusters differ
  assert(result === null || result.bridgePairs.length === 0,
    `cross-cluster without bridge-like should produce no bridgePairs, got: ${JSON.stringify(result)}`);

  console.log('  OK cross-cluster non-bridge-like neighbor correctly ignored');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('================================================================');
  console.log('mycelium-logic-contract.mjs');
  console.log('Fast contract test: buildSemanticMyceliumEdges logic');
  console.log('================================================================');

  try {
    await testCorePairs();
    await testWispyPairs();
    await testBridgePairsByBridgeScore();
    await testBridgePairsByThreadType();
    await testReturnsNullOnEmpty();
    await testBridgePairMaxPerNode();
    await testPairKeyDeduplication();
    await testCrossClusterIgnored();

    console.log('\n================================================================');
    console.log('ALL TESTS PASSED');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
