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

const { state, withStateMutation } = await import('../js/state.ts');
const {
  getBoundedNeighborhoodWalkCandidate,
  getNextWalkCandidateForIndex,
} = await import('../js/modules/journey.ts');

const original = {
  points: state.points,
  pointIndexByLeadId: state.pointIndexByLeadId,
  semanticNeighborMapByLeadId: state.semanticNeighborMapByLeadId,
  navState: state.navState,
  currentView: state.currentView,
  activeFilters: state.activeFilters,
};

function seedPoints(count = 5) {
  withStateMutation(() => {
    const points = Array.from({ length: count }, (_, index) => ({
      index,
      lead_id: `lead-${index}`,
      name: `Business ${index}`,
      cluster: index % 3,
      city: index % 2 === 0 ? 'Conroe' : 'Magnolia',
      status: 'active',
    }));
    state.points = points;
    state.pointIndexByLeadId = new Map(points.map((point, index) => [point.lead_id, index]));
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

  const boundedForward = getBoundedNeighborhoodWalkCandidate(1, 0, { commit: true });
  assert(boundedForward?.index === 1, 'bounded walk should advance from anchor to first peer');
  assert(state.navState.neighborhoodCursor === 1, 'commit should update neighborhood cursor');

  const boundedBack = getBoundedNeighborhoodWalkCandidate(-1, 0, { commit: true });
  assert(boundedBack?.index === 3, 'bounded walk should wrap backward from anchor to last peer');
  assert(state.navState.neighborhoodCursor === 3, 'backward commit should update cursor');

  const boundedNext = getNextWalkCandidateForIndex(3, { commitNeighborhood: true });
  assert(boundedNext?.index === 0, 'next walk should use active bounded neighborhood before semantic pool');
  assert(state.navState.neighborhoodCursor === 0, 'next walk should commit bounded neighborhood cursor');

  withStateMutation(() => {
    state.navState.neighborhoodSource = 'none';
    state.semanticNeighborMapByLeadId = new Map([
      ['lead-0', {
        neighbors: [
          { leadId: 'lead-1', score: 0.82, semanticScore: 0.82, sameStatus: true, reason: 'semantic one' },
          { leadId: 'lead-2', score: 0.91, semanticScore: 0.91, sameStatus: true, reason: 'semantic two' },
        ],
      }],
    ]);
    state.navState.walkHistoryIndices = [1];
  });
  const semanticNext = getNextWalkCandidateForIndex(0, { allowNeighborhood: false, requireOnCanvas: false });
  assert(semanticNext?.index === 2, 'semantic walk should skip visited candidate and return next semantic candidate');
  assert(semanticNext?.source === 'semantic', 'semantic walk candidate should retain semantic source');

  withStateMutation(() => {
    state.semanticNeighborMapByLeadId = new Map();
    state.navState.threadCandidates = [
      { index: 4, source: 'geometric-fallback', reason: 'stored fallback' },
    ];
    state.navState.walkHistoryIndices = [];
  });
  const fallback = getNextWalkCandidateForIndex(0, {
    allowNeighborhood: false,
    requireSemantic: false,
    requireOnCanvas: false,
  });
  assert(fallback?.index === 4, 'stored thread candidate fallback should be used when semantic/geometric pool is empty');
} finally {
  withStateMutation(() => {
    state.points = original.points;
    state.pointIndexByLeadId = original.pointIndexByLeadId;
    state.semanticNeighborMapByLeadId = original.semanticNeighborMapByLeadId;
    state.navState = original.navState;
    state.currentView = original.currentView;
    state.activeFilters = original.activeFilters;
  });
}

console.log('PASS journey-walk-candidate-contract');
