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

const { state, withStateMutation } = await import('./helpers/canonical-state.mjs');
const {
  getBoundedNeighborhoodWalkCandidate,
  getNextWalkCandidateForIndex,
  primeBoundedSemanticNeighborhoodForTraversal,
} = await import('../src/lib/journey/journey.ts');
const { get } = await import('svelte/store');
const {
  businessRecords,
  pointIndexByLeadId: pointIndexByLeadIdStore,
  semanticNeighborMap,
  positionBuffer,
} = await import('../src/lib/data-store.ts');

const original = {
  points: state.points,
  pointIndexByLeadId: state.pointIndexByLeadId,
  semanticNeighborMapByLeadId: state.semanticNeighborMapByLeadId,
  nodePositions: state.nodePositions,
  navState: state.navState,
  currentView: state.currentView,
  activeFilters: state.activeFilters,
  businessRecords: get(businessRecords),
  pointIndexByLeadIdStore: get(pointIndexByLeadIdStore),
  semanticNeighborMap: get(semanticNeighborMap),
  positionBuffer: get(positionBuffer),
};

function seedPoints(count = 5) {
  const points = Array.from({ length: count }, (_, index) => ({
    index,
    lead_id: `lead-${index}`,
    name: `Business ${index}`,
    cluster: index % 3,
    city: index % 2 === 0 ? 'Conroe' : 'Magnolia',
    status: 'active',
  }));
  const indexMap = new Map(points.map((point, index) => [point.lead_id, index]));
  const neighborMap = new Map([
    ['lead-0', {
      neighbors: [
        { leadId: 'lead-1', score: 0.8, semanticScore: 0.8, sameStatus: true, reason: 'candidate one' },
        { leadId: 'lead-2', score: 0.9, semanticScore: 0.9, sameStatus: true, reason: 'candidate two' },
        { leadId: 'lead-3', score: 0.7, semanticScore: 0.7, sameStatus: true, reason: 'candidate three' },
      ],
    }],
  ]);
  const positions = new Float32Array(count * 3);
  points.forEach((_, index) => {
    positions[index * 3] = index * 0.1;
    positions[index * 3 + 1] = index * 0.05;
    positions[index * 3 + 2] = index * 0.02;
  });

  businessRecords.set(points);
  pointIndexByLeadIdStore.set(indexMap);
  semanticNeighborMap.set(neighborMap);
  positionBuffer.set(positions);

  withStateMutation(() => {
    state.points = points;
    state.pointIndexByLeadId = indexMap;
    state.semanticNeighborMapByLeadId = neighborMap;
    state.nodePositions = points.map((_, index) => ({ x: index * 0.1, y: index * 0.05, z: index * 0.02 }));
    state.activeFilters = { status: 'all', city: 'all', website: false, email: false, geocoded: false };
  });
}

try {
  seedPoints();
  withStateMutation(() => {
    state.currentView = 'galaxy';
    state.navState = {
      ...state.navState,
      focusedIndex: 0,
      neighborhoodAnchorIndex: 0,
      neighborhoodIndices: [1, 2, 3],
      neighborhoodSource: 'semantic',
      neighborhoodCursor: 0,
      neighborhoodReasonByIndex: new Map(),
      threadCandidates: [
        { index: 1, score: 0.8, semanticScore: 0.8, source: 'semantic', reason: 'candidate one' },
        { index: 2, score: 0.9, semanticScore: 0.9, source: 'semantic', reason: 'candidate two' },
      ],
      walkHistoryIndices: [],
    };
  });
  assert(primeBoundedSemanticNeighborhoodForTraversal(0), 'bounded semantic neighborhood should prime from seeded stores');

  const boundedForward = getBoundedNeighborhoodWalkCandidate(1, 0, { commit: true });
  assert(boundedForward?.index === 1, 'bounded walk should advance from anchor to first peer');
  assert(state.navState.trailNeighborIndices[0] === 1, 'commit should update trail neighbor indices');

  const boundedBack = getBoundedNeighborhoodWalkCandidate(-1, 0, { commit: true });
  assert(boundedBack?.index === 2, 'non-positive bounded step should start from the highest scoring peer');
  assert(state.navState.trailNeighborIndices[0] === 2, 'bounded commit should replace trail neighbor indices');

  const boundedNext = getNextWalkCandidateForIndex(3, { commitNeighborhood: true });
  assert(boundedNext?.index === 2, 'next walk should use active bounded neighborhood when semantic pool is empty');

  withStateMutation(() => {
    state.navState.neighborhoodSource = 'none';
    const nextMap = new Map([
      ['lead-0', {
        neighbors: [
          { leadId: 'lead-1', score: 0.82, semanticScore: 0.82, sameStatus: true, reason: 'semantic one' },
          { leadId: 'lead-2', score: 0.91, semanticScore: 0.91, sameStatus: true, reason: 'semantic two' },
        ],
      }],
    ]);
    state.semanticNeighborMapByLeadId = nextMap;
    semanticNeighborMap.set(nextMap);
    state.navState.walkHistoryIndices = [1];
  });
  const semanticNext = getNextWalkCandidateForIndex(0, { allowNeighborhood: false, requireOnCanvas: false });
  assert(semanticNext?.index === 2, 'semantic walk should skip visited candidate and return next semantic candidate');
  assert(semanticNext?.source === 'semantic', 'semantic walk candidate should retain semantic source');

  withStateMutation(() => {
    state.semanticNeighborMapByLeadId = new Map();
    state.navState.walkHistoryIndices = [];
  });
  semanticNeighborMap.set(new Map());
  const fallback = getNextWalkCandidateForIndex(0, {
    allowNeighborhood: false,
    requireSemantic: false,
    requireOnCanvas: false,
  });
  assert(fallback?.source === 'semantic' || fallback?.source === 'geometric-fallback', 'fallback should return a bounded or geometric candidate when semantic pool is empty');
} finally {
  withStateMutation(() => {
    state.points = original.points;
    state.pointIndexByLeadId = original.pointIndexByLeadId;
    state.semanticNeighborMapByLeadId = original.semanticNeighborMapByLeadId;
    state.nodePositions = original.nodePositions;
    state.navState = original.navState;
    state.currentView = original.currentView;
    state.activeFilters = original.activeFilters;
  });
  businessRecords.set(original.businessRecords);
  pointIndexByLeadIdStore.set(original.pointIndexByLeadIdStore);
  semanticNeighborMap.set(original.semanticNeighborMap);
  positionBuffer.set(original.positionBuffer);
}

console.log('PASS journey-walk-candidate-contract');
