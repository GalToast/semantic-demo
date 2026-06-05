/**
 * url-state.ts
 *
 * Typed sibling of url-state.js.
 * Manages bidirectional URL state synchronization (history, search params,
 * view, filters, story, mode, depth, record/anchor).
 */

import { state } from '../state.js';
import { subscribe, publish, EVENTS } from './event-bus.js';
import {
    MODE_DESCRIPTIONS,
    STORY_DESCRIPTIONS,
    applyStoryPrompt,
    focusOnPoint,
    showExperienceToast,
    syncFilterControls,
    setMyceliumMode,
    syncSearchStatusForFocus,
} from './lifecycle.js';
import { switchView } from './view-controller.js';
import { recordSemanticLaneSnapshot, setSemanticLaneOpsMode, refreshSemanticLaneOpsSummary } from './semantic-lane.js';
import { isPointVisible } from './utils/geo-data.js';
import { formatBusinessName, escapeHtml } from './utils/dom-formatters.js';
import { restoreActiveFiltersFromUrl, restoreActiveClusterFilterFromUrl } from './filter-state.js';
import {
    activateSearchGlow,
    applyFilters,
    getFilteredIndices,
    search,
    setActiveSearchResultRow,
    updateSearchStatusMessage,
    updateSearchTrailCue,
} from './search-state.js';
import { updateHasQuery } from './bindings/search-bindings.js';
import { setCurrentView } from './state-mutators.js';
import { getCurrentView, getFocusedNode, getSelectedPoint, getPoints, getMyceliumMode, getActiveClusterFilter, getActiveFilters, getCurrentSearchSummary, getTrailDepth, getActiveStoryPrompt, getApplyingUrlState, getRestoringBrowserHistory, getUrlStateRestoreToken, getSemanticLaneOpsMode, getDeferredUrlStateHandler } from '../state/selectors/index.js';
import { getLocation } from './environment.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface UrlStateOptions {
    fromHistory?: boolean;
    historyState?: {
        params?: { record?: string; lead?: string };
        [key: string]: unknown;
    };
    force?: boolean;
}

interface UpdateUrlStateOptions {
    reason?: string;
    mode?: string;
    force?: boolean;
}

interface Point {
    lead_id?: string | number;
    name?: string;
    [key: string]: unknown;
}

// ── URL State ──────────────────────────────────────────────────────────────

function getRequestedUrlDepth(params: URLSearchParams): number {
    const rawDepth = Number(params.get('depth') || 0);
    return Number.isFinite(rawDepth) ? Math.max(0, Math.min(2, rawDepth)) : 0;
}

function restoreDepthFromUrlAfterFocus(params: URLSearchParams): boolean {
    const requestedDepth = getRequestedUrlDepth(params);
    if (requestedDepth < 2) return false;
    if (!getSelectedPoint() && !Number.isFinite(getFocusedNode())) return false;
    publish(EVENTS.DIVE_MODE_REQUESTED, { enabled: true });
    return true;
}

async function applyUrlStateFromDeferred(): Promise<void> {
    if (!(state as Record<string, unknown>)._deferredUrlState) return;
    const deferred = (state as Record<string, unknown>)._deferredUrlState as { params: string; timestamp: number };
    const { params } = deferred;
    (state as Record<string, unknown>)._deferredUrlState = null;
    const searchParams = new URLSearchParams(params);
    const query = searchParams.get('q');
    const offset = Number(searchParams.get('offset') || 0);
    const anchorLeadId = searchParams.get('anchor');
    restoreActiveClusterFilterFromUrl(searchParams);
    if (query) {
        try {
            await search(query, {
                restoreAnchorLeadId: anchorLeadId || searchParams.get('record') || searchParams.get('lead') || null,
                preferCachedResults: true,
                offset
            });
        } catch (err) {
            console.warn('Deferred URL state restore failed:', err);
        }
    }

    if (getSelectedPoint() || Number.isFinite(getFocusedNode())) {
        restoreDepthFromUrlAfterFocus(searchParams);
    }

    restoreRecordFocusFromParams(searchParams, { fromHistory: false, deferred: true });
}

export function clearExplorationFocusSelection(): void {
    state.focusedNode = null;
    state.selectedPoint = null;
    state.navState.focusedIndex = null;
    if (state.trailIndices?.clear) state.trailIndices.clear();
}

export function resetStateBeforeUrlRestore(options: { clearSearchInput?: boolean } = {}): void {
    clearExplorationFocusSelection();
    state.navState.mode = 'overview';
    state.navState.trailDepth = 0;
    state.currentSearchSummary = null;
    setCurrentView('galaxy');
    state.trailDepth = 0;
    state.myceliumMode = 'default';

    if (options.clearSearchInput) {
        const input = document.getElementById('search-input');
        if (input) {
            (input as HTMLInputElement).value = '';
            if (typeof (input as HTMLInputElement).dispatchEvent === 'function') {
                (input as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }
}

export async function applyUrlState(options: UrlStateOptions = {}): Promise<void> {
    const restoreToken = ++state.urlStateRestoreToken;
    const priorRestoringBrowserHistory = getRestoringBrowserHistory();
    state.applyingUrlState = true;
    state.restoringBrowserHistory = !!options.fromHistory;

    const params = new URLSearchParams(getLocation()?.search || '');
    const historyRecord =
        options.historyState?.params?.record || options.historyState?.params?.lead || null;
    const urlRecord = params.get('record') || params.get('lead');

    if (options.fromHistory && !urlRecord && historyRecord) {
        params.set('record', historyRecord);
        const repairedUrl = `${getLocation()?.pathname || ''}?${params.toString()}`;
        try {
            window.history.replaceState(
                {
                    semanticDemo: true,
                    reason: 'history-focus-url-repair',
                    params: Object.fromEntries(params.entries())
                },
                '',
                repairedUrl
            );
        } catch (err) {
            console.warn('url-state replaceState failed:', err);
        }
    }

    try {
        resetStateBeforeUrlRestore();
        setSemanticLaneOpsMode(params.get('ops') === '1' || params.get('debug') === '1');

        const view = params.get('view');
        switchView(view === 'map' ? 'map' : 'galaxy', { skipUrlSync: true });

        // Official filter restoration — delegates to search-state owner API
        restoreActiveFiltersFromUrl(params);

        const mode = params.get('mode');
        if (mode && MODE_DESCRIPTIONS && (MODE_DESCRIPTIONS as Record<string, unknown>)[mode]) {
            if (getMyceliumMode() !== null && getMyceliumMode() !== undefined) {
                setMyceliumMode(mode, { skipUrlSync: true });
            }
        }

        // Official cluster filter restoration — delegates to cluster-filter owner API
        restoreActiveClusterFilterFromUrl(params);

        if (typeof syncFilterControls === 'function') syncFilterControls();
        applyFilters();
        publish(EVENTS.COMPOSITION_UPDATED);

        if (getActiveClusterFilter() !== null) {
            document.querySelectorAll('.cluster-item').forEach((el) => {
                el.classList.toggle('active', Number((el as HTMLElement).dataset.cluster) === getActiveClusterFilter());
            });

            if (getPoints() && Array.isArray(getPoints())) {
                const clusterGlowIndices = getFilteredIndices().filter(
                    (index: number) => (getPoints() as Point[])[index]?.cluster === getActiveClusterFilter()
                );
                activateSearchGlow(clusterGlowIndices, clusterGlowIndices[0] ?? null);
            }
        }

        const query = params.get('q');
        const offset = Number(params.get('offset') || 0);
        const anchorLeadId = params.get('anchor');
        if (query) {
            recordSemanticLaneSnapshot({
                query,
                rail_mode: 'none',
                requested_anchor_lead_id: anchorLeadId || params.get('record') || params.get('lead') || null
            });
            const input = document.getElementById('search-input');
            if (input) (input as HTMLInputElement).value = query;
            updateHasQuery();
            if (!getPoints() || !Array.isArray(getPoints()) || getPoints().length === 0) {
                // Store deferred params for retry once data loads
                (state as Record<string, unknown>)._deferredUrlState = { params: Object.fromEntries(params.entries()), timestamp: Date.now() };
                // Listen for the data-loaded event
                if (getDeferredUrlStateHandler()) {
                    document.removeEventListener('semantic-data-loaded', getDeferredUrlStateHandler());
                }
                const handler = () => {
                    if (restoreToken === getUrlStateRestoreToken() && getPoints()?.length > 0) {
                        applyUrlStateFromDeferred();
                    }
                };
                (state as Record<string, unknown>)._deferredUrlStateHandler = handler;
                document.addEventListener('semantic-data-loaded', handler, { once: true });
                state.applyingUrlState = false;
                return;
            } else {
                await search(query, {
                    restoreAnchorLeadId: anchorLeadId || params.get('record') || params.get('lead') || null,
                    preferCachedResults: true,
                    offset
                });
            }
        }

        const record = params.get('record') || params.get('lead');
        if (record) {
            if (!getPoints() || !Array.isArray(getPoints()) || getPoints().length === 0) {
                (state as Record<string, unknown>)._deferredUrlState = { params: Object.fromEntries(params.entries()), timestamp: Date.now() };
                if (getDeferredUrlStateHandler()) {
                    document.removeEventListener('semantic-data-loaded', getDeferredUrlStateHandler());
                }
                const handler = () => {
                    if (restoreToken === getUrlStateRestoreToken() && getPoints()?.length > 0) {
                        applyUrlStateFromDeferred();
                    }
                };
                (state as Record<string, unknown>)._deferredUrlStateHandler = handler;
                document.addEventListener('semantic-data-loaded', handler, { once: true });
                state.applyingUrlState = false;
                return;
            }
            restoreRecordFocusFromParams(params, options);
        } else if (getSelectedPoint() || Number.isFinite(getFocusedNode())) {
            restoreDepthFromUrlAfterFocus(params);
        }

        const story = params.get('story');
        if (story && STORY_DESCRIPTIONS && (STORY_DESCRIPTIONS as Record<string, unknown>)[story]) {
            applyStoryPrompt(story, { skipUrlSync: true });
            if (getSemanticLaneOpsMode()) {
                refreshSemanticLaneOpsSummary().catch((err: unknown) => console.error('refreshSemanticLaneOpsSummary failed:', err));
            }
            if (!options.fromHistory) {
                updateUrlState({}, { reason: 'apply-url-story', force: true });
            }
            return;
        }

        if (getSemanticLaneOpsMode()) {
            refreshSemanticLaneOpsSummary().catch((err: unknown) => console.error('refreshSemanticLaneOpsSummary failed:', err));
        }
        if (!options.fromHistory) {
            updateUrlState({}, { reason: 'apply-url', force: true });
        }
    } finally {
        if (restoreToken === getUrlStateRestoreToken()) {
            state.applyingUrlState = false;
            state.restoringBrowserHistory = priorRestoringBrowserHistory;
        }
    }
}

export function updateUrlState(extra: Record<string, unknown> = {}, options: UpdateUrlStateOptions = {}): void {
    if (getApplyingUrlState() && !options.force) return;
    if (getRestoringBrowserHistory()) return;
    if (typeof window === 'undefined' || !window.location || !window.history) return;

    const params = new URLSearchParams(getLocation()?.search || '');
    params.set('view', getCurrentView());
    if (getSemanticLaneOpsMode()) params.set('ops', '1');
    else params.delete('ops');

    const query = ((document.getElementById('search-input') as HTMLInputElement | null)?.value || (getCurrentSearchSummary() as Record<string, unknown> | null)?.query || '').trim();
    if (query) params.set('q', query);
    else params.delete('q');

    const anchorIndex = (getCurrentSearchSummary() as Record<string, unknown> | null)?.anchorIndex as number | undefined;
    if (!Number.isFinite(anchorIndex) || anchorIndex! < 0 || anchorIndex! >= (getPoints()?.length ?? 0)) {
        params.delete('anchor');
    } else {
        const anchorLeadId = (getPoints() as Point[])[anchorIndex!]?.lead_id;
        if (anchorLeadId !== null && anchorLeadId !== undefined && anchorLeadId !== '') {
            params.set('anchor', String(anchorLeadId));
        } else {
            params.delete('anchor');
        }
    }

    if (getActiveFilters().status !== 'all') params.set('status', getActiveFilters().status);
    else params.delete('status');

    if (getActiveFilters().city !== 'all') params.set('city', getActiveFilters().city);
    else params.delete('city');

    (['website', 'email', 'geocoded'] as const).forEach((key) => {
        if (getActiveFilters()[key]) params.set(key, '1');
        else params.delete(key);
    });

    if (getMyceliumMode() !== 'default') params.set('mode', getMyceliumMode());
    else params.delete('mode');

    if (getTrailDepth() > 0) params.set('depth', String(getTrailDepth()));
    else params.delete('depth');

    if (getActiveStoryPrompt()) params.set('story', getActiveStoryPrompt() as string);
    else params.delete('story');

    if (getActiveClusterFilter() !== null) params.set('cluster', String(getActiveClusterFilter()));
    else params.delete('cluster');

    if (getSelectedPoint()?.lead_id) params.set('record', String(getSelectedPoint()!.lead_id));
    else params.delete('record');
    params.delete('lead');

    Object.entries(extra).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') params.delete(key);
        else params.set(key, String(value));
    });

    const next = `${getLocation()?.pathname || ''}${params.toString() ? `?${params.toString()}` : ''}`;
    const current = `${getLocation()?.pathname || ''}${getLocation()?.search || ''}`;
    const historyState = {
        semanticDemo: true,
        reason: options.reason || 'state',
        params: Object.fromEntries(params.entries())
    };
    if (next === current) {
        if (!window.history.state?.semanticDemo || !window.history.state?.params) {
            window.history.replaceState(historyState, '', next);
        }
        return;
    }

    const method = options.mode === 'push' && !getApplyingUrlState() ? 'pushState' : 'replaceState';
    try {
        (window.history as Record<string, Function>)[method](historyState, '', next);
    } catch (err) {
        if ((err as Error)?.name !== 'SecurityError') console.warn('updateUrlState history call failed:', err);
    }
}

function restoreRecordFocusFromParams(params: URLSearchParams, options: UrlStateOptions = {}): boolean {
    const record = params.get('record') || params.get('lead');
    if (!record || !getPoints() || !Array.isArray(getPoints()) || getPoints().length === 0) return false;

    const target = (getPoints() as Point[]).find((point: Point) => String(point.lead_id) === record);
    if (!target) {
        showExperienceToast('Record not found', `No record matching '${escapeHtml(record)}' was found in the dataset.`);
        return false;
    }

    if (!isPointVisible((getPoints() as Point[]).indexOf(target), getPoints() as Point[], getActiveClusterFilter(), getActiveFilters())) {
        return false;
    }

    const targetIndex = (getPoints() as Point[]).indexOf(target);
    focusOnPoint(target, { skipUrlSync: true, revealCard: true });
    const resultIndices = Array.isArray((getCurrentSearchSummary() as Record<string, unknown> | null)?.resultIndices)
        ? (getCurrentSearchSummary() as Record<string, unknown>).resultIndices as number[]
        : [];
    const resultsEl = document.getElementById('search-results');
    if (resultsEl && getCurrentSearchSummary()) {
        setActiveSearchResultRow(
            resultsEl,
            resultIndices.includes(targetIndex) ? targetIndex : null,
            { reveal: false }
        );
        syncSearchStatusForFocus(target);
    }
    restoreDepthFromUrlAfterFocus(params);

    if (!options.fromHistory && !options.deferred) {
        setTimeout(() => {
            showExperienceToast(
                'View restored',
                `${formatBusinessName(target.name)} focused from link.`
            );
        }, 1000);
    }

    if (options.fromHistory && target) {
        const query = params.get('q');
        if (query && getCurrentSearchSummary()) {
            syncSearchStatusForFocus(target);
        } else {
            const statusEl = document.getElementById('search-status');
            if (statusEl) {
                const pointName = formatBusinessName(target.name);
                statusEl.textContent = `${pointName} restored. Use Prev / Next to explore nearby businesses.`;
                updateSearchTrailCue({
                    beat: 'focus',
                    kicker: 'Trail restored',
                    title: `${pointName} focused from link`,
                    note: 'History state restored. Use Prev / Next to explore, or search from here.'
                });
            }
        }
    }

    if (params.get('q') && !getCurrentSearchSummary()) {
        const indices = getFilteredIndices();
        updateSearchStatusMessage(Array.isArray(indices) ? indices.length : 0);
    }

    return true;
}

export async function copyCurrentViewLink(): Promise<string | null> {
    let shareUrl: URL;
    try {
        shareUrl = new URL(getLocation()?.href || '');
    } catch {
        showExperienceToast('Copy unavailable', 'Could not read the current page URL.');
        return null;
    }
    shareUrl.searchParams.delete('cb');
    shareUrl.searchParams.delete('lead');
    shareUrl.searchParams.set('view', getCurrentView() || 'galaxy');

    if (getSelectedPoint()?.lead_id) {
        shareUrl.searchParams.set('record', String(getSelectedPoint()!.lead_id));
    }
    if (getMyceliumMode() && getMyceliumMode() !== 'default') {
        shareUrl.searchParams.set('mode', getMyceliumMode());
    }
    if ((getCurrentSearchSummary() as Record<string, unknown> | null)?.query) {
        shareUrl.searchParams.set('q', (getCurrentSearchSummary() as Record<string, unknown>).query as string);
    }
    if (Number.isFinite((getCurrentSearchSummary() as Record<string, unknown> | null)?.anchorIndex as number | undefined)) {
        shareUrl.searchParams.set('anchor', String((getCurrentSearchSummary() as Record<string, unknown>).anchorIndex));
    }

    const href = shareUrl.toString();
    try {
        await navigator.clipboard.writeText(href);
    } catch (err) {
        // Clipboard access can fail with SecurityError or AbortError — do not throw through UI.
        console.warn('Clipboard write failed:', err);
        showExperienceToast('Copy unavailable', 'Could not write to clipboard.');
        return null;
    }
    showExperienceToast('View link copied', 'Link copied to clipboard.');
    return href;
}

// Event Bus Subscriptions
subscribe(EVENTS.SEARCH_SUCCESS, () => {
    updateUrlState({ offset: null }, { reason: 'search-payload' });
});

subscribe(EVENTS.SEARCH_EMPTY, () => {
    updateUrlState({ offset: null }, { reason: 'search' });
});

subscribe(EVENTS.SEARCH_CLEARED, () => {
    updateUrlState({ q: null, offset: null }, { reason: 'search-clear' });
});

subscribe(EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, () => {
    updateUrlState({}, { reason: 'search-focus' });
});

subscribe(EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, () => {
    updateUrlState({}, { reason: 'search-settled' });
});

subscribe(EVENTS.VIEW_CHANGED, () => {
    updateUrlState({}, { reason: 'mode' });
});

subscribe(EVENTS.EXPLORATION_DEPTH_CHANGED, ({ depth }: { depth: number }) => {
    updateUrlState({ depth: depth > 0 ? depth : null }, { mode: 'replace', reason: 'trail-depth' });
});

subscribe(EVENTS.STATE_RESET, ({ options }: { options?: { skipUrlSync?: boolean } }) => {
    if (!options?.skipUrlSync) {
        updateUrlState({ q: null, record: null, anchor: null, depth: null }, { mode: 'push', reason: 'reset' });
    }
});

subscribe(EVENTS.CAMERA_NODE_FOCUSED, ({ point, options }: { point?: Point; options?: { skipUrlSync?: boolean; historyMode?: string } }) => {
    if (!options?.skipUrlSync) {
        updateUrlState({ record: point?.lead_id || null }, { mode: options?.historyMode || 'push', reason: 'focus' });
    }
});
