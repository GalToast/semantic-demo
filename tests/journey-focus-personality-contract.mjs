'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

globalThis.document = {
  body: { dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } } },
  createElement() { return { dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } }, style: {} }; },
  querySelector() { return null; },
  getElementById() { return null; },
};

globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  __DEBUG_PROBES__: false,
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  performance: { now: () => 0 },
};
globalThis.performance = globalThis.window.performance;
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;

const { state } = await import('../src/lib/engine/state-bridge.ts');
const { getNeighborhoodPersonality } = await import('../js/modules/focus-pocket.ts');

const original = {
  points: state.points,
  semanticNeighborMapByLeadId: state.semanticNeighborMapByLeadId,
  pointIndexByLeadId: state.pointIndexByLeadId,
  recentArrangements: state.recentArrangements,
  trailDepth: state.trailDepth,
};

function seedSemanticNeighbors(count, score = 0.9) {
  const points = Array.from({ length: count + 1 }, (_, index) => ({
    index,
    lead_id: `lead-${index}`,
    name: `Business ${index}`,
    cluster: index % 5,
    city: index % 2 === 0 ? 'Conroe' : 'Magnolia',
  }));
  const pointIndexByLeadId = new Map(points.map((point, index) => [point.lead_id, index]));
  const semanticNeighborMapByLeadId = new Map();
  semanticNeighborMapByLeadId.set('lead-0', {
    neighbors: points.slice(1).map((point, offset) => ({
      leadId: point.lead_id,
      score,
      semanticScore: score,
      sameCity: point.city === points[0].city,
      sameStatus: true,
      bridgeScore: offset % 2 === 0 ? 0.8 : 0.3,
      signalScore: score,
      threadType: 'fixture_semantic_neighbor',
      reason: 'fixture semantic neighbor',
    })),
  });

  state.points = points;
  state.pointIndexByLeadId = pointIndexByLeadId;
  state.semanticNeighborMapByLeadId = semanticNeighborMapByLeadId;
}

try {
  seedSemanticNeighbors(9, 0.9);
  state.trailDepth = 0;
  state.recentArrangements = [];
  const dense = getNeighborhoodPersonality(0);
  assert(dense.type === 'DENSE_HUB', `dense semantic neighborhood should select DENSE_HUB, got ${dense.type}`);
  assert(dense.cameraArc === 'wide', 'DENSE_HUB should use wide camera arc');
  assert(dense.compressionMult === 0.82, 'DENSE_HUB compression multiplier should be stable');
  assert(state.recentArrangements.at(-1) === 'DENSE_HUB', 'selected personality should be recorded');

  seedSemanticNeighbors(9, 0.9);
  state.trailDepth = 0;
  state.recentArrangements = ['DENSE_HUB', 'DENSE_HUB', 'DENSE_HUB'];
  const guarded = getNeighborhoodPersonality(0);
  assert(guarded.type === 'BRIDGE_NODE', `repetition guard should skip repeated DENSE_HUB, got ${guarded.type}`);
  assert(guarded.motifOverride === 'lattice', 'BRIDGE_NODE motif override should stay lattice');
  assert(state.recentArrangements.at(-1) === 'BRIDGE_NODE', 'fallback selected personality should be recorded');

  seedSemanticNeighbors(2, 0.72);
  state.trailDepth = 0;
  state.recentArrangements = [];
  const edge = getNeighborhoodPersonality(0);
  assert(edge.type === 'EDGE_NODE', `low-degree semantic neighborhood should select EDGE_NODE, got ${edge.type}`);
  assert(edge.motifOverride === 'delta', 'EDGE_NODE motif override should stay delta');

  seedSemanticNeighbors(9, 0.9);
  state.trailDepth = 2;
  state.recentArrangements = ['BRIDGE_NODE'];
  const beforeLength = state.recentArrangements.length;
  const deepDive = getNeighborhoodPersonality(0);
  assert(deepDive.type === 'DEEP_DIVE', `trailDepth=2 should force DEEP_DIVE, got ${deepDive.type}`);
  assert(deepDive.motifOverride === 'rosette', 'DEEP_DIVE motif override should stay rosette');
  assert(deepDive.easing === 'easeOutBack', 'DEEP_DIVE easing should stay easeOutBack');
  assert(state.recentArrangements.length === beforeLength, 'DEEP_DIVE early return should not mutate recent arrangements');
} finally {
  state.points = original.points;
  state.semanticNeighborMapByLeadId = original.semanticNeighborMapByLeadId;
  state.pointIndexByLeadId = original.pointIndexByLeadId;
  state.recentArrangements = original.recentArrangements;
  state.trailDepth = original.trailDepth;
}

console.log('PASS journey-focus-personality-contract');
