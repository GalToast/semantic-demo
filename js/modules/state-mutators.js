import { state, withStateMutation } from '../state.js';
import {
    currentViewStore,
    loadingPhaseKeyStore,
    semanticThreadsStatusStore
} from './stores.js';

// State-to-store sync helpers (state.js contract; see header).
// Each helper mirrors the write to the corresponding Svelte store. The store
// value is cloned for objects to avoid reference aliasing.

function syncCurrentViewStore(view) {
    currentViewStore.set(view);
}

function syncLoadingPhaseKeyStore(key) {
    loadingPhaseKeyStore.set(key);
}

function syncSemanticThreadsStatusStore(status) {
    semanticThreadsStatusStore.set(status);
}

export function setCurrentView(view) {
    withStateMutation(() => {
        state.currentView = view;
    });
    syncCurrentViewStore(view);
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
    syncLoadingPhaseKeyStore(key);
}

export function updateSemanticThreadsStatus(status) {
    withStateMutation(() => {
        state.semanticThreadsStatus = status;
    });
    syncSemanticThreadsStatusStore(status);
}
