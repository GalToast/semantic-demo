/**
 * pathfinding-contract.mjs
 *
 * Fast Node contract test for the semantic pathfinding debug module.
 *
 * Coverage:
 *   1. Module can be imported in Node without a browser window.
 *   2. Highest-semantic-score route can beat a weak direct route.
 *   3. Missing IDs and disconnected targets return null.
 *
 * Usage:
 *   node tests/pathfinding-contract.mjs
 */

import assert from 'node:assert/strict';
import { state } from '../src/lib/engine/state-bridge.ts';
import { findSemanticPath } from '../legacy-reference/pathfinding.ts';

const original = {
  points: state.points,
  pointIndexByLeadId: state.pointIndexByLeadId,
  semanticNeighborMapByLeadId: state.semanticNeighborMapByLeadId
};

function setFixture() {
  state.points = [
    { lead_id: 'a' },
    { lead_id: 'b' },
    { lead_id: 'c' },
    { lead_id: 'd' }
  ];
  state.pointIndexByLeadId = new Map([
    ['a', 0],
    ['b', 1],
    ['c', 2],
    ['d', 3]
  ]);
  state.semanticNeighborMapByLeadId = new Map([
    ['a', { neighbors: [
      { leadId: 'd', semanticScore: 0.1 },
      { leadId: 'b', semanticScore: 0.95 }
    ] }],
    ['b', { neighbors: [
      { leadId: 'c', semanticScore: 0.95 }
    ] }],
    ['c', { neighbors: [
      { leadId: 'd', semanticScore: 0.95 }
    ] }],
    ['d', { neighbors: [] }]
  ]);
}

function restoreFixture() {
  state.points = original.points;
  state.pointIndexByLeadId = original.pointIndexByLeadId;
  state.semanticNeighborMapByLeadId = original.semanticNeighborMapByLeadId;
}

function testSemanticRouteBeatsWeakDirectRoute() {
  setFixture();
  assert.deepEqual(findSemanticPath('a', 'd'), ['a', 'b', 'c', 'd']);
}

function testMissingIdsReturnNull() {
  setFixture();
  withMutedConsole(() => {
    assert.equal(findSemanticPath('missing', 'd'), null);
    assert.equal(findSemanticPath('a', 'missing'), null);
  });
}

function testDisconnectedTargetReturnsNull() {
  setFixture();
  state.semanticNeighborMapByLeadId.set('c', { neighbors: [] });
  assert.deepEqual(findSemanticPath('a', 'd'), ['a', 'd']);
  state.semanticNeighborMapByLeadId.set('a', { neighbors: [{ leadId: 'b', semanticScore: 0.95 }] });
  withMutedConsole(() => {
    assert.equal(findSemanticPath('a', 'd'), null);
  });
}

function withMutedConsole(fn) {
  const originalWarn = console.warn;
  const originalInfo = console.info;
  console.warn = () => {};
  console.info = () => {};
  try {
    fn();
  } finally {
    console.warn = originalWarn;
    console.info = originalInfo;
  }
}

try {
  assert.equal(typeof findSemanticPath, 'function');
  assert.equal(typeof globalThis.window, 'undefined');
  testSemanticRouteBeatsWeakDirectRoute();
  testMissingIdsReturnNull();
  testDisconnectedTargetReturnsNull();
  console.log('pathfinding-contract passed');
} finally {
  restoreFixture();
}
