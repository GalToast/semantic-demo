'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

globalThis.document = {
  body: { dataset: {} },
  getElementById() { return null; },
  querySelector() { return null; },
};
globalThis.window = {};
globalThis.performance = { now: () => 0 };

const { state, withStateMutation } = await import('../src/lib/engine/state-bridge.ts');
const { buildNeighborhoodManifest } = await import('../js/modules/journey.ts');

const original = {
  points: state.points,
  pointIndexByLeadId: state.pointIndexByLeadId,
  semanticNeighborMapByLeadId: state.semanticNeighborMapByLeadId,
  nodePositions: state.nodePositions,
  navState: state.navState,
};

function seedNeighborhood() {
  const points = Array.from({ length: 5 }, (_, index) => ({
    index,
    lead_id: `lead-${index}`,
    name: `Business ${index}`,
    cluster: index % 3,
    city: index % 2 === 0 ? 'Conroe' : 'Magnolia',
    status: 'active',
  }));
  withStateMutation(() => {
    state.points = points;
    state.pointIndexByLeadId = new Map(points.map((point, index) => [point.lead_id, index]));
    state.nodePositions = points.map((_, index) => ({ x: index * 0.1, y: index * 0.05, z: index * 0.02 }));
    state.navState = {
      ...state.navState,
      neighborhoodAnchorIndex: 0,
      neighborhoodIndices: [1, 2, 3],
      neighborhoodReasonByIndex: new Map([[3, 'regional support route']]),
      threadCandidates: [
        { index: 1, score: 0.82, semanticScore: 0.82, source: 'semantic', reason: 'anchor-one' },
        { index: 2, score: 0.94, semanticScore: 0.94, source: 'semantic', reason: 'anchor-two' },
        { index: 3, score: 0.76, semanticScore: 0.76, source: 'semantic' },
      ],
    };
    state.semanticNeighborMapByLeadId = new Map([
      ['lead-0', {
        neighbors: [
          { leadId: 'lead-1', score: 0.82, semanticScore: 0.82, sameCity: false, sameStatus: true, threadType: 'fixture', reason: 'anchor-one' },
          { leadId: 'lead-2', score: 0.94, semanticScore: 0.94, sameCity: true, sameStatus: true, threadType: 'fixture', reason: 'anchor-two' },
          { leadId: 'lead-3', score: 0.76, semanticScore: 0.76, sameCity: false, sameStatus: true, threadType: 'fixture', reason: 'anchor-three' },
        ],
      }],
      ['lead-1', {
        neighbors: [
          { leadId: 'lead-2', score: 0.71, semanticScore: 0.71, reason: 'peer one two' },
          { leadId: 'lead-3', score: 0.55, semanticScore: 0.55, reason: 'peer one three' },
        ],
      }],
      ['lead-2', {
        neighbors: [
          { leadId: 'lead-1', score: 0.71, semanticScore: 0.71, reason: 'peer two one' },
          { leadId: 'lead-3', score: 0.64, semanticScore: 0.64, reason: 'peer two three' },
        ],
      }],
    ]);
  });
}

try {
  seedNeighborhood();

  const manifest = buildNeighborhoodManifest(0, [1, 2, 3, 2], { displayLimit: 3 });
  assert(manifest, 'manifest should be returned for valid anchor');
  assert(manifest.anchorIndex === 0, 'anchorIndex should be preserved');
  assert(manifest.displayLimit === 3, 'displayLimit should respect options');
  assert(manifest.candidates instanceof Map, 'candidates should be a Map');
  assert(manifest.candidates.get(0)?.role === 'anchor', 'anchor candidate should exist');
  assert(manifest.candidates.get(2)?.slotNumber === 1, 'highest scoring peer should be first slot');
  assert(manifest.candidateIndices.length === 3, 'candidateIndices should include unique displayed peers only');
  assert(!manifest.candidateIndices.includes(0), 'candidateIndices should not include anchor');
  assert(manifest.anchorEdgeCount === 3, 'anchor-peer edges should match displayed peers');
  assert(manifest.edges.some((edge) => edge.role === 'anchor-peer' && edge.a === 0 && edge.b === 2), 'anchor-peer edge should exist');
  assert(manifest.edges.some((edge) => edge.role === 'peer-peer' && edge.a === 1 && edge.b === 2), 'peer-peer edge should exist');
  assert(typeof manifest.hairballRisk === 'boolean', 'hairballRisk should be a boolean diagnostic');

  const limited = buildNeighborhoodManifest(0, [1, 2, 3], { displayLimit: 2 });
  assert(limited.candidateIndices.length === 2, 'displayLimit should cap candidate count');
  assert(limited.candidateIndices[0] === 2 && limited.candidateIndices[1] === 1, 'displayed peers should sort by score then index');

  assert(buildNeighborhoodManifest(99, [1, 2]) === null, 'invalid anchor should return null');
} finally {
  withStateMutation(() => {
    state.points = original.points;
    state.pointIndexByLeadId = original.pointIndexByLeadId;
    state.semanticNeighborMapByLeadId = original.semanticNeighborMapByLeadId;
    state.nodePositions = original.nodePositions;
    state.navState = original.navState;
  });
}

console.log('PASS journey-neighborhood-manifest-contract');
