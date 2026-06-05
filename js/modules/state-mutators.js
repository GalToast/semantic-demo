import { state, withStateMutation } from '../state.js';

// State mutators. Each function updates the corresponding state field
// through withStateMutation() (so the proxy allows direct writes on
// CRITICAL_KEYS). No store syncs — only activeFilters and
// activeClusterFilter are mirrored to Svelte stores, and those syncs
// live in filter-state.js (the canonical owner).

export function setCurrentView(view) {
    withStateMutation(() => {
        state.currentView = view;
    });
}

export function setNavState(updates) {
    withStateMutation(() => {
        Object.assign(state.navState, updates);
    });
}

export function updateSemanticLaneState(newState) {
    withStateMutation(() => {
        state.semanticLaneState = newState;
    });
}

export function updateLoadingPhaseKey(key) {
    withStateMutation(() => {
        state.loadingPhaseKey = key;
    });
}

export function updateSemanticThreadsStatus(status) {
    withStateMutation(() => {
        state.semanticThreadsStatus = status;
    });
}
