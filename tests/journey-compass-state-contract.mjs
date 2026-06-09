import assert from 'node:assert/strict';

globalThis.document = {
  querySelector(selector) {
    if (selector === '.search-container') return globalThis.__searchContainer || null;
    return null;
  },
};

globalThis.window = {
  getRouteEmbodimentIndices: () => [],
};

const { state, withStateMutation } = await import('../js/state.ts');
const {
  getFocusedJourneyPoint,
  getJourneyCompassState,
} = await import('../js/modules/journey-compass-state.ts');

function resetState() {
  withStateMutation(() => {
    state.currentView = 'galaxy';
    state.currentSearchSummary = null;
    state.selectedPoint = null;
    state.focusedNode = null;
    state.points = [];
    state.semanticDiveMode = false;
    state.semanticLaneSnapshot = { state: 'degraded' };
    state.navState = {
      ...(state.navState || {}),
      focusedIndex: null,
      explorationHistoryIndices: [],
    };
  });
  globalThis.__searchContainer = null;
}

function fakeSearchContainer({ beat = 'idle', searching = false, focusing = false } = {}) {
  return {
    dataset: { trailBeat: beat },
    classList: {
      contains(name) {
        return (name === 'searching' && searching) || (name === 'focusing' && focusing);
      },
    },
  };
}

resetState();
assert.equal(getFocusedJourneyPoint(), null, 'no focus returns null');

const selectedPoint = { name: 'Selected Business', cluster: 2 };
const indexedPoint = { name: 'Indexed Business', cluster: 4 };
withStateMutation(() => {
  state.points = [indexedPoint];
  state.focusedNode = 0;
  state.selectedPoint = selectedPoint;
});
assert.equal(getFocusedJourneyPoint(), selectedPoint, 'selectedPoint wins over focusedNode');

resetState();
let compassState = getJourneyCompassState();
assert.equal(compassState.phase, 'overview', 'empty state is overview phase');
assert.equal(typeof compassState.discovery, 'boolean', 'overview exposes discovery boolean');
assert.equal(compassState.primaryAction?.action, 'focus-search', 'overview primary action focuses search');

withStateMutation(() => {
  state.currentSearchSummary = { query: 'roof repair', anchorIndex: 0 };
});
globalThis.__searchContainer = fakeSearchContainer();
compassState = getJourneyCompassState();
assert.equal(compassState.phase, 'search', 'search summary without focus is search phase');
assert.equal(compassState.primaryAction?.action, 'center-anchor', 'search phase can center anchor');

withStateMutation(() => {
  state.points = [{ name: 'Anchor Business', cluster: 1 }];
  state.focusedNode = 0;
  state.navState.focusedIndex = 0;
});
compassState = getJourneyCompassState();
assert.equal(compassState.phase, 'focus', 'focused point is focus phase');
assert.equal(compassState.primaryAction?.action, 'enter-inside', 'search anchor focus exposes enter-inside as primary action');
assert.equal(compassState.secondaryAction?.action, 'open-map', 'search anchor focus exposes open-map as secondary action');

withStateMutation(() => {
  state.currentView = 'map';
});
compassState = getJourneyCompassState();
assert.equal(compassState.phase, 'map', 'map view wins phase priority');
assert.equal(compassState.primaryAction?.action, 'open-mycelium', 'map primary action returns to mycelium');

console.log('journey compass state contract passed');
