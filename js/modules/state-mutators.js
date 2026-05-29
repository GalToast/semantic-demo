import { state, withStateMutation } from '../state.js';

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
