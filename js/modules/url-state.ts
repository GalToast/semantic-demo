/**
 * url-state.ts
 *
 * Typed sibling of url-state.js.
 * Manages bidirectional URL state synchronization (history, search params,
 * view, filters, story, mode, depth, record/anchor).
 */

import { state } from '@lib/engine/state-bridge';
import { withStateMutation } from '@lib/engine/state-bridge';
import { subscribe, publish, EVENTS } from '@lib/orchestration/event-bus';
import {
    MODE_DESCRIPTIONS,
    STORY_DESCRIPTIONS,
    setMyceliumMode,
} from '@lib/stores/lifecycle';
import {
    focusOnPoint,
    showExperienceToast,
    syncSearchStatusForFocus,
} from '@lib/orchestration/lifecycle';
import { applyStoryPrompt, syncFilterControls } from '@lib/orchestration/cluster-filter-controller';
import { switchView } from '@lib/orchestration/view-controller';
import { recordSemanticLaneSnapshot, setSemanticLaneOpsMode, refreshSemanticLaneOpsSummary } from './semantic-lane.ts';
import { isPointVisible, type GeoPoint } from './utils/geo-data.ts';
import { debugWarn } from '@lib/utils/diagnostic-adapter';
import { formatBusinessName, escapeHtml } from './utils/dom-formatters.ts';
import { restoreActiveFiltersFromUrl, restoreActiveClusterFilterFromUrl } from '@lib/stores/filter.svelte';
import {
    activateSearchGlow,
    applyFilters,
    getFilteredIndices,
    search,
    setActiveSearchResultRow,
    updateSearchStatusMessage,
    updateSearchTrailCue,
} from '@lib/engine/search-state-bridge';
import { updateHasQuery } from '@lib/ui/search-bindings';
import { setCurrentView } from './state-mutators.ts';
import { getLocation } from '@lib/utils/environment'
import { appState } from '@lib/state/app.svelte';

// ── Types ──────────────────────────────────────────────────────────────────

interface UrlStateOptions {
    fromHistory?: boolean;
    historyState?: {
        params?: { record?: string; lead?: string };
        [key: string]: unknown;
    };
    force?: boolean;
    deferred?: boolean;
}

interface UpdateUrlStateOptions {
    reason?: string;
    mode?: string;
    force?: boolean;
}

interface Point extends GeoPoint {
    lead_id?: string | number;
    name?: string;
    [key: string]: unknown;
}

interface DeferredUrlState {
    params: Record<string, string>;
    timestamp: number;
}

type UrlRuntimeState = typeof state & {
    focusedNode: number | null;
    selectedPoint: Point | null;
    navState: typeof state.navState & { trailDepth: number };
    _deferredUrlState: DeferredUrlState | null;
    _deferredUrlStateHandler: EventListener | null;
};

interface SearchSummaryView {
    query?: unknown;
    anchorIndex?: unknown;
    resultIndices?: unknown;
}

const urlState = state as unknown as UrlRuntimeState;

function getRestoreAnchorLeadId(...values: Array<string | null>): string | undefined {
    return values.find((value): value is string => value !== null && value !== '') ?? undefined;
}

function getSearchSummaryView(): SearchSummaryView | null {
    return appState.currentSearchSummary as unknown as SearchSummaryView | null;
}

function getSelectedPointView(): Point | null {
    return appState.selectedPoint as unknown as Point | null;
}

// ── URL State ──────────────────────────────────────────────────────────────

function getRequestedUrlDepth(params: URLSearchParams): number {
    const rawDepth = Number(params.get('depth') || 0);
    return Number.isFinite(rawDepth) ? Math.max(0, Math.min(2, rawDepth)) : 0;
}

function restoreDepthFromUrlAfterFocus(params: URLSearchParams): boolean {
    const requestedDepth = getRequestedUrlDepth(params);
    if (requestedDepth < 2) return false;
    if (!appState.selectedPoint && !Number.isFinite(appState.focusedNode)) return false;
    publish(EVENTS.DIVE_MODE_REQUESTED, { enabled: true });
    return true;
}

async function applyUrlStateFromDeferred(): Promise<void> {
    if (!urlState._deferredUrlState) return;
    const deferred = urlState._deferredUrlState;
    const { params } = deferred;
    urlState._deferredUrlState = null;
    const searchParams = new URLSearchParams(params);
    const query = searchParams.get('q');
    const offset = Number(searchParams.get('offset') || 0);
    const anchorLeadId = searchParams.get('anchor');
    restoreActiveClusterFilterFromUrl(searchParams);
    if (query) {
        try {
            await search(query, {
                restoreAnchorLeadId: getRestoreAnchorLeadId(anchorLeadId, searchParams.get('record'), searchParams.get('lead')),
                preferCachedResults: true,
                offset
            });
        } catch (err) {
            debugWarn('Deferred URL state restore failed:', err);
        }
    }

    if (appState.selectedPoint || Number.isFinite(appState.focusedNode)) {
        restoreDepthFromUrlAfterFocus(searchParams);
    }

    restoreRecordFocusFromParams(searchParams, { fromHistory: false, deferred: true });
}

export function clearExplorationFocusSelection(): void {
    urlState.focusedNode = null;
    urlState.selectedPoint = null;
    withStateMutation(() => { urlState.navState.focusedIndex = null; });
    if (state.trailIndices?.clear) state.trailIndices.clear();
}

export function resetStateBeforeUrlRestore(options: { clearSearchInput?: boolean } = {}): void {
    clearExplorationFocusSelection();
    withStateMutation(() => {
        urlState.navState.mode = 'overview';
        urlState.navState.trailDepth = 0;
    });
    state.currentSearchSummary = null;
    setCurrentView('galaxy');
    state.trailDepth = 0;
    state.semanticDiveMode = false;
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
    const priorRestoringBrowserHistory = appState.restoringBrowserHistory;
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
            debugWarn('url-state replaceState failed:', err);
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
            if (appState.myceliumMode !== null && appState.myceliumMode !== undefined) {
                setMyceliumMode(mode, { skipUrlSync: true });
            }
        }

        // Official cluster filter restoration — delegates to cluster-filter owner API
        restoreActiveClusterFilterFromUrl(params);

        if (typeof syncFilterControls === 'function') syncFilterControls();
        applyFilters();
        publish(EVENTS.COMPOSITION_UPDATED);

        if (appState.activeClusterFilter !== null) {
            document.querySelectorAll('.cluster-item').forEach((el) => {
                el.classList.toggle('active', Number((el as HTMLElement).dataset.cluster) === appState.activeClusterFilter);
            });

            if (appState.points && Array.isArray(appState.points)) {
                const clusterGlowIndices = getFilteredIndices().filter(
                    (index: number) => (appState.points as Point[])[index]?.cluster === appState.activeClusterFilter
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
            if (!appState.points || !Array.isArray(appState.points) || appState.points.length === 0) {
                // Store deferred params for retry once data loads
                urlState._deferredUrlState = { params: Object.fromEntries(params.entries()), timestamp: Date.now() };
                // Listen for the data-loaded event
                if (appState._deferredUrlStateHandler) {
                    document.removeEventListener('semantic-data-loaded', appState._deferredUrlStateHandler as EventListener);
                }
                const handler: EventListener = () => {
                    if (restoreToken === appState.navState.urlStateRestoreToken && appState.points?.length > 0) {
                        applyUrlStateFromDeferred();
                    }
                };
                urlState._deferredUrlStateHandler = handler;
                document.addEventListener('semantic-data-loaded', handler, { once: true });
                state.applyingUrlState = false;
                return;
            } else {
                await search(query, {
                    restoreAnchorLeadId: getRestoreAnchorLeadId(anchorLeadId, params.get('record'), params.get('lead')),
                    preferCachedResults: true,
                    offset
                });
            }
        }

        const record = params.get('record') || params.get('lead');
        if (record) {
            if (!appState.points || !Array.isArray(appState.points) || appState.points.length === 0) {
                urlState._deferredUrlState = { params: Object.fromEntries(params.entries()), timestamp: Date.now() };
                if (appState._deferredUrlStateHandler) {
                    document.removeEventListener('semantic-data-loaded', appState._deferredUrlStateHandler as EventListener);
                }
                const handler: EventListener = () => {
                    if (restoreToken === appState.navState.urlStateRestoreToken && appState.points?.length > 0) {
                        applyUrlStateFromDeferred();
                    }
                };
                urlState._deferredUrlStateHandler = handler;
                document.addEventListener('semantic-data-loaded', handler, { once: true });
                state.applyingUrlState = false;
                return;
            }
            restoreRecordFocusFromParams(params, options);
        } else if (appState.selectedPoint || Number.isFinite(appState.focusedNode)) {
            restoreDepthFromUrlAfterFocus(params);
        }

        const story = params.get('story');
        if (story && STORY_DESCRIPTIONS && (STORY_DESCRIPTIONS as Record<string, unknown>)[story]) {
            applyStoryPrompt(story, { skipUrlSync: true });
            if (appState.semanticLaneOpsMode) {
                refreshSemanticLaneOpsSummary().catch((err: unknown) => console.error('refreshSemanticLaneOpsSummary failed:', err));
            }
            if (!options.fromHistory) {
                updateUrlState({}, { reason: 'apply-url-story', force: true });
            }
            return;
        }

        if (appState.semanticLaneOpsMode) {
            refreshSemanticLaneOpsSummary().catch((err: unknown) => console.error('refreshSemanticLaneOpsSummary failed:', err));
        }
        if (!options.fromHistory) {
            updateUrlState({}, { reason: 'apply-url', force: true });
        }
    } finally {
        if (restoreToken === appState.navState.urlStateRestoreToken) {
            state.applyingUrlState = false;
            state.restoringBrowserHistory = priorRestoringBrowserHistory;
        }
    }
}

export function updateUrlState(extra: Record<string, unknown> = {}, options: UpdateUrlStateOptions = {}): void {
    if (appState.applyingUrlState && !options.force) return;
    if (appState.restoringBrowserHistory) return;
    if (typeof window === 'undefined' || !window.location || !window.history) return;

    const params = new URLSearchParams(getLocation()?.search || '');
    params.set('view', appState.currentView);
    if (appState.semanticLaneOpsMode) params.set('ops', '1');
    else params.delete('ops');

    const currentSearchSummary = getSearchSummaryView();
    const query = String((document.getElementById('search-input') as HTMLInputElement | null)?.value || currentSearchSummary?.query || '').trim();
    if (query) params.set('q', query);
    else params.delete('q');

    const anchorIndex = currentSearchSummary?.anchorIndex as number | undefined;
    if (!Number.isFinite(anchorIndex) || anchorIndex! < 0 || anchorIndex! >= (appState.points?.length ?? 0)) {
        params.delete('anchor');
    } else {
        const anchorLeadId = (appState.points as Point[])[anchorIndex!]?.lead_id;
        if (anchorLeadId !== null && anchorLeadId !== undefined && anchorLeadId !== '') {
            params.set('anchor', String(anchorLeadId));
        } else {
            params.delete('anchor');
        }
    }

    if (appState.activeFilters.status !== 'all') params.set('status', appState.activeFilters.status);
    else params.delete('status');

    if (appState.activeFilters.city !== 'all') params.set('city', appState.activeFilters.city);
    else params.delete('city');

    (['website', 'email', 'geocoded'] as const).forEach((key) => {
        if (appState.activeFilters[key]) params.set(key, '1');
        else params.delete(key);
    });

    if (appState.myceliumMode !== 'default') params.set('mode', appState.myceliumMode);
    else params.delete('mode');

    if (appState.trailDepth > 0) params.set('depth', String(appState.trailDepth));
    else params.delete('depth');

    const activeStoryPrompt = appState.activeStoryPrompt;
    if (activeStoryPrompt) params.set('story', String(activeStoryPrompt));
    else params.delete('story');

    if (appState.activeClusterFilter !== null) params.set('cluster', String(appState.activeClusterFilter));
    else params.delete('cluster');

    const selectedPoint = getSelectedPointView();
    if (selectedPoint?.lead_id) params.set('record', String(selectedPoint.lead_id));
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

    try {
        if (options.mode === 'push' && !appState.applyingUrlState) {
            window.history.pushState(historyState, '', next);
        } else {
            window.history.replaceState(historyState, '', next);
        }
    } catch (err) {
        if ((err as Error)?.name !== 'SecurityError') debugWarn('updateUrlState history call failed:', err);
    }
}

function restoreRecordFocusFromParams(params: URLSearchParams, options: UrlStateOptions = {}): boolean {
    const record = params.get('record') || params.get('lead');
    if (!record || !appState.points || !Array.isArray(appState.points) || appState.points.length === 0) return false;

    const target = (appState.points as Point[]).find((point: Point) => String(point.lead_id) === record);
    if (!target) {
        showExperienceToast('Record not found', `No record matching '${escapeHtml(record)}' was found in the dataset.`);
        return false;
    }

    const points = appState.points as Point[];
    const targetIndex = points.indexOf(target);
    if (!isPointVisible(targetIndex, points as GeoPoint[], appState.activeClusterFilter, appState.activeFilters)) {
        return false;
    }

    focusOnPoint(target, { skipUrlSync: true, revealCard: true });
    const currentSearchSummary = getSearchSummaryView();
    const resultIndices = Array.isArray(currentSearchSummary?.resultIndices)
        ? currentSearchSummary.resultIndices as number[]
        : [];
    const resultsEl = document.getElementById('search-results');
    if (resultsEl && appState.currentSearchSummary) {
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
        if (query && appState.currentSearchSummary) {
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

    if (params.get('q') && !appState.currentSearchSummary) {
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
    shareUrl.searchParams.set('view', appState.currentView || 'galaxy');

    const selectedPoint = getSelectedPointView();
    if (selectedPoint?.lead_id) {
        shareUrl.searchParams.set('record', String(selectedPoint.lead_id));
    }
    if (appState.myceliumMode && appState.myceliumMode !== 'default') {
        shareUrl.searchParams.set('mode', appState.myceliumMode);
    }
    const currentSearchSummary = getSearchSummaryView();
    if (currentSearchSummary?.query) {
        shareUrl.searchParams.set('q', String(currentSearchSummary.query));
    }
    const shareAnchorIndex = currentSearchSummary?.anchorIndex;
    if (Number.isFinite(shareAnchorIndex as number | undefined)) {
        shareUrl.searchParams.set('anchor', String(shareAnchorIndex));
    }

    const href = shareUrl.toString();
    try {
        await navigator.clipboard.writeText(href);
    } catch (err) {
        // Clipboard access can fail with SecurityError or AbortError — do not throw through UI.
        debugWarn('Clipboard write failed:', err);
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

subscribe(EVENTS.EXPLORATION_DEPTH_CHANGED, (payload) => {
    const depth = Number((payload as { depth?: unknown }).depth || 0);
    updateUrlState({ depth: depth > 0 ? depth : null }, { mode: 'replace', reason: 'trail-depth' });
});

subscribe(EVENTS.STATE_RESET, ({ options }: { options?: { skipUrlSync?: boolean } }) => {
    if (!options?.skipUrlSync) {
        updateUrlState({ q: null, record: null, anchor: null, depth: null }, { mode: 'push', reason: 'reset' });
    }
});

subscribe(EVENTS.CAMERA_NODE_FOCUSED, ({ point, options }: { point?: unknown; options?: Record<string, unknown> }) => {
    const p = point as Point | undefined;
    const opts = options as { skipUrlSync?: boolean; historyMode?: string } | undefined;
    if (!opts?.skipUrlSync) {
        updateUrlState({ record: p?.lead_id || null }, { mode: opts?.historyMode || 'push', reason: 'focus' });
    }
});
