/**
 * Semantic Explorer — UI Feedback
 * Extracted from lifecycle.js (Seam B).
 * Owns DOM status/toast feedback operations.
 * Lifecycle coordinates state; ui-feedback owns DOM presentation.
 */

import { state } from '../state.js';
import { isCompactMapViewport, isCompactSearchViewport } from './utils/ui-presentation.js';
import { formatBusinessName } from './utils/dom-formatters.js';
import { setActiveSearchResultRow } from './ui-renderers.js';
import { updateSearchTrailCue } from './ui-renderers.js';

/**
 * Show a toast notification on the experience-reset toast element.
 * @param {string} title
 * @param {string} copy
 */
export function showExperienceToast(title, copy) {
    const toast = document.getElementById('experience-reset-toast');
    if (!toast) return;
    const titleEl = document.getElementById('experience-toast-title');
    const copyEl = document.getElementById('experience-toast-copy');
    toast.setAttribute('aria-hidden', 'false');
    // Polite so the toast doesn't interrupt the user's current screen-reader
    // speech; "View restored" is a status confirmation, not a critical alert.
    toast.setAttribute('aria-live', 'polite');
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
    toast.classList.add('active');
    if (state.experienceResetToastTimer) {
        window.clearTimeout(state.experienceResetToastTimer);
    }
    state.experienceResetToastTimer = window.setTimeout(() => {
        toast.classList.remove('active');
        toast.setAttribute('aria-hidden', 'true');
        toast.setAttribute('aria-live', 'polite');
        if (titleEl) titleEl.textContent = '';
        if (copyEl) copyEl.textContent = '';
        state.experienceResetToastTimer = null;
    }, 2100);
}

/**
 * Sync search-status DOM element and trail cue when a point is focused.
 * Called after focus changes originating from search result clicks or
 * traversal steps.
 * @param {object} point
 * @param {object} [options]
 * @param {boolean} [options.fromSearchResult]
 * @param {boolean} [options.fromTraversal]
 */
export function syncSearchStatusForFocus(point, options = {}) {
    const statusEl = document.getElementById('search-status');
    const resultsEl = document.getElementById('search-results');
    if (!statusEl || !point || !state.currentSearchSummary) return;
    if (!resultsEl?.classList.contains('active')) return;
    const pointIndexByLeadId = point?.lead_id !== null && point?.lead_id !== undefined
        ? state.pointIndexByLeadId?.get?.(String(point.lead_id))
        : undefined;
    const pointIndex = Number.isFinite(pointIndexByLeadId)
        ? pointIndexByLeadId
        : state.points?.indexOf?.(point);
    const resultIndices = Array.isArray(state.currentSearchSummary.resultIndices)
        ? state.currentSearchSummary.resultIndices
        : [];
    const pointInResults = Number.isFinite(pointIndex) && resultIndices.includes(pointIndex);
    const focusedIndex = Number.isFinite(state.focusedNode)
        ? state.focusedNode
        : Number.isFinite(state.navState?.focusedIndex)
          ? state.navState.focusedIndex
          : null;
    const focusedPointOutsideResults = Number.isFinite(focusedIndex)
        && resultIndices.length > 0
        && !resultIndices.includes(focusedIndex);
    if (typeof setActiveSearchResultRow === 'function') {
        setActiveSearchResultRow(
            resultsEl,
            focusedPointOutsideResults
                ? null
                : options.fromTraversal && pointInResults ? state.navState.focusedIndex : pointInResults ? pointIndex : null
        );
    }

    const displayPoint = focusedPointOutsideResults && state.selectedPoint ? state.selectedPoint : point;
    const pointName = formatBusinessName(displayPoint.name);
    const queryLabel = state.currentSearchSummary.query
        ? `"${state.currentSearchSummary.query}"`
        : 'this connection path';
    const compactMapCopy = isCompactMapViewport();
    const compactGalaxyCopy = isCompactSearchViewport();

    if (focusedPointOutsideResults || !pointInResults) {
        statusEl.textContent = `${pointName} is focused outside ${queryLabel}. The ranked stack remains available as the current search trail.`;
        updateSearchTrailCue({
            beat: 'focus',
            kicker: 'Focused record',
            title: `${pointName} is focused`,
            note: `The ranked stack still shows ${queryLabel}; no result row is marked current because this record is outside that trail.`
        });
        return;
    }

    if (options.fromSearchResult) {
        statusEl.textContent = compactMapCopy
            ? `${pointName} is centered in ${queryLabel}. Preview in the stack or use Prev / Next to explore.`
            : compactGalaxyCopy
              ? `${pointName} is now centered. Use the pocket controls below to enter, inspect, or explore nearby stops.`
              : `${pointName} is centered in ${queryLabel}. Hover the stack to preview another pocket, or use Prev / Next to explore further.`;
        updateSearchTrailCue({
            beat: 'focus',
            kicker: 'Anchor locked',
            title: `${pointName} is now centered`,
            note: compactMapCopy
                ? 'Search opens a trail. Preview nearby matches in the stack or use Prev / Next to explore.'
                : compactGalaxyCopy
                  ? 'Search opens a trail. Enter the mycelium, inspect connections, or explore the nearby stops below.'
                  : 'Search opens a trail. Preview ranked matches in the stack, or use Prev / Next to explore outward from this neighborhood.'
        });
        return;
    }

    if (options.fromTraversal) {
        statusEl.textContent = compactMapCopy
            ? `${pointName} is centered in ${queryLabel}. Prev / Next explores nearby businesses.`
            : `${pointName} is now centered in ${queryLabel}. Use Prev / Next to explore nearby businesses, or the result stack to jump back into ranked matches.`;
        updateSearchTrailCue({
            beat: 'walk',
            kicker: 'Semantic exploration in progress',
            title: `Exploring from ${pointName}`,
            note: compactMapCopy
                ? 'Prev / Next keeps stepping through this nearby business trail.'
                : 'The trail is live now. Use Prev / Next to explore further, or jump sideways from the ranked stack.'
        });
        return;
    }

    statusEl.textContent = compactMapCopy
        ? `${pointName} is centered in ${queryLabel}. Preview or jump from the stack.`
        : `${pointName} is centered in ${queryLabel}. Use the result stack to preview or jump, or Prev / Next to explore nearby businesses.`;
    updateSearchTrailCue({
        beat: 'focus',
        kicker: 'Search opens a trail.',
        title: `${pointName} anchors this trail`,
        note: compactMapCopy
            ? 'Preview another match in the stack, or walk forward from this anchor.'
            : 'The ranked stack still shows the broader query, while this focus keeps the active anchor.'
    });
}
