import { state } from '../state.js';
import { MODE_DESCRIPTIONS, STORY_DESCRIPTIONS, syncFilterControls, switchView, resetStateBeforeUrlRestore, setMyceliumMode } from './lifecycle.js';
import { setSemanticLaneOpsMode, refreshSemanticLaneOpsSummary } from './semantic-lane.js';
import { isPointVisible, formatBusinessName, escapeHtml } from '../utils.js';
import { restoreActiveFiltersFromUrl, restoreActiveClusterFilterFromUrl } from './filter-state.js';
import { getUrlSearchAdapter } from './url-search-adapter.js';
import {
    getUrlNavigationAdapter,
    focusOnPoint as adapterFocusOnPoint,
    updateExplorationUi as adapterUpdateExplorationUi,
    recordSemanticLaneSnapshot as adapterRecordSemanticLaneSnapshot,
    updateHasQuery as adapterUpdateHasQuery,
    applyStoryPrompt as adapterApplyStoryPrompt,
    showExperienceToast as adapterShowExperienceToast,
    applyDeepTrailMode,
} from './url-navigation-adapter.js';

// === URL State ===

function getRequestedUrlDepth(params) {
    const rawDepth = Number(params.get('depth') || 0);
    return Number.isFinite(rawDepth) ? Math.max(0, Math.min(2, rawDepth)) : 0;
}

function restoreDepthFromUrlAfterFocus(params) {
    const requestedDepth = getRequestedUrlDepth(params);
    if (requestedDepth < 2) return false;
    if (!state.selectedPoint && !Number.isFinite(state.focusedNode)) return false;
    return applyDeepTrailMode({ fromUserGesture: true, skipUrlSync: true });
}

async function applyUrlStateFromDeferred() {
    if (!state._deferredUrlState) return;
    const { params } = state._deferredUrlState;
    state._deferredUrlState = null;
    const searchParams = new URLSearchParams(params);
    const query = searchParams.get('q');
    const offset = Number(searchParams.get('offset') || 0);
    const anchorLeadId = searchParams.get('anchor');
    if (query) {
        const adapter = getUrlSearchAdapter();
        if (typeof adapter?.search === 'function') {
            await adapter.search(query, {
                restoreAnchorLeadId: anchorLeadId || searchParams.get('record') || searchParams.get('lead') || null,
                preferCachedResults: true,
                offset
            });
        }
    }
    const record = searchParams.get('record') || searchParams.get('lead');
    if (record) {
        const target = state.points.find((point) => String(point.lead_id) === record);
        if (target && isPointVisible(state.points.indexOf(target), state.points, state.activeClusterFilter, state.activeFilters)) {
            if (typeof adapterFocusOnPoint === 'function') adapterFocusOnPoint(target, { skipUrlSync: true });
            restoreDepthFromUrlAfterFocus(searchParams);
        }
    }
}


export async function applyUrlState(options = {}) {
    const restoreToken = ++state.urlStateRestoreToken;
    const priorRestoringBrowserHistory = state.restoringBrowserHistory;
    state.applyingUrlState = true;
    state.restoringBrowserHistory = !!options.fromHistory;
    const params = new URLSearchParams(window.location.search);
    const historyRecord =
        options.historyState?.params?.record || options.historyState?.params?.lead || null;
    const urlRecord = params.get('record') || params.get('lead');

    if (options.fromHistory && !urlRecord && historyRecord) {
        params.set('record', historyRecord);
        const repairedUrl = `${window.location.pathname}?${params.toString()}`;
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
        if (mode && MODE_DESCRIPTIONS && MODE_DESCRIPTIONS[mode]) {
            if (state.myceliumMode !== null && state.myceliumMode !== undefined) {
                setMyceliumMode(mode, { skipUrlSync: true });
            }
        }

        // Official cluster filter restoration — delegates to cluster-filter owner API
        restoreActiveClusterFilterFromUrl(params);

        if (typeof syncFilterControls === 'function') syncFilterControls();
        const searchAdapter = getUrlSearchAdapter();
        if (typeof searchAdapter?.applyFilters === 'function') searchAdapter.applyFilters();
        if (typeof adapterUpdateExplorationUi === 'function') adapterUpdateExplorationUi();

        if (state.activeClusterFilter !== null) {
            document.querySelectorAll('.cluster-item').forEach((el) => {
                el.classList.toggle('active', Number(el.dataset.cluster) === state.activeClusterFilter);
            });

            const searchAdapter = getUrlSearchAdapter();
            if (typeof searchAdapter?.getFilteredIndices === 'function' && typeof searchAdapter?.activateSearchGlow === 'function') {
                if (state.points && Array.isArray(state.points)) {
                    const clusterGlowIndices = searchAdapter.getFilteredIndices().filter(
                        (index) => state.points[index]?.cluster === state.activeClusterFilter
                    );
                    searchAdapter.activateSearchGlow(clusterGlowIndices, clusterGlowIndices[0] ?? null);
                }
            }
        }

        const query = params.get('q');
        const offset = Number(params.get('offset') || 0);
        const anchorLeadId = params.get('anchor');
        if (query) {
            if (typeof adapterRecordSemanticLaneSnapshot === 'function') {
                adapterRecordSemanticLaneSnapshot({
                    query,
                    rail_mode: 'none',
                    requested_anchor_lead_id: anchorLeadId || params.get('record') || params.get('lead') || null
                });
            }
            const input = document.getElementById('search-input');
            if (input) input.value = query;
            if (typeof adapterUpdateHasQuery === 'function') adapterUpdateHasQuery();
            if (!state.points || !Array.isArray(state.points) || state.points.length === 0) {
                // Store deferred params for retry once data loads
                state._deferredUrlState = { params: Object.fromEntries(params.entries()), timestamp: Date.now() };
                // Listen for the data-loaded event
                if (state._deferredUrlStateHandler) {
                    document.removeEventListener('semantic-data-loaded', state._deferredUrlStateHandler);
                }
                const retryHandler = () => {
                    if (!state._deferredUrlState || state.points?.length === 0) return;
                    document.removeEventListener('semantic-data-loaded', retryHandler);
                    applyUrlStateFromDeferred();
                };
                state._deferredUrlStateHandler = retryHandler;
                document.addEventListener('semantic-data-loaded', retryHandler, { once: true });
                state.applyingUrlState = false;
                return;
            }
            const searchAdapter = getUrlSearchAdapter();
            if (typeof searchAdapter?.search === 'function') {
                await searchAdapter.search(query, {
                    restoreAnchorLeadId: anchorLeadId || params.get('record') || params.get('lead') || null,
                    preferCachedResults: true,
                    offset
                });
            }
            if (restoreToken !== state.urlStateRestoreToken) return;
        }

        const record = params.get('record') || params.get('lead');
        if (record) {
            if (!state.points || !Array.isArray(state.points) || state.points.length === 0) {
                // Data not yet available — record focus deferred until data loads
                return;
            }
            const target = state.points.find((point) => String(point.lead_id) === record);
            if (!target) {
                if (typeof adapterShowExperienceToast === 'function') {
                    adapterShowExperienceToast('Record not found', `No record matching '${escapeHtml(record)}' was found in the dataset.`);
                }
                return;
            }
            if (isPointVisible(state.points.indexOf(target), state.points, state.activeClusterFilter, state.activeFilters)) {
                if (typeof adapterFocusOnPoint === 'function') adapterFocusOnPoint(target, { skipUrlSync: true });
                restoreDepthFromUrlAfterFocus(params);
                if (!options.fromHistory) {
                    setTimeout(() => {
                        if (typeof adapterShowExperienceToast === 'function') {
                            adapterShowExperienceToast(
                                'View restored',
                                `${formatBusinessName(target.name)} focused from link.`
                            );
                        }
                    }, 1000);
                }
                if (options.fromHistory && target) {
                    if (query && state.currentSearchSummary) {
                        const searchAdapter = getUrlSearchAdapter();
                        if (typeof searchAdapter?.syncSearchStatusForFocus === 'function') searchAdapter.syncSearchStatusForFocus(target);
                    } else {
                        const statusEl = document.getElementById('search-status');
                        if (statusEl) {
                            const pointName = formatBusinessName(target.name);
                            statusEl.textContent = `${pointName} restored. Use Prev / Next to explore nearby businesses.`;
                            const searchAdapter = getUrlSearchAdapter();
                            if (typeof searchAdapter?.updateSearchTrailCue === 'function') {
                                searchAdapter.updateSearchTrailCue({
                                    beat: 'focus',
                                    kicker: 'Trail restored',
                                    title: `${pointName} focused from link`,
                                    note: 'History state restored. Use Prev / Next to explore, or search from here.'
                                });
                            }
                        }
                    }
                }
                if (query && !state.currentSearchSummary) {
                    const searchAdapter = getUrlSearchAdapter();
                    if (typeof searchAdapter?.updateSearchStatusMessage === 'function' && typeof searchAdapter?.getFilteredIndices === 'function') {
                        const indices = searchAdapter.getFilteredIndices();
                        searchAdapter.updateSearchStatusMessage(Array.isArray(indices) ? indices.length : 0);
                    }
                }
            }
        }

        const story = params.get('story');
        if (story && STORY_DESCRIPTIONS && STORY_DESCRIPTIONS[story]) {
            if (typeof adapterApplyStoryPrompt === 'function') adapterApplyStoryPrompt(story, { skipUrlSync: true });
            if (state.semanticLaneOpsMode) {
                refreshSemanticLaneOpsSummary().catch(err => console.error('refreshSemanticLaneOpsSummary failed:', err));
            }
            if (!options.fromHistory) {
                updateUrlState({}, { reason: 'apply-url-story' });
            }
            return;
        }

        if (state.semanticLaneOpsMode) {
            refreshSemanticLaneOpsSummary().catch(err => console.error('refreshSemanticLaneOpsSummary failed:', err));
        }
        if (!options.fromHistory) {
            updateUrlState({}, { reason: 'apply-url' });
        }
    } finally {
        if (restoreToken === state.urlStateRestoreToken) {
            state.applyingUrlState = false;
            state.restoringBrowserHistory = priorRestoringBrowserHistory;
        }
    }
}

export function updateUrlState(extra = {}, options = {}) {
    if (state.restoringBrowserHistory) return;
    if (typeof window === 'undefined' || !window.location || !window.history) return;

    const params = new URLSearchParams(window.location.search);

    params.set('view', state.currentView);
    if (state.semanticLaneOpsMode) params.set('ops', '1');
    else params.delete('ops');

    const query = (document.getElementById('search-input')?.value || '').trim();
    if (query) params.set('q', query);
    else params.delete('q');

    const anchorIndex = state.currentSearchSummary?.anchorIndex;
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= state.points?.length) {
        params.delete('anchor');
    } else {
        const anchorLeadId = state.points[anchorIndex]?.lead_id;
        if (anchorLeadId !== null && anchorLeadId !== undefined && anchorLeadId !== '') {
            params.set('anchor', String(anchorLeadId));
        } else {
            params.delete('anchor');
        }
    }

    if (state.activeFilters.status !== 'all') params.set('status', state.activeFilters.status);
    else params.delete('status');

    if (state.activeFilters.city !== 'all') params.set('city', state.activeFilters.city);
    else params.delete('city');

    ['website', 'email', 'geocoded'].forEach((key) => {
        if (state.activeFilters[key]) params.set(key, '1');
        else params.delete(key);
    });

    if (state.myceliumMode !== 'default') params.set('mode', state.myceliumMode);
    else params.delete('mode');

    if (state.trailDepth > 0) params.set('depth', String(state.trailDepth));
    else params.delete('depth');

    if (state.activeStoryPrompt) params.set('story', state.activeStoryPrompt);
    else params.delete('story');

    if (state.activeClusterFilter !== null) params.set('cluster', String(state.activeClusterFilter));
    else params.delete('cluster');

    if (state.selectedPoint?.lead_id) params.set('record', String(state.selectedPoint.lead_id));
    else params.delete('record');
    params.delete('lead');

    Object.entries(extra).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') params.delete(key);
        else params.set(key, String(value));
    });

    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    const current = `${window.location.pathname}${window.location.search}`;
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

    const method = options.mode === 'push' && !state.applyingUrlState ? 'pushState' : 'replaceState';
    try {
        window.history[method](historyState, '', next);
    } catch (err) {
        if (err.name !== 'SecurityError') console.warn('updateUrlState history call failed:', err);
    }
}

export async function copyCurrentViewLink() {
    let shareUrl;
    try {
        shareUrl = new URL(window.location.href);
    } catch {
        if (typeof adapterShowExperienceToast === 'function') adapterShowExperienceToast('Copy unavailable', 'Could not read the current page URL.');
        return null;
    }
    shareUrl.searchParams.delete('cb');
    shareUrl.searchParams.delete('lead');
    shareUrl.searchParams.set('view', state.currentView || 'galaxy');

    if (state.selectedPoint?.lead_id) {
        shareUrl.searchParams.set('record', String(state.selectedPoint.lead_id));
    }
    if (state.myceliumMode && state.myceliumMode !== 'default') {
        shareUrl.searchParams.set('mode', state.myceliumMode);
    }
    if (state.currentSearchSummary?.query) {
        shareUrl.searchParams.set('q', state.currentSearchSummary.query);
    }
    if (state.activeClusterFilter) {
        shareUrl.searchParams.set('cluster', state.activeClusterFilter);
    }
    if (state.activeStoryPrompt) {
        shareUrl.searchParams.set('story', state.activeStoryPrompt);
    }
    if (Number.isFinite(state.currentSearchSummary?.anchorIndex)) {
        shareUrl.searchParams.set('anchor', state.currentSearchSummary.anchorIndex);
    }

    const href = shareUrl.toString();
    try {
        await navigator.clipboard.writeText(href);
    } catch (err) {
        // Clipboard access can fail with SecurityError or AbortError — do not throw through UI.
        console.warn('Clipboard write failed:', err);
        if (typeof adapterShowExperienceToast === 'function') {
            adapterShowExperienceToast('Copy unavailable', 'Could not write to clipboard.');
        }
        return null;
    }
    state.lastCopiedViewLink = href;
    if (typeof adapterShowExperienceToast === 'function') adapterShowExperienceToast('View link copied', 'Link copied to clipboard.');
    return href;
}
