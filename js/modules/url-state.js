import { state } from '../state.js';
import { MODE_DESCRIPTIONS, STORY_DESCRIPTIONS, syncFilterControls, switchView, updateUrlState, resetStateBeforeUrlRestore, setMyceliumMode } from './lifecycle.js';
import { setSemanticLaneOpsMode, refreshSemanticLaneOpsSummary } from './semantic-lane.js';
import { isPointVisible, formatBusinessName, escapeHtml } from '../utils.js';
import { restoreActiveFiltersFromUrl, restoreActiveClusterFilterFromUrl } from './filter-state.js';

// === URL State ===

function getRequestedUrlDepth(params) {
    const rawDepth = Number(params.get('depth') || 0);
    return Number.isFinite(rawDepth) ? Math.max(0, Math.min(2, rawDepth)) : 0;
}

function restoreDepthFromUrlAfterFocus(params) {
    const requestedDepth = getRequestedUrlDepth(params);
    if (requestedDepth < 2) return false;
    if (!state.selectedPoint && !Number.isFinite(state.focusedNode)) return false;

    if (typeof window.setSemanticDiveMode === 'function') {
        window.setSemanticDiveMode(true);
        return true;
    }
    if (typeof window.setTrailDepth === 'function') {
        window.setTrailDepth(2, { fromUserGesture: true, skipUrlSync: true });
        return true;
    }
    return false;
}

async function applyUrlStateFromDeferred() {
    if (!state._deferredUrlState) return;
    const { params } = state._deferredUrlState;
    state._deferredUrlState = null;
    const searchParams = new URLSearchParams(params);
    const query = searchParams.get('q');
    const offset = Number(searchParams.get('offset') || 0);
    const anchorLeadId = searchParams.get('anchor');
    if (query && typeof window.search === 'function') {
        await window.search(query, {
            restoreAnchorLeadId: anchorLeadId || searchParams.get('record') || searchParams.get('lead') || null,
            preferCachedResults: true,
            offset
        });
    }
    const record = searchParams.get('record') || searchParams.get('lead');
    if (record) {
        const target = state.points.find((point) => String(point.lead_id) === record);
        if (target && isPointVisible(state.points.indexOf(target), state.points, state.activeClusterFilter, state.activeFilters)) {
            if (typeof window.focusOnPoint === 'function') window.focusOnPoint(target, { skipUrlSync: true });
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
        if (typeof window.applyFilters === 'function') window.applyFilters();
        if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();

        if (state.activeClusterFilter !== null) {
            document.querySelectorAll('.cluster-item').forEach((el) => {
                el.classList.toggle('active', Number(el.dataset.cluster) === state.activeClusterFilter);
            });

            if (typeof window.getFilteredIndices === 'function' && typeof window.activateSearchGlow === 'function') {
                if (state.points && Array.isArray(state.points)) {
                    const clusterGlowIndices = window.getFilteredIndices().filter(
                        (index) => state.points[index]?.cluster === state.activeClusterFilter
                    );
                    window.activateSearchGlow(clusterGlowIndices, clusterGlowIndices[0] ?? null);
                }
            }
        }

        const query = params.get('q');
        const offset = Number(params.get('offset') || 0);
        const anchorLeadId = params.get('anchor');
        if (query) {
            if (typeof window.recordSemanticLaneSnapshot === 'function') {
                window.recordSemanticLaneSnapshot({
                    query,
                    rail_mode: 'none',
                    requested_anchor_lead_id: anchorLeadId || params.get('record') || params.get('lead') || null
                });
            }
            const input = document.getElementById('search-input');
            if (input) input.value = query;
            if (typeof window.updateHasQuery === 'function') window.updateHasQuery();
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
            if (typeof window.search === 'function') {
                await window.search(query, {
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
                if (typeof window.showExperienceToast === 'function') {
                    window.showExperienceToast('Record not found', `No record matching '${escapeHtml(record)}' was found in the dataset.`);
                }
                return;
            }
            if (isPointVisible(state.points.indexOf(target), state.points, state.activeClusterFilter, state.activeFilters)) {
                if (typeof window.focusOnPoint === 'function') window.focusOnPoint(target, { skipUrlSync: true });
                restoreDepthFromUrlAfterFocus(params);
                if (!options.fromHistory) {
                    setTimeout(() => {
                        if (typeof window.showExperienceToast === 'function') {
                            window.showExperienceToast(
                                'View restored',
                                `${formatBusinessName(target.name)} focused from link.`
                            );
                        }
                    }, 1000);
                }
                if (options.fromHistory && target) {
                    if (query && state.currentSearchSummary) {
                        if (typeof window.syncSearchStatusForFocus === 'function') window.syncSearchStatusForFocus(target);
                    } else {
                        const statusEl = document.getElementById('search-status');
                        if (statusEl) {
                            const pointName = formatBusinessName(target.name);
                            statusEl.textContent = `${pointName} restored. Use Prev / Next to explore nearby businesses.`;
                            if (typeof window.updateSearchTrailCue === 'function') {
                                window.updateSearchTrailCue({
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
                    if (typeof window.updateSearchStatusMessage === 'function' && typeof window.getFilteredIndices === 'function') {
                        const indices = window.getFilteredIndices();
                        window.updateSearchStatusMessage(Array.isArray(indices) ? indices.length : 0);
                    }
                }
            }
        }

        const story = params.get('story');
        if (story && STORY_DESCRIPTIONS && STORY_DESCRIPTIONS[story]) {
            if (typeof window.applyStoryPrompt === 'function') window.applyStoryPrompt(story, { skipUrlSync: true });
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
