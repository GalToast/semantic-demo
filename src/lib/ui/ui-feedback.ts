/**
 * @lib/ui/ui-feedback.ts — DOM status/toast feedback operations
 *
 * Port of js/modules/ui-feedback.ts.
 * Provides `showExperienceToast` (transient toast) and `syncSearchStatusForFocus`
 * (announces the focused point's relationship to the active search stack).
 */
import { state, type Point } from '@legacy-js/state';
import {
    getCurrentSearchSummary,
    getPointIndexByLeadId,
    getPoints,
    getFocusedNode,
    getNavState,
    getSelectedPoint,
} from '@legacy-js/state/selectors/index';
import { isCompactMapViewport, isCompactSearchViewport } from '@lib/utils/ui-presentation';
import { formatBusinessName } from '@lib/utils/dom-formatters';
import { setActiveSearchResultRow, updateSearchTrailCue } from '@legacy-js/modules/ui-renderers';

export function showExperienceToast(title: string, copy: string): void {
    const toast = document.getElementById('experience-reset-toast');
    if (!toast) return;
    const titleEl = document.getElementById('experience-toast-title');
    const copyEl = document.getElementById('experience-toast-copy');
    toast.setAttribute('aria-hidden', 'false');
    toast.setAttribute('aria-live', 'polite');
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
    toast.classList.add('active');
    if (state.experienceResetToastTimer) {
        clearTimeout(state.experienceResetToastTimer);
    }
    state.experienceResetToastTimer = setTimeout(() => {
        toast.classList.remove('active');
        toast.setAttribute('aria-hidden', 'true');
        toast.setAttribute('aria-live', 'polite');
        if (titleEl) titleEl.textContent = '';
        if (copyEl) copyEl.textContent = '';
        state.experienceResetToastTimer = null;
    }, 2100);
}

export interface SyncSearchStatusOptions {
    fromSearchResult?: boolean;
    fromTraversal?: boolean;
}

export function syncSearchStatusForFocus(point: Point, options: SyncSearchStatusOptions = {}): void {
    const statusEl = document.getElementById('search-status');
    const resultsEl = document.getElementById('search-results');
    if (!statusEl || !point || !getCurrentSearchSummary()) return;
    if (!resultsEl?.classList.contains('active')) return;

    const pointIndexByLeadId = point?.lead_id !== null && point?.lead_id !== undefined
        ? (getPointIndexByLeadId() as Map<string | number, number> | undefined)?.get?.(String(point.lead_id))
        : undefined;
    const pointIndex = Number.isFinite(pointIndexByLeadId)
        ? pointIndexByLeadId
        : (getPoints() as Point[] | undefined)?.indexOf?.(point);
    const resultIndices = Array.isArray((getCurrentSearchSummary() as unknown as Record<string, unknown> | null)?.resultIndices)
        ? (getCurrentSearchSummary() as unknown as Record<string, unknown>).resultIndices as number[]
        : [];
    const pointInResults = Number.isFinite(pointIndex) && resultIndices.includes(pointIndex as number);
    const focusedIndex = Number.isFinite(getFocusedNode())
        ? getFocusedNode()
        : Number.isFinite(getNavState()?.focusedIndex)
          ? getNavState()!.focusedIndex
          : null;
    const focusedPointOutsideResults = Number.isFinite(focusedIndex)
        && resultIndices.length > 0
        && !resultIndices.includes(focusedIndex!);
    if (typeof setActiveSearchResultRow === 'function') {
        setActiveSearchResultRow(
            resultsEl,
            focusedPointOutsideResults
                ? null
                : options.fromTraversal && pointInResults ? getNavState()?.focusedIndex : pointInResults ? pointIndex : null
        );
    }

    const displayPoint = focusedPointOutsideResults && getSelectedPoint() ? getSelectedPoint() : point;
    const pointName = formatBusinessName(displayPoint!.name);
    const searchSummary = getCurrentSearchSummary() as unknown as Record<string, unknown> | null;
    const queryLabel = searchSummary?.query
        ? `"${searchSummary.query}"`
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
