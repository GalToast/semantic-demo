/**
 * Semantic Explorer — UI Feedback
 * Extracted from lifecycle.js (Seam B).
 * Owns DOM status/toast feedback operations.
 * Lifecycle coordinates state; ui-feedback owns DOM presentation.
 */

import { state } from '../state.js';
import {
    isCompactMapViewport,
    isCompactSearchViewport,
    formatBusinessName
} from '../utils.js';
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
    toast.setAttribute('aria-live', 'assertive');
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
    if (typeof setActiveSearchResultRow === 'function') {
        setActiveSearchResultRow(
            resultsEl,
            options.fromTraversal ? state.navState.focusedIndex : state.currentSearchSummary.anchorIndex
        );
    }

    const pointName = formatBusinessName(point.name);
    const queryLabel = state.currentSearchSummary.query
        ? `"${state.currentSearchSummary.query}"`
        : 'this connection path';
    const compactMapCopy = isCompactMapViewport();
    const compactGalaxyCopy = isCompactSearchViewport();

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