// js/modules/connection-analysis-adapter.js
// Thin adapter boundary: decouples connection-analysis.js from raw global DOM ids
// and raw state shape. Provides DOM refs and a state snapshot.

import { state } from '../state.js';

/**
 * Returns a snapshot of the state fields connection-analysis.js cares about.
 * @returns {{ focusedNode: number|null, points: Array, currentSearchSummary: object|null }}
 */
export function getConnectionStateSnapshot() {
    return {
        focusedNode: state.focusedNode,
        points: state.points,
        currentSearchSummary: state.currentSearchSummary,
    };
}

/**
 * Returns DOM element by id — extracted so the caller has no direct document.getElementById.
 * @param {string} id
 * @returns {Element|null}
 */
export function getElementById(id) {
    return document.getElementById(id);
}

// ---------------------------------------------------------------------------
// DOM ref helpers — one function per element used by connection-analysis.js
// ---------------------------------------------------------------------------

/** summary-text: shown on early-return when no search/focus is available */
export function getSummaryTextEl() {
    return document.getElementById('summary-text');
}

/** semantic-summary-card: receives is-synthesizing class during load */
export function getSummaryCardEl() {
    return document.getElementById('semantic-summary-card');
}

/** summary-gemma-story: toggled visible/hidden during load */
export function getStoryNoteEl() {
    return document.getElementById('summary-gemma-story');
}

/** summary-gemma-story-text: populated with story text or error message */
export function getStoryTextEl() {
    return document.getElementById('summary-gemma-story-text');
}

/** summary-gemma-story-source: populated with source name / cache age info */
export function getStorySourceEl() {
    return document.getElementById('summary-gemma-story-source');
}