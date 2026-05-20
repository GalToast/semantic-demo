import { state } from '../state.js';
import {
    isCompactMapViewport,
    isCompactSearchViewport,
    formatBusinessName,
    describeCluster,
    normalizeCityForFilter,
    escapeHtml,
    cleanPublicNoteText,
    getPublicRecordStatusLabel,
    updateTime
} from '../utils.js';
import {
    buildSemanticGuideRequestPayload
} from './semantic-guide-payload.js';
import { initEventListeners as initSemanticDemoEventListeners } from './event-bindings.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { showSemanticThreadsDetail } from './connection-analysis.js';
import { setActiveSearchResultRow, updateSelectedCardHeading } from './ui-renderers.js';

import {
    setLoadingPhase,
    hideLoadingOverlay,
    startDeferredHydration,
    scheduleWeatherHydration
} from './loading-ui.js';
import {
    startSceneReveal,
    getSceneRevealProgress,
    onWindowResize
} from './scene-reveal.js';
import {
    clearClusterFilter,
    updateClusterList,
    getFilteredClusterCounts
} from './cluster-filter.js';
import {
    fetchSemanticLaneHealth,
    applySemanticLaneHealthPayload,
    shouldWarmSemanticLane,
    probeSemanticLane,
    scheduleSemanticLaneMonitor,
    setSemanticLaneUiState,
    recordSemanticLaneSnapshot,
    setSemanticLaneOpsMode,
    refreshSemanticLaneOpsSummary,
} from './semantic-lane.js';
import { getFocusedJourneyPoint, getJourneyCompassState } from './journey-compass-state.js';
import {
    initMap,
    refreshMapMarkers,
    refreshMapRouteEmbodiment,
    centerMapOnRouteAnchor,
    getRouteEmbodimentIndices,
    getRouteAnchorIndex,
    getRouteDirectorState,
    syncRouteDirectorState,
    setTerrainHandoffState
} from './map-state.js';
import {
    initWeather,
    applyWeatherEffects,
    clearWeatherRefreshTimer,
    clearWeatherEffects
} from './weather.js';
import {
    search,
    applyFilters,
    getFilteredIndices,
    clearSearchGlow,
    updateSearchStatusMessage,
    updateSearchTrailCue,
    clearShortSemanticSearchState,
    beginSearchFocusTransition,
    clearSearch,
    clearSearchPreviewHoverTimer,
    clearMobileRouteFieldPeek
} from './search-state.js';
import { focusOnNode } from './camera-controls.js';

export { setLoadingPhase, hideLoadingOverlay, startDeferredHydration, scheduleWeatherHydration };
export { startSceneReveal, getSceneRevealProgress, onWindowResize };
export { clearClusterFilter, updateClusterList, getFilteredClusterCounts };
export { getFocusedJourneyPoint, getJourneyCompassState };
export { updateTime };
export {
    fetchSemanticLaneHealth,
    applySemanticLaneHealthPayload,
    shouldWarmSemanticLane,
    probeSemanticLane,
    scheduleSemanticLaneMonitor,
    setSemanticLaneUiState,
    recordSemanticLaneSnapshot,
    setSemanticLaneOpsMode,
    refreshSemanticLaneOpsSummary,
};

// === Constants ===

export const MODE_DESCRIPTIONS = {
    default: 'County View keeps the whole county visible so you can choose where to wander next.',
    bloom: 'Surface signal-rich businesses with a website plus email or phone.',
    bridge: 'Highlight businesses that link different industry and city clusters.',
    trail: 'Trail follows related businesses around one focused record. A trail forms as you move.'
};

export const STORY_DESCRIPTIONS = {
    'signal-rich': 'Signal-rich county opens the records with the richest contact and map context.',
    'bridge-businesses': 'Cross-current businesses finds records sitting between separate neighborhoods.',
    'mapped-food': 'Mapped food web narrows the county to mapped food and hospitality records.',
    'disqualified-ghosts': 'Archive layer brings forward records outside the active public slice.'
};

// === Exploration UI & Orchestration ===



export function syncCityFilterUi() {
    const activeCity = state.activeFilters.city || 'all';
    const select = document.getElementById('city-filter');
    if (select && select.value !== activeCity) select.value = activeCity;

    const summary = document.getElementById('city-filter-summary');
    if (summary) summary.textContent = activeCity === 'all' ? 'All cities' : activeCity;

    document.querySelectorAll('[data-city-filter]').forEach((button) => {
        const active = (button.dataset.cityFilter || 'all') === activeCity;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
}

export function populateCityFilter() {
    if (!state.points) return;
    const select = document.getElementById('city-filter');
    const pills = document.getElementById('city-filter-pills');
    const note = document.getElementById('city-filter-note');
    const counts = new Map();

    state.points.forEach((point) => {
        const city = normalizeCityForFilter(point?.city);
        counts.set(city, (counts.get(city) || 0) + 1);
    });

    const cities = Array.from(counts.entries())
        .filter(([city]) => city && city !== 'Other / Unparsed')
        .sort((a, b) => a[0].localeCompare(b[0]));

    if (select) {
        const current = state.activeFilters.city || 'all';
        select.innerHTML = [
            '<option value="all">All Cities</option>',
            ...cities.map(([city, count]) => `<option value="${escapeHtml(city)}">${escapeHtml(city)} (${count.toLocaleString()})</option>`)
        ].join('');
        select.value = cities.some(([city]) => city === current) ? current : 'all';
        state.activeFilters.city = select.value;
    }

    if (pills) {
        const topCities = Array.from(counts.entries())
            .filter(([city]) => city && city !== 'Other / Unparsed')
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6);
        pills.innerHTML = [
            '<button class="city-filter-pill" type="button" data-city-filter="all" aria-pressed="false"><span>All</span><b>all</b></button>',
            ...topCities.map(([city, count]) => `
                <button class="city-filter-pill" type="button" data-city-filter="${escapeHtml(city)}" aria-pressed="false">
                    <span>${escapeHtml(city)}</span><b>${count.toLocaleString()}</b>
                </button>
            `)
        ].join('');
    }

    if (note) {
        note.textContent = cities.length
            ? `${cities.length.toLocaleString()} city filters available; graph positions still preserve semantic context.`
            : 'City filters become available after county records load.';
    }

    syncCityFilterUi();
}

export function syncFilterControls() {
    document.querySelectorAll('[data-status-filter]').forEach((el) => {
        const active = (el.dataset.statusFilter || 'all') === state.activeFilters.status;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
    });

    document.querySelectorAll('[data-signal-filter]').forEach((el) => {
        const key = el.dataset.signalFilter;
        const active = Boolean(state.activeFilters[key]);
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
    });

    const citySelect = document.getElementById('city-filter');
    if (citySelect) citySelect.value = state.activeFilters.city || 'all';
    if (typeof syncCityFilterUi === 'function') syncCityFilterUi();

    // Update the collapsed Filters section preview badge
    const preview = document.getElementById('filter-preview');
    if (!preview) return;
    const parts = [];
    const statusLabel = { all: 'All Records', active: 'Active', disqualified: 'Archive' };
    if (state.activeFilters.status !== 'all') {
        parts.push(statusLabel[state.activeFilters.status] || state.activeFilters.status);
    }
    if (state.activeFilters.website) parts.push('Website');
    if (state.activeFilters.email) parts.push('Email');
    if (state.activeFilters.geocoded) parts.push('Mapped');
    if (state.activeFilters.city && state.activeFilters.city !== 'all') {
        parts.push(`City: ${state.activeFilters.city}`);
    }

    const clearFiltersBtn = document.getElementById('filter-clear-btn');
    if (clearFiltersBtn) {
        const hasActiveFilters = parts.length > 0;
        clearFiltersBtn.disabled = !hasActiveFilters;
        clearFiltersBtn.setAttribute('aria-disabled', String(!hasActiveFilters));
    }

    if (parts.length === 0) {
        preview.textContent = 'All clear';
        preview.hidden = true;
    } else {
        preview.textContent = parts.join(' · ');
        preview.hidden = false;
    }
}

export function updateExplorationUi() {
    document.body.dataset.myceliumMode = state.myceliumMode;
    document.body.dataset.trailDepth = state.trailDepth;
    document.body.dataset.trailReady =
        state.trailDepth >= 1 && state.focusedNode === null ? 'waiting' : 'ready';
    document.querySelectorAll('[data-mode]').forEach((button) => {
        const active = button.dataset.mode === state.myceliumMode;
        const waitingTrail = button.dataset.mode === 'trail' && state.focusedNode === null;
        button.classList.toggle('active', active);
        button.classList.toggle('is-waiting', waitingTrail);
        // Locked trail state: trailDepth >= 1 means the Trail chip is in its locked/enabled phase
        const isLockedTrail = button.dataset.mode === 'trail' && state.trailDepth >= 1;
        button.classList.toggle('is-locked', isLockedTrail);
        button.setAttribute('aria-pressed', String(active && !waitingTrail));
        button.setAttribute(
            'aria-label',
            waitingTrail
                ? 'Select a business first to step inside its neighborhood'
                : button.textContent.trim().replace(/\s+/g, ' ')
        );
    });

    document.querySelectorAll('[data-story]').forEach((button) => {
        const storyActive = button.dataset.story === state.activeStoryPrompt;
        const modeCompatible = !button.dataset.mode || button.dataset.mode === state.myceliumMode;
        const active = storyActive && modeCompatible;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });

    const note = document.getElementById('exploration-note');
    const result = document.getElementById('exploration-mode-result');
    if (!note) return;
    if (!state.points || !Array.isArray(state.points)) {
        if (result) result.textContent = 'Loading...';
        return;
    }

    if (state.activeStoryPrompt && STORY_DESCRIPTIONS[state.activeStoryPrompt]) {
        note.textContent = STORY_DESCRIPTIONS[state.activeStoryPrompt];
    } else if (state.trailDepth >= 1 && state.focusedNode === null) {
        note.textContent =
            'Search or select a business first; then Step Inside follows its nearest semantic neighbors.';
    } else {
        note.textContent = MODE_DESCRIPTIONS[state.myceliumMode] || MODE_DESCRIPTIONS.default;
    }

    if (result) {
        result.classList.toggle('has-breakdown', state.myceliumMode === 'bloom');
        let resultText = `Showing all ${state.points.length.toLocaleString()} county records. Click or tap any record to explore its neighborhood.`;
        if (state.myceliumMode === 'bloom') {
            const dimmedCount = Math.max(0, state.points.length - state.bloomIndices.size);
            result.innerHTML = `
                <span class="mode-result-copy">Why the graph changed</span>
                <span class="mode-result-breakdown" aria-label="Website and contact highlight breakdown">
                    <span><strong>${state.bloomIndices.size.toLocaleString()}</strong> brighter: website + email or phone</span>
                    <span><strong>${dimmedCount.toLocaleString()}</strong> dimmed: still included for county context</span>
                    <span>Map/status fields can boost brightness</span>
                </span>
            `;
            result.dataset.resultMode = state.myceliumMode;
            return;
        } else if (state.myceliumMode === 'bridge') {
            resultText = `${state.bridgeIndices.size.toLocaleString()} bridge records highlighted; use them to jump between business clusters.`;
        } else if (state.trailDepth >= 1 && state.focusedNode === null) {
            resultText = 'Trail locked: search or select one business to unlock the neighborhood explorer.';
        } else if (state.trailDepth >= 1) {
            resultText = `Search opens a trail: ${Math.max(0, state.trailIndices.size - 1).toLocaleString()} nearby stops around this business.`;
        }
        result.textContent = resultText;
        result.dataset.resultMode = state.myceliumMode;
    }
}

export function setMyceliumMode(mode, options = {}) {
    state.myceliumMode = mode;

    // Map myceliumMode to trailDepth (trailDepth is the canonical state, myceliumMode is kept for display compat)
    // 'trail' mode delegates to setTrailDepth to properly gate depth=2 from side effects
    if (mode === 'trail') {
        if (typeof window.setTrailDepth === 'function') {
            window.setTrailDepth(1, { skipUrlSync: options.skipUrlSync, keepStoryPrompt: options.keepStoryPrompt });
        } else {
            state.trailDepth = 1;
        }
    } else if (mode === 'inside') {
        if (typeof window.setTrailDepth === 'function') {
            window.setTrailDepth(2, { fromUserGesture: true, skipUrlSync: options.skipUrlSync });
        } else {
            state.trailDepth = 2;
        }
        state.navState.mode = 'inside';
    } else {
        // 10/10 Polish: Fix for 'broken feedback loop'
        // Clear trail indices when leaving trail mode, but DO NOT reset trailDepth to 0 here
        // as it is established by setTrailDepth() and managed as the primary state.
        state.trailIndices.clear();
        state.navState.trailCursor = -1;
        state.navState.mode = 'overview';
        state.navState.explorationHistoryIndices = [];
        state.navState.walkHistoryIndices = [];
        state.navState.threadCandidates = [];
    }

    if (!options.keepStoryPrompt) {
        state.activeStoryPrompt = null;
    }

    // Show brief computing state on mode chips during heavy recomputation
    const modeGrid = document.getElementById('mode-grid');
    if (modeGrid) modeGrid.classList.add('computing');

    // Recompute bloom/bridge indices when entering those modes
    const doRecompute = () => {
        if (mode === 'bloom') {
            recomputeBloomIndices();
        } else if (mode === 'bridge') {
            recomputeBridgeIndices();
        }
        if (modeGrid) modeGrid.classList.remove('computing');
    };

    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(doRecompute, { timeout: 2000 });
    } else {
        setTimeout(doRecompute, 0);
    }

    // Apply color changes and refresh UI
    if (typeof window.applyPointFilterColors === 'function') {
        window.applyPointFilterColors();
    }
    if (typeof window.updateExplorationUi === 'function') {
        window.updateExplorationUi();
    }
    if (!options.skipUrlSync) {
        if (typeof window.updateUrlState === 'function') {
            window.updateUrlState({}, { reason: 'mode' });
        }
    }
}

// Explicit trailDepth transition — each level requires deliberate user action
export function setTrailDepth(n, options = {}) {
    const nextDepth = Math.max(0, Math.min(2, Number(n)));
    const prevDepth = state.trailDepth;

    // Explicit gate: trailDepth 2 may only be entered via user click, never as a side effect of entering trailDepth 1
    if (nextDepth === 2 && prevDepth < 2 && !options.fromUserGesture) {
        // Silently ignore silent escalation attempts (e.g. side effects from search-centering)
        return;
    }

    state.trailDepth = nextDepth;

    // Keep myceliumMode in sync for display compat
    if (nextDepth >= 1) {
        state.myceliumMode = 'trail';
    } else {
        state.myceliumMode = 'default';
    }

    if (typeof window.updateExplorationUi === 'function') {
        window.updateExplorationUi();
    }
    if (typeof window.syncSemanticDiveUi === 'function') {
        window.syncSemanticDiveUi();
    }
    if (typeof window.updateJourneyCompass === 'function') {
        window.updateJourneyCompass();
    }
    if (!options.skipUrlSync && typeof window.updateUrlState === 'function') {
        window.updateUrlState({}, { reason: 'depth' });
    }
}

function recomputeBloomIndices() {
    if (!state.points || state.points.length === 0) return;
    state.bloomIndices.clear();

    // Calculate signal scores for all points
    if (state.signalScores.length !== state.points.length) {
        state.signalScores = new Array(state.points.length).fill(0);
    }
    for (let i = 0; i < state.points.length; i++) {
        const p = state.points[i];
        let score = 0;
        if (p.website) score += 1.35;
        if (p.email) score += 1.0;
        if (p.phone) score += 0.45;
        if (p.lat && p.lng) score += 1.25;
        if (p.status === 'active') score += 0.55;
        if (p.trivia) score += 0.35;
        state.signalScores[i] = score;
    }

    // Keep Bloom mode selective so it reads as a signal layer, not a full-canvas flash.
    const sorted = [...state.signalScores].sort((a, b) => b - a);
    const threshold = sorted[Math.min(Math.floor(sorted.length * 0.12), sorted.length - 1)] || 0;
    const bloomThreshold = Math.max(threshold, 2.95);

    for (let i = 0; i < state.signalScores.length; i++) {
        if (state.signalScores[i] >= bloomThreshold) {
            state.bloomIndices.add(i);
        }
    }
}

function recomputeBridgeIndices() {
    if (!state.points || state.points.length === 0 || !state.originalPositions) return;
    state.bridgeIndices.clear();
    if (state.bridgeScores.length !== state.points.length) {
        state.bridgeScores = new Array(state.points.length).fill(0);
    }

    const cellSize = 0.12;
    const grid = new Map();
    for (let i = 0; i < state.originalPositions.length; i++) {
        const pos = state.originalPositions[i];
        const gx = Math.floor(pos.x / cellSize);
        const gy = Math.floor(pos.y / cellSize);
        const gz = Math.floor(pos.z / cellSize);
        const key = `${gx},${gy},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
    }

    const maxDist = 0.17;
    for (let i = 0; i < state.points.length; i++) {
        const pos = state.originalPositions[i];
        if (!pos) continue;
        const gx = Math.floor(pos.x / cellSize);
        const gy = Math.floor(pos.y / cellSize);
        const gz = Math.floor(pos.z / cellSize);
        const foreignClusters = new Set();
        let weight = 0;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const neighbors = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
                    if (!neighbors) continue;
                    for (const j of neighbors) {
                        if (j === i) continue;
                        const neighborPos = state.originalPositions[j];
                        if (!neighborPos) continue;
                        const dx = pos.x - neighborPos.x;
                        const dy = pos.y - neighborPos.y;
                        const dz = pos.z - neighborPos.z;
                        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (d > maxDist) continue;
                        if (!state.points[i] || !state.points[j]) continue;
                        const otherCluster = state.points[j].cluster;
                        if (otherCluster !== state.points[i].cluster) {
                            foreignClusters.add(otherCluster);
                            if (Number.isFinite(state.signalScores[j])) {
                                weight += state.signalScores[j] * (1 - d / maxDist);
                            }
                        }
                    }
                }
            }
        }

        state.bridgeScores[i] = weight;
        if (foreignClusters.size > 1 && weight >= 0.7) {
            state.bridgeIndices.add(i);
        }
    }
}

export function applyStoryPrompt(story, options = {}) {
    state.activeStoryPrompt = story;
    state.activeClusterFilter = null;
    state.activeFilters = {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    };

    if (story === 'signal-rich') {
        setMyceliumMode('bloom', { keepStoryPrompt: true, skipUrlSync: true });
    } else if (story === 'bridge-businesses') {
        setMyceliumMode('bridge', { keepStoryPrompt: true, skipUrlSync: true });
    } else if (story === 'mapped-food') {
        const foodCluster = window.findClusterByKeyword ? window.findClusterByKeyword('restaurant') : null;
        if (foodCluster !== null) state.activeClusterFilter = foodCluster;
        state.activeFilters.geocoded = true;
        setMyceliumMode('default', { keepStoryPrompt: true, skipUrlSync: true });
    } else if (story === 'disqualified-ghosts') {
        state.activeFilters.status = 'disqualified';
        setMyceliumMode('bloom', { keepStoryPrompt: true, skipUrlSync: true });
    } else {
        setMyceliumMode('default', { keepStoryPrompt: true, skipUrlSync: true });
    }

    if (typeof syncFilterControls === 'function') syncFilterControls();
    clearSearchGlow();
    if (typeof window.applyFilters === 'function') window.applyFilters();
    else applyFilters();
    if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
    if (!options.skipUrlSync) {
        if (typeof window.updateUrlState === 'function') window.updateUrlState({ story }, { reason: 'story' });
    }
}

// === Navigation & URL State ===

export function updateUrlState(extra = {}, options = {}) {
    if (state.restoringBrowserHistory) return;

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
        if (typeof window.showExperienceToast === 'function') window.showExperienceToast('Copy unavailable', 'Could not read the current page URL.');
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
        if (typeof window.showExperienceToast === 'function') {
            window.showExperienceToast('Copy unavailable', 'Could not write to clipboard.');
        }
        return null;
    }
    state.lastCopiedViewLink = href;
    if (typeof window.showExperienceToast === 'function') window.showExperienceToast('View link copied', 'Link copied to clipboard.');
    return href;
}

export function resetExperienceState() {
    resetStateBeforeUrlRestore({ clearSearchInput: true });
    if (typeof window.switchView === 'function') {
        window.switchView('galaxy', { skipUrlSync: true, silentHandoff: true });
    }
    if (typeof window.updateUrlState === 'function') {
        window.updateUrlState(
            {
                q: null,
                anchor: null,
                record: null,
                offset: null,
                status: null,
                city: null,
                website: null,
                email: null,
                geocoded: null,
                mode: null,
                story: null,
                cluster: null
            },
            { reason: 'reset', mode: 'replace' }
        );
    }
    showExperienceToast('Scene restored', 'Search, connection path, filters, and map handoff cleared.');
}

/**
 * Official exploration-focus reset: clears focusedNode, trail depth, mycelium mode,
 * and focus-stage while preserving the current search so the user retains context.
 * Use this when returning to overview without a full scene wipe.
 */
export function resetExplorationFocus() {
    // Reset mycelium mode and trail depth — this also clears trailIndices
    // and resets navState.mode to 'overview'
    setMyceliumMode('default', { skipUrlSync: true });
    setTrailDepth(0, { skipUrlSync: true });

    // Clear node focus state while preserving search
    resetNodePositions({ preserveSearch: true });

    // Explicitly clear search glow (resetNodePositions skips it when preserveSearch=true)
    clearSearchGlow();

    // Ensure focus stage DOM element is hidden
    if (typeof window.syncFocusStage === 'function') {
        window.syncFocusStage(null);
    }

    // Sync UI state to reflect the reset
    if (typeof window.refreshCompositionState === 'function') {
        window.refreshCompositionState();
    }
    if (typeof window.updateExplorationUi === 'function') {
        window.updateExplorationUi();
    }
}

/**
 * Official full-reset API. Clears search, filters, focus, and trail state,
 * and returns the scene to galaxy overview.
 * Alias for the existing resetExperienceState() — preserves backward compat.
 */
export function returnToOverview() {
    resetExperienceState();
}

export function resetStateBeforeUrlRestore(options = {}) {
    if (state.searchTimeout) {
        window.clearTimeout(state.searchTimeout);
        state.searchTimeout = null;
    }
    if (state.searchAbortController) {
        state.searchAbortController.abort();
        state.searchAbortController = null;
    }
    state.searchRequestSequence = (state.searchRequestSequence || 0) + 1;
    state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1;

    const input = document.getElementById('search-input');
    const resultsEl = document.getElementById('search-results');
    // Only clear search input when explicitly requested (e.g., user clicked "Clear" or full reset).
    // When restoring from URL without a `q` param, preserve the current input value.
    if (options.clearSearchInput && input) input.value = '';
    if (resultsEl) {
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('active', 'searching', 'focusing');
    }

    state.currentSearchSummary = null;
    state.activeClusterFilter = null;
    state.activeStoryPrompt = null;
    setMyceliumMode('default', { skipUrlSync: true });
    state.semanticDiveMode = false;
    state.activeFilters = {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    };
    state.selectedPoint = null;
    state.focusedNode = null;
    state.navState.focusedIndex = null;
    if (typeof window.setSearchPanelState === 'function') window.setSearchPanelState({ searching: false, focusing: false, resultsRendered: false });
    if (typeof window.hideTooltip === 'function') window.hideTooltip();
    clearSearchPreviewHoverTimer();
    if (typeof window.clearSearchPreviewOverlay === 'function') window.clearSearchPreviewOverlay();
    clearSearchGlow();
    updateSearchTrailCue({ beat: 'idle' });
    document.querySelectorAll('.cluster-item').forEach((el) => el.classList.remove('active'));
    if (typeof syncFilterControls === 'function') syncFilterControls();
    if (state.pointsMesh && state.originalPositions?.length) {
        if (typeof window.resetNodePositions === 'function') window.resetNodePositions({ skipUrlSync: true });
    } else {
        if (typeof window.updateSelectedBusiness === 'function') window.updateSelectedBusiness(null);
    }
    applyFilters();
    if (typeof window.updateExplorationUi === 'function') window.updateExplorationUi();
    updateSearchStatusMessage(getFilteredIndices().length);
    if (typeof window.syncFocusStage === 'function') window.syncFocusStage(null);
    if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
    state.semanticDiveMode = false;
    state.navState.trailCursor = -1;
    state.navState.mode = 'overview';
    state.navState.explorationHistoryIndices = [];
    state.navState.threadCandidates = [];
    state.trailIndices.clear();
    state.nodesAreSettling = false;
}

// === Composition State ===

function getJourneyCompassPresentationState(compassState = {}) {
    const phase = compassState.phase || 'overview';
    const hasTrail = document.body?.dataset?.trailState === 'active';
    if (phase === 'map') {
        return {
            density: 'hidden',
            copy: 'quiet',
            actions: 'minimal',
            navigationOwner: hasTrail ? 'map-trail-strip' : 'map-controls'
        };
    }
    if (phase === 'search' || phase === 'focus') {
        return {
            density: 'compact',
            copy: 'quiet',
            actions: 'primary-secondary',
            navigationOwner: 'scene'
        };
    }
    if (phase === 'inside') {
        return {
            density: 'compact',
            copy: 'quiet',
            actions: 'route',
            navigationOwner: 'inside-walk'
        };
    }
    return {
        density: 'expanded',
        copy: 'full',
        actions: 'standard',
        navigationOwner: 'journey-compass'
    };
}

function syncJourneyCompassActions(compassState = {}) {
    const buttons = [
        [document.getElementById('btn-journey-primary'), compassState.primaryAction, 'primary'],
        [document.getElementById('btn-journey-secondary'), compassState.secondaryAction, 'secondary'],
        [document.getElementById('btn-journey-tertiary'), compassState.tertiaryAction, 'tertiary']
    ];
    buttons.forEach(([button, action, role]) => {
        if (!button) return;
        button.textContent = action?.label || (role === 'primary' ? 'Search' : 'Map');
        button.dataset.journeyAction = action?.action || '';
        const disabled = !action?.action || (action.action === 'next-stop' && state.strandContinuityState?.phase === 'exploring');
        button.disabled = disabled;
        button.setAttribute('aria-disabled', String(disabled));
        button.hidden = !action?.action;
        if (action?.hint) {
            button.setAttribute('aria-label', `${button.textContent} — ${action.hint}`);
            button.setAttribute('title', action.hint);
        } else {
            button.setAttribute('aria-label', button.textContent);
            button.removeAttribute('title');
        }
        // aria-expanded on tertiary button reflects its active state: false when hidden (not active), true when visible
        if (role === 'tertiary') {
            button.setAttribute('aria-expanded', button.hidden ? 'false' : 'true');
        }
    });
}

function syncMapTrailStrip(compassState = {}, presentationState = {}) {
    const strip = document.getElementById('map-trail-strip');
    if (!strip) return;
    const shouldShow =
        state.currentView === 'map' &&
        presentationState.navigationOwner === 'map-trail-strip';

    strip.hidden = !shouldShow;
    strip.setAttribute('aria-hidden', String(!shouldShow));
    if (!shouldShow) return;

    const actions = [
        compassState.primaryAction,
        compassState.secondaryAction,
        compassState.tertiaryAction
    ].filter((action) => action?.action);
    const shortLabel = (action) => {
        if (action.action === 'open-mycelium') return 'Mycelium';
        if (action.action === 'county-overview') return 'Reset';
        if (action.action === 'focus-search') return 'Search';
        return action.label || 'Go';
    };

    strip.replaceChildren();
    const title = document.createElement('div');
    title.className = 'map-strip-title';
    title.textContent = compassState.title || 'Map trail';
    strip.appendChild(title);
    actions.forEach((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'trail-strip-btn';
        button.dataset.journeyAction = action.action;
        button.textContent = shortLabel(action);
        button.addEventListener('click', () => executeJourneyCompassAction(action.action));
        strip.appendChild(button);
    });
}

export function executeJourneyCompassAction(action) {
    switch (action) {
        case 'focus-search':
            document.getElementById('search-input')?.focus();
            return;
        case 'center-anchor': {
            const anchorIndex = Number.isFinite(state.currentSearchSummary?.anchorIndex)
                ? state.currentSearchSummary.anchorIndex
                : Number.isFinite(state.navState?.focusedIndex)
                    ? state.navState.focusedIndex
                    : Number.isFinite(state.focusedNode)
                        ? state.focusedNode
                        : null;
            if (Number.isFinite(anchorIndex)) {
                // "Center Anchor" must set trailDepth=1 (via setTrailDepth) so the Trail chip activates
                if (typeof window.setTrailDepth === 'function') window.setTrailDepth(1, { skipUrlSync: true });
                if (typeof window.focusOnNode === 'function') window.focusOnNode(anchorIndex, { fromSearchResult: !!state.currentSearchSummary });
                if (typeof window.recenterFocusedNode === 'function') {
                    window.recenterFocusedNode();
                }
            }
            return;
        }
        case 'enter-inside':
            if (typeof window.setSemanticDiveMode === 'function') window.setSemanticDiveMode(true);
            return;
        case 'show-trail-panel':
            if (typeof window.setSemanticDiveMode === 'function') window.setSemanticDiveMode(false);
            return;
        case 'next-stop':
            if (state.strandContinuityState?.phase === 'exploring') return;
            if (typeof window.exploreInsideToNextStop === 'function') window.exploreInsideToNextStop();
            return;

        case 'open-map':
            switchView('map');
            return;
        case 'open-mycelium':
            switchView('galaxy');
            return;
        case 'county-overview':
            // resetExplorationFocus() now handles trailDepth, searchGlow, and node positions
            // in one unified call — no separate clearSearch() needed here
            if (typeof window.resetExplorationFocus === 'function') {
                window.resetExplorationFocus();
            } else if (typeof window.resetNodePositions === 'function') {
                window.resetNodePositions();
            }
            // Also clear the search input so the text is gone on return to overview
            {
                const searchInput = document.getElementById('search-input');
                if (searchInput) searchInput.value = '';
                clearShortSemanticSearchState();
            }
            return;
        default:
            return;
    }
}

export function updateJourneyCompass() {
    const capitalize = (s) => s && s.charAt(0).toUpperCase() + s.slice(1);
    const compass = document.getElementById('journey-compass');
    if (!compass) return;
    syncRouteDirectorState('journey-compass');
    const compassState = getJourneyCompassState();
    const phase = compassState.phase || 'overview';
    const presentationState = getJourneyCompassPresentationState(compassState);
    document.body.dataset.journeyPhase = phase;
    document.body.dataset.journeyCompassDensity = presentationState.density;
    document.body.dataset.journeyCompassCopy = presentationState.copy;
    document.body.dataset.journeyNavigationOwner = presentationState.navigationOwner;
    compass.dataset.phase = phase;
    compass.dataset.density = presentationState.density;
    compass.dataset.copy = presentationState.copy;
    compass.dataset.actions = presentationState.actions;
    compass.dataset.navigationOwner = presentationState.navigationOwner;
    compass.setAttribute('aria-live', presentationState.copy === 'full' ? 'polite' : 'off');
    const kicker = document.getElementById('journey-compass-kicker');
    const title = document.getElementById('journey-compass-title');
    const note = document.getElementById('journey-compass-note');
    if (kicker) kicker.textContent = compassState.kicker || 'Journey';
    if (title) title.textContent = compassState.title || 'County overview';
    if (note) {
        note.textContent = compassState.note || 'Search to open one semantic trail.';
        note.classList.toggle('discovery-active', !!compassState.discovery);
    }
    syncJourneyCompassActions(compassState);
    syncMapTrailStrip(compassState, presentationState);

    const order = state.JOURNEY_COMPASS_PHASE_ORDER || ['overview', 'search', 'focus', 'inside', 'map'];
    const activeOrderIndex = order.indexOf(phase);
    compass.querySelectorAll('[data-journey-step]').forEach((step) => {
        const stepIndex = order.indexOf(step.dataset.journeyStep);
        const isCurrent = step.dataset.journeyStep === phase;
        step.classList.toggle('current', isCurrent);
        step.classList.toggle('done', activeOrderIndex >= 0 && stepIndex >= 0 && stepIndex < activeOrderIndex);
        const stepLabel = { overview: 'County overview — see the whole county', search: 'Search — find and center on a business', focus: 'Focus — inspect a centered anchor', inside: 'Inside — explore the neighborhood', map: 'Map — view geographic layer' }[step.dataset.journeyStep] || step.dataset.journeyStep;
        step.setAttribute('aria-label', `${stepIndex + 1}. ${capitalize(step.dataset.journeyStep)}: ${stepLabel}`);
    });
}

function installSemanticJourneyProbe() {
    window.__semanticJourneyProbe = () => {
        const compass = document.getElementById('journey-compass');
        return {
            phase: compass?.dataset?.phase || document.body.dataset.journeyPhase || null,
            title: document.getElementById('journey-compass-title')?.textContent?.trim() || '',
            note: document.getElementById('journey-compass-note')?.textContent?.trim() || '',
            currentSteps: Array.from(document.querySelectorAll('.journey-compass-step.current')).map((step) => step.dataset.journeyStep),
            doneSteps: Array.from(document.querySelectorAll('.journey-compass-step.done')).map((step) => step.dataset.journeyStep),
            routeSteps: Array.from(document.querySelectorAll('.journey-compass-step')).map((step) => step.dataset.journeyStep),
            graphContext: document.body.dataset.graphContext || null,
            panelSurface: document.body.dataset.panelSurface || null,
            panelSurfaceDetail: document.body.dataset.panelSurfaceDetail || null,
            routeDirector: document.body.dataset.routeDirector || null,
            routeDirectorReason: document.body.dataset.routeDirectorReason || '',
            routeExploration: document.body.dataset.routeExploration || 'idle',
            focusOrigin: document.body.dataset.focusOrigin || '',
            focusPanelMode: document.body.dataset.focusPanelMode || '',
            semanticDive: document.body.dataset.semanticDive || null,
            focusTransition: document.body.dataset.focusTransition || null,
            focusTransitionPhase: document.body.dataset.focusTransitionPhase || null,
            cameraAssist: document.body.dataset.cameraAssist || 'free',
            cameraAssistReason: document.body.dataset.cameraAssistReason || '',
            journeyCompassDensity: document.body.dataset.journeyCompassDensity || '',
            journeyCompassCopy: document.body.dataset.journeyCompassCopy || '',
            journeyNavigationOwner: document.body.dataset.journeyNavigationOwner || '',
            viewHandoffActive: document.body.dataset.viewHandoffActive || '',
            cameraSlackState: { ...(state.focusOrbitSlackState || {}) },
            primaryAction: {
                label: document.getElementById('btn-journey-primary')?.textContent?.trim() || '',
                action: document.getElementById('btn-journey-primary')?.dataset?.journeyAction || ''
            },
            secondaryAction: {
                label: document.getElementById('btn-journey-secondary')?.textContent?.trim() || '',
                action: document.getElementById('btn-journey-secondary')?.dataset?.journeyAction || ''
            },
            tertiaryAction: {
                label: document.getElementById('btn-journey-tertiary')?.textContent?.trim() || '',
                action: document.getElementById('btn-journey-tertiary')?.dataset?.journeyAction || '',
                hidden: !!document.getElementById('btn-journey-tertiary')?.hidden
            },
            routeEmbodiment: { ...(state.routeTraceDiagnostics || {}) }
        };
    };
}

function getMobileSearchSheetDetail() {
    if (!document.body?.dataset?.mobileSearchSheet) return 'none';
    return document.body.dataset.mobileSearchSheet === 'expanded' ? 'expanded' : 'peek';
}

function invokeClearMobileRouteFieldPeek() {
    if (typeof window.clearMobileRouteFieldPeek === 'function') {
        window.clearMobileRouteFieldPeek();
        return;
    }
    clearMobileRouteFieldPeek();
}

function derivePanelSurface({ view, graphContext, mapContext, semanticDive, hasSearchIntent, hasFocus, hasActiveTrailState }) {
    if (view !== 'galaxy') {
        if (mapContext === 'focus-search') return 'map-focus-search';
        if (mapContext === 'focus') return 'map-focus';
        if (mapContext === 'search') return 'map-search';
        if (hasActiveTrailState) return 'map-trail';
        return 'map-idle';
    }
    if (semanticDive === 'active') return 'semantic-dive';
    if (graphContext === 'focus-search') return 'focus-search';
    if (graphContext === 'focus') return 'focus';
    if (graphContext === 'search') return 'search';
    if (hasSearchIntent) return hasFocus ? 'focus-search' : 'search';
    return 'idle';
}

/**
 * Synchronizes body dataset attributes with the current application state.
 * Sets activeView, trailState, graphContext, mapContext, semanticDive, and
 * panelSurface so CSS rules and smoke tests observe one canonical panel owner.
 * Restored after Task 616 payload reduction — was inline JS that got stripped.
 */
export function refreshCompositionState() {
    document.body.dataset.activeView = state.currentView || 'galaxy';
    const hasFocusedTrailRecord = Boolean(state.selectedPoint)
        || state.focusedNode !== null && state.focusedNode !== undefined
        || state.navState?.focusedIndex !== null && state.navState?.focusedIndex !== undefined;
    const hasSearch = !!state.currentSearchSummary;
    const searchInputValue = String(document.getElementById('search-input')?.value || '').trim();
    const hasSearchIntent = hasSearch
        || searchInputValue.length >= 2
        || document.querySelector('.search-container.has-query .search-results.active');
    const hasActiveTrailState = state.currentView === 'map'
        ? hasSearchIntent || hasFocusedTrailRecord
        : hasFocusedTrailRecord && (state.navState.mode === 'trail' || hasSearchIntent);
    document.body.dataset.trailState = hasActiveTrailState ? 'active' : 'inactive';
    if (hasSearch || hasFocusedTrailRecord) {
        // Clear transient processing and onboarding feedback once the user is in a live route.
        document.querySelectorAll('.search-result-item.is-processing').forEach((el) => el.classList.remove('is-processing'));

        const hint = document.getElementById('onboarding-hint');
        if (hint) {
            hint.classList.remove('visible');
            hint.setAttribute('aria-hidden', 'true');
            hint._dismissedThisSession = true;
            if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer);
        }
    }

    if (state.currentView !== 'galaxy') {
        let mapContext = 'idle';
        const hasMapFocus = !!state.selectedPoint || state.focusedNode !== null && state.focusedNode !== undefined;
        if (hasMapFocus && hasSearchIntent) {
            mapContext = 'focus-search';
        } else if (hasMapFocus) {
            mapContext = 'focus';
        } else if (hasSearchIntent) {
            mapContext = 'search';
        }
        document.body.dataset.mapContext = mapContext;
        document.body.dataset.graphContext = 'idle';
        document.body.dataset.semanticDive = 'inactive';
        document.body.dataset.panelSurface = derivePanelSurface({
            view: state.currentView,
            graphContext: 'idle',
            mapContext,
            semanticDive: 'inactive',
            hasSearchIntent,
            hasFocus: hasMapFocus,
            hasActiveTrailState
        });
        document.body.dataset.panelSurfaceDetail = 'none';
        syncRouteDirectorState('composition-map');
        if (typeof updateSelectedCardHeading === 'function') updateSelectedCardHeading();
        if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
        if (typeof window.updateJourneyCompass === 'function') window.updateJourneyCompass();
        if (typeof window.updateFocusNeighborRail === 'function') window.updateFocusNeighborRail();
        refreshMapMarkers();
        refreshMapRouteEmbodiment();
        if (typeof window.refreshRouteTraceOverlay === 'function') {
            window.refreshRouteTraceOverlay({ reason: 'composition-map' });
        }
        return;
    }

    document.body.dataset.mapContext = 'idle';
    const hasFocus = Boolean(state.selectedPoint)
        || state.focusedNode !== null && state.focusedNode !== undefined
        || state.navState?.focusedIndex !== null && state.navState?.focusedIndex !== undefined;
    const semanticDive = state.semanticDiveMode && hasFocus ? 'active' : 'inactive';
    document.body.dataset.semanticDive = semanticDive;
    let context = 'idle';
    if (hasFocus && hasSearchIntent) {
        context = 'focus-search';
    } else if (hasFocus) {
        context = 'focus';
    } else if (hasSearchIntent) {
        context = 'search';
    }
    document.body.dataset.graphContext = context;
    document.body.dataset.panelSurface = derivePanelSurface({
        view: state.currentView,
        graphContext: context,
        mapContext: 'idle',
        semanticDive,
        hasSearchIntent,
        hasFocus,
        hasActiveTrailState
    });
    document.body.dataset.panelSurfaceDetail = context === 'search' || context === 'focus-search'
        ? getMobileSearchSheetDetail()
        : 'none';
    if (context !== 'idle') {
        invokeClearMobileRouteFieldPeek();
    }
    syncRouteDirectorState('composition-galaxy');
    if (typeof updateSelectedCardHeading === 'function') updateSelectedCardHeading();
    if (typeof window.updateLegendGuideState === 'function') window.updateLegendGuideState();
    if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
    if (typeof window.updateJourneyCompass === 'function') window.updateJourneyCompass();
    if (typeof window.updateFocusNeighborRail === 'function') window.updateFocusNeighborRail();
    refreshMapMarkers();
    refreshMapRouteEmbodiment();
    if (typeof window.refreshRouteTraceOverlay === 'function') {
        window.refreshRouteTraceOverlay({ reason: 'composition-galaxy' });
    }
}

// === View Management ===

function scheduleMapRouteRefresh() {
    const refresh = () => {
        if (state.currentView !== 'map') return;
        refreshMapRouteEmbodiment();
        centerMapOnRouteAnchor();
    };
    refresh();
    window.requestAnimationFrame(() => window.requestAnimationFrame(refresh));
    [120, 450, (state.MAP_HANDOFF_PRELUDE_MS || 1200) + 100].forEach((delay) => {
        window.setTimeout(refresh, delay);
    });
}

function getViewHandoffModel(view) {
    const focusPoint = getFocusedJourneyPoint();
    const focusName = focusPoint ? formatBusinessName(focusPoint.name || 'this business') : '';
    const hasSearch = !!state.currentSearchSummary;
    const searchLabel = hasSearch
        ? cleanPublicNoteText(state.currentSearchSummary.query || state.currentSearchSummary.label || 'current trail')
        : '';

    if (view === 'map') {
        const routeCount = getRouteEmbodimentIndices().length;
        const origin = state.terrainHandoffState?.from || (typeof window.getRouteLayerOrigin === 'function' ? window.getRouteLayerOrigin() : 'galaxy');
        if (focusName && hasSearch) {
            return {
                icon: 'map',
                kicker: routeCount > 1 ? 'Same trail: terrain' : 'Route layer: map',
                title: 'The semantic trail lands on terrain',
                note: origin === 'inside' || origin === 'walk'
                    ? `${focusName} stays anchored while the inside walk becomes physical distance.`
                    : `${focusName} stays anchored while "${searchLabel}" becomes physical distance.`
            };
        }
        if (focusName) {
            return {
                icon: 'map',
                kicker: routeCount > 1 ? 'Same trail: terrain' : 'Route layer: map',
                title: 'The focused record lands on terrain',
                note: routeCount > 1
                    ? `${focusName} keeps the same neighbors; only the layer changed.`
                    : `${focusName} keeps its semantic context while county distance becomes visible.`
            };
        }
        return {
            icon: 'map',
            kicker: 'Route layer: map',
            title: 'Geography carries the last layer',
            note: 'Semantic colors remain, but physical distance is now the thing to read.'
        };
    }

    if (focusName && hasSearch) {
        return {
            icon: 'mycelium',
            kicker: 'Route layer: mycelium',
            title: 'The trail returns to the living field',
            note: `${focusName} remains the anchor for "${searchLabel}" inside the semantic cloud.`
        };
    }
    if (focusName) {
        return {
            icon: 'mycelium',
            kicker: 'Route layer: mycelium',
            title: 'The record returns to its pocket',
            note: `${focusName} is back inside its semantic neighborhood.`
        };
    }
    return {
        icon: 'mycelium',
        kicker: 'Route layer: mycelium',
        title: 'Mycelium view restored',
        note: 'Semantic neighborhoods breathe as one living field.'
    };
}

export function hideViewHandoff() {
    const handoff = document.getElementById('view-handoff');
    if (state.viewHandoffTimer) {
        window.clearTimeout(state.viewHandoffTimer);
        state.viewHandoffTimer = null;
    }
    document.body.dataset.viewHandoffActive = 'false';
    if (!handoff) return;
    handoff.classList.remove('active');
    handoff.setAttribute('aria-hidden', 'true');
}

export function showViewHandoff(view) {
    const handoff = document.getElementById('view-handoff');
    if (!handoff) return;
    const model = getViewHandoffModel(view);
    const runeEl = document.getElementById('view-handoff-rune');
    const kickerEl = document.getElementById('view-handoff-kicker');
    const titleEl = document.getElementById('view-handoff-title');
    const noteEl = document.getElementById('view-handoff-note');

    if (runeEl) {
        runeEl.innerHTML = semanticGuideIcon(model.icon, view === 'map' ? 'Map view' : 'Mycelium view');
    }
    if (kickerEl) kickerEl.textContent = model.kicker;
    if (titleEl) titleEl.textContent = model.title;
    if (noteEl) noteEl.textContent = model.note;

    if (state.viewHandoffTimer) {
        window.clearTimeout(state.viewHandoffTimer);
        state.viewHandoffTimer = null;
    }

    handoff.setAttribute('aria-hidden', 'false');
    handoff.classList.add('active');
    document.body.dataset.viewHandoffActive = 'true';
    state.viewHandoffTimer = window.setTimeout(() => {
        handoff.classList.remove('active');
        handoff.setAttribute('aria-hidden', 'true');
        document.body.dataset.viewHandoffActive = 'false';
        state.viewHandoffTimer = null;
    }, 2200);
}

export function switchView(view, options = {}) {
    invokeClearMobileRouteFieldPeek();
    const previousView = state.currentView;
    const handoffFrom = options.handoffFrom || (typeof window.getRouteLayerOrigin === 'function' ? window.getRouteLayerOrigin() : 'galaxy');
    const shouldPreludeToMap =
        view === 'map' &&
        previousView === 'galaxy' &&
        !options.skipTerrainPrelude &&
        !options.skipUrlSync &&
        !options.silentHandoff;
    if (shouldPreludeToMap) {
        const routeCount = getRouteEmbodimentIndices().length;
        if (state.viewSwitchPreludeTimer) {
            window.clearTimeout(state.viewSwitchPreludeTimer);
            state.viewSwitchPreludeTimer = null;
        }
        setTerrainHandoffState('flattening', {
            from: handoffFrom,
            to: 'map',
            routeCount
        });
        if (typeof window.setRouteChoreographyPhase === 'function') {
            window.setRouteChoreographyPhase('terrain-prelude', {
                reason: 'map-prelude',
                anchorIndex: state.currentSearchSummary?.anchorIndex ?? state.navState?.focusedIndex ?? null,
                indexCount: routeCount
            });
        }
        if (typeof window.animateCameraToTerrainPrelude === 'function') {
            window.animateCameraToTerrainPrelude({ duration: state.MAP_HANDOFF_PRELUDE_MS || 1200 });
        }
        
        // 10/10 Polish: Flatten Three.js nodes to map coordinates during prelude
        if (typeof window.applyMapFlatteningLayout === 'function') {
            window.applyMapFlatteningLayout(true);
        }

        if (typeof window.showViewHandoff === 'function') window.showViewHandoff('map');
        state.viewSwitchPreludeTimer = window.setTimeout(() => {
            state.viewSwitchPreludeTimer = null;
            if (state.currentView !== 'galaxy') return;
            switchView('map', {
                ...options,
                skipTerrainPrelude: true,
                handoffFrom
            });
        }, state.MAP_HANDOFF_PRELUDE_MS || 1200);
        return;
    }
    state.currentView = view;
    
    // 10/10 Polish: Transition Choreography
    document.body.classList.add('view-transitioning');
    document.body.dataset.activeView = view;
    document.body.dataset.cameraAssist = 'arriving';
    
    // Auto-remove transitioning class after animation completes
    window.setTimeout(() => {
        document.body.classList.remove('view-transitioning');
        if (document.body.dataset.cameraAssist === 'arriving') {
            document.body.dataset.cameraAssist = 'free';
        }
    }, 1200);
    
    if (view === 'map') {
        if (typeof window.hideViewHandoff === 'function') window.hideViewHandoff();
        scheduleMapRouteRefresh();
    }
    if (view !== 'galaxy' && view !== 'map') {
        if (typeof window.clearRouteExploration === 'function') window.clearRouteExploration('map-handoff');
    } else if (previousView === 'map' && Number.isFinite(state.navState.focusedIndex)) {
        // 10/10 Polish: Reset map flattening
        if (typeof window.applyMapFlatteningLayout === 'function') {
            window.applyMapFlatteningLayout(false);
        }
        
        // returning to galaxy from map while focused: restore focus pocket camera depth
        if (typeof window.animateCameraToNode === 'function') {
            window.animateCameraToNode(state.navState.focusedIndex, { 
                transitionStyle: state.semanticDiveMode ? 'dive' : 'focus',
                duration: 1100 
            });
        }
    }

    const legendPanel = document.getElementById('legend-panel');
    const legendToggle = document.getElementById('btn-legend');
    if (legendPanel && legendToggle) {
        legendPanel.classList.remove('active');
        legendPanel.setAttribute('aria-hidden', 'true');
        document.documentElement.dataset.legendActive = 'false';
        legendToggle.setAttribute('aria-expanded', 'false');
        legendToggle.setAttribute('aria-pressed', 'false');
        legendToggle.setAttribute('aria-label', 'Show field guide');
    }

    const btnGalaxy = document.getElementById('btn-galaxy');
    const btnMap = document.getElementById('btn-map');
    if (btnGalaxy) {
        btnGalaxy.classList.toggle('active', view === 'galaxy');
        btnGalaxy.setAttribute('aria-pressed', String(view === 'galaxy'));
    }
    if (btnMap) {
        btnMap.classList.toggle('active', view === 'map');
        btnMap.setAttribute('aria-pressed', String(view === 'map'));
    }

    const canvasContainer = document.getElementById('canvas-container');
    const mapContainer = document.getElementById('map-container');
    if (state.viewSwitchPreludeTimer) {
        window.clearTimeout(state.viewSwitchPreludeTimer);
        state.viewSwitchPreludeTimer = null;
    }

    // Clean up orphaned timers when leaving galaxy view
    if (view !== 'galaxy') {
        if (state.clockTimer) {
            window.clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        clearWeatherRefreshTimer();
        if (state.semanticLaneMonitorTimer) {
            window.clearInterval(state.semanticLaneMonitorTimer);
            state.semanticLaneMonitorTimer = null;
        }
        if (state.semanticLaneOpsRefreshTimer) {
            window.clearInterval(state.semanticLaneOpsRefreshTimer);
            state.semanticLaneOpsRefreshTimer = null;
        }
    }

    if (view === 'galaxy') {
        if (previousView === 'map') {
            setTerrainHandoffState('returning', {
                from: state.terrainHandoffState?.from || 'map',
                to: 'galaxy',
                routeCount: getRouteEmbodimentIndices().length,
                settleAfterMs: 1200,
                settlePhase: 'idle'
            });
        } else {
            setTerrainHandoffState('idle', { from: handoffFrom, to: 'galaxy' });
        }
        if (canvasContainer) canvasContainer.classList.remove('hidden');
        if (mapContainer) mapContainer.classList.remove('active');
        clearWeatherEffects();
        document.getElementById('weather-overlay')?.classList.remove('active');
        if (state.selectedPoint) {
            const selectedIndex = state.points.indexOf(state.selectedPoint);
            if (selectedIndex >= 0) {
                if (typeof window.focusOnNode === 'function') {
                    window.focusOnNode(selectedIndex, {
                        skipUrlSync: true,
                        fromSearchResult: !!state.currentSearchSummary,
                        restoreHistory: true,
                        preserveMode: true
                    });
                }
                if (typeof window.setTrailFromSeed === 'function') {
                    window.setTrailFromSeed(selectedIndex);
                }
            }
        } else if (
            state.currentSearchSummary?.anchorIndex !== null &&
            state.currentSearchSummary?.anchorIndex !== undefined
        ) {
            const anchorIndex = state.currentSearchSummary.anchorIndex;
            if (typeof window.setRouteChoreographyPhase === 'function') {
                window.setRouteChoreographyPhase('search-corridor', {
                    reason: 'return-to-mycelium-search',
                    anchorIndex,
                    indexCount: state.currentSearchSummary.resultIndices?.length || 0
                });
            }
            if (typeof window.animateCameraToSearchCorridor === 'function') {
                window.animateCameraToSearchCorridor(
                    anchorIndex,
                    state.currentSearchSummary.resultIndices || [],
                    {
                        reason: 'return-to-mycelium'
                    }
                );
            }
            if (typeof window.focusOnNode === 'function') {
                window.focusOnNode(anchorIndex, {
                    skipUrlSync: true,
                    fromSearchResult: true,
                    restoreHistory: true,
                    preserveMode: true
                });
            }
            if (typeof window.setTrailFromSeed === 'function') {
                window.setTrailFromSeed(anchorIndex);
            }
        } else {
            if (typeof window.setRouteChoreographyPhase === 'function') {
                window.setRouteChoreographyPhase('overview', {
                    reason: 'return-to-mycelium-overview',
                    anchorIndex: null,
                    indexCount: 0
                });
            }
        }
    } else {
        const routeCount = getRouteEmbodimentIndices().length;
        setTerrainHandoffState('landing', {
            from: handoffFrom,
            to: 'map',
            routeCount,
            settleAfterMs: 1800,
            settlePhase: 'settled'
        });
        if (typeof window.setRouteChoreographyPhase === 'function') {
            window.setRouteChoreographyPhase('terrain-landing', {
                reason: 'map-handoff',
                anchorIndex: state.currentSearchSummary?.anchorIndex ?? state.navState?.focusedIndex ?? null,
                indexCount: routeCount
            });
        }
        initMap()
            .then(() => {
                if (state.currentView !== 'map') return;
                if (state.map) {
                    setTimeout(() => {
                        state.map.invalidateSize();
                        scheduleMapRouteRefresh();
                    }, 100);
                }
                if (state.weather) applyWeatherEffects();
            })
            .catch((error) => {
                console.error('Map initialization failed:', error);
            });
        if (!state.weatherInitialized) {
            scheduleWeatherHydration();
        }
        if (canvasContainer) canvasContainer.classList.add('hidden');
        if (mapContainer) mapContainer.classList.add('active');
    }

    if (!options.skipUrlSync) {
        if (typeof window.updateUrlState === 'function') {
            window.updateUrlState({}, { mode: options.historyMode || 'push', reason: 'view' });
        }
    }
    if (typeof window.syncClusterSectionState === 'function') window.syncClusterSectionState();
    if (typeof window.updateLegendGuideState === 'function') window.updateLegendGuideState();
    if (typeof window.syncFocusStage === 'function') window.syncFocusStage(state.selectedPoint);
    if (!state.selectedPoint && typeof window.updateSelectedBusiness === 'function') {
        window.updateSelectedBusiness(null);
    }
    if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
    if (!options.silentHandoff) {
        if (typeof window.showViewHandoff === 'function') window.showViewHandoff(view);
    }
}

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

// === Search UI ===

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

// === Semantic Guide Summary Card ===

function getMostFrequent(values) {
    if (!values?.length) return null;
    const counts = values.reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
    return Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b));
}

function generateLogicalSynthesis(payload) {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (!results.length) return 'Search opens a trail — explore the neighborhood below.';

    const query = payload.query || 'this search';
    const clusters = results.map((row) => row.cluster_label).filter(Boolean);
    const cities = [...new Set(results.map((row) => row.city).filter(Boolean))];
    const topCluster = clusters.length ? getMostFrequent(clusters) : 'mixed themes';
    const citySummary =
        cities.length > 1 ? `${cities.length} cities including ${cities.slice(0, 2).join(' and ')}` : cities[0] || 'Montgomery County';

    return `Logical mapping of ${payload.visible_matches || results.length} matches for "${query}". Strongest thematic overlap in ${topCluster} with signal across ${citySummary}. Trail anchored by ${results[0]?.name || 'the primary match'}.`;
}

function buildClientSemanticGuideFallback(payload) {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const anchor = results.find((row) => String(row.lead_id) === String(payload?.anchor_lead_id)) || results[0] || null;
    const suggestions = results.slice(0, 3).map((row, index) => ({
        lead_id: row.lead_id,
        label: index === 0 ? 'Trail anchor' : index === 1 ? 'Next stop' : 'Side trail',
        name: row.name,
        city: row.city || '',
        reason:
            index === 0
                ? 'Start with the strongest semantic anchor.'
                : row.cluster_label
                  ? `Follow the ${row.cluster_label} trail.`
                  : 'Keep exploring the current semantic neighborhood.'
    }));

    return {
        title: anchor?.name ? `${anchor.name} anchors this trail` : `Guide for "${payload?.query || 'this trail'}"`,
        summary: generateLogicalSynthesis(payload),
        suggestions,
        degraded: true,
        cached: false,
        source: 'deterministic',
        mode: 'fallback'
    };
}

function semanticGuideIcon(id, label = '') {
    return `<svg class="ui-icon" aria-hidden="${label ? 'false' : 'true'}"${label ? ` aria-label="${escapeHtml(label)}"` : ''}><use href="#icon-${escapeHtml(id)}"></use></svg>`;
}

function getSemanticGuideButtonHtml(mode = 'ready') {
    if (mode === 'loading') return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Reading connections...`;
    if (mode === 'refresh') return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Refresh Suggestions`;
    return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Summarize Results<span class="guide-btn-hint"> — explain the strongest connections</span>`;
}

export function setSemanticGuideButtonState(button, mode = 'ready', options = {}) {
    if (!button) return;
    const isLoading = mode === 'loading';
    button.disabled = Object.prototype.hasOwnProperty.call(options, 'disabled') ? !!options.disabled : isLoading;
    button.classList.toggle('is-loading', isLoading);
    button.innerHTML = getSemanticGuideButtonHtml(mode);
}

function getSemanticGuideLoadingCardConfig() {
    return {
        title: 'READING CONNECTIONS',
        text: 'The semantic guide is reading this neighborhood and preparing the next three strongest stops.',
        suggestions: [],
        laneStatus: 'Preparing trail',
        instant: true
    };
}

function getSemanticGuideTitle(guide = {}) {
    if (guide.title) return String(guide.title).toUpperCase();
    if (guide.degraded) return 'FAST FALLBACK';
    if (guide.cached) return 'SAVED SUMMARY';
    return 'SEARCH SUMMARY';
}

function getSemanticGuideLaneStatus(guide = {}) {
    if (guide.degraded) return 'Quick summary ready';
    return guide.cached ? 'Saved summary' : 'Fresh summary';
}

function buildSemanticGuideCardConfig(guide = {}) {
    return {
        title: getSemanticGuideTitle(guide),
        text: guide.summary || 'The current neighborhood is ready.',
        suggestions: guide.suggestions || [],
        laneStatus: getSemanticGuideLaneStatus(guide)
    };
}

function buildSemanticGuideFallbackCardConfig(fallback = {}) {
    return {
        title: (fallback.title || 'FAST FALLBACK').toUpperCase(),
        text: fallback.summary || 'Search opens a trail — explore the neighborhood below.',
        suggestions: fallback.suggestions || [],
        laneStatus: 'Deterministic fallback active',
        instant: true
    };
}

function normalizeSummarySuggestions(items = []) {
    return Array.isArray(items) ? items.filter((item) => item && item.lead_id) : [];
}

function getSummarySuggestionIcon(label = '') {
    if (label === 'Trail anchor') return semanticGuideIcon('guide', 'Trail anchor');
    if (label === 'Next stop') return semanticGuideIcon('arrow-right', 'Next stop');
    return semanticGuideIcon('mycelium', 'Related record');
}

function buildSummarySuggestionButtonHtml(item = {}) {
    const label = item.label || 'Related record';
    const name = item.name || 'Open record';
    return `
        <button class="suggestion-btn" type="button" data-lead-id="${escapeHtml(String(item.lead_id))}" data-name="${escapeHtml(name)}" aria-label="${escapeHtml(label)}: ${escapeHtml(name)}">
            <span>${getSummarySuggestionIcon(item.label)}</span>
            <span class="suggestion-copy">
                <span class="suggestion-label">${escapeHtml(label)}</span>
                <span class="suggestion-name">${escapeHtml(name)}</span>
                <span class="suggestion-reason">${escapeHtml(item.reason || '')}</span>
            </span>
        </button>
    `;
}

function focusSummarySuggestion(leadId, sourceEl = null) {
    const targetIndex = state.pointIndexByLeadId?.get?.(String(leadId));
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    // During degraded state (no active search), use the suggestion's name to trigger a search
    if (!state.currentSearchSummary) {
        const name = sourceEl?.dataset?.name || '';
        if (name) {
            search(name);
            return true;
        }
        return false;
    }
    if (targetIndex === undefined || !resultsEl || !statusEl) return false;
    const point = state.points[targetIndex];
    if (!point) return false;
    beginSearchFocusTransition(resultsEl, statusEl, state.currentSearchSummary.resultIndices, targetIndex, point, sourceEl);
    return true;
}

function bindSummarySuggestionClicks(suggestionsEl) {
    if (!suggestionsEl) return;
    suggestionsEl.querySelectorAll('[data-lead-id]').forEach((button) => {
        button.onclick = () => focusSummarySuggestion(button.dataset.leadId, button);
    });
}

function renderSummarySuggestions(suggestionsEl, items = []) {
    if (!suggestionsEl) return;
    const suggestions = normalizeSummarySuggestions(items);
    suggestionsEl.innerHTML = suggestions.map(buildSummarySuggestionButtonHtml).join('');
    bindSummarySuggestionClicks(suggestionsEl);
}

function getSummaryCardElements() {
    const card = document.getElementById('semantic-summary-card');
    const textEl = document.getElementById('summary-text');
    const suggestions = document.getElementById('summary-suggestions');
    const titleEl = document.getElementById('summary-card-title-text');
    const laneStatusEl = document.getElementById('summary-lane-status');

    return {
        card,
        textEl,
        suggestions,
        titleEl,
        laneStatusEl,
        isReady: !!(card && textEl && suggestions)
    };
}

function normalizeSummaryCardConfig(config = {}) {
    const settings = typeof config === 'string' ? { text: config } : config || {};
    return {
        ...settings,
        text: String(settings.text || ''),
        title: String(settings.title || 'Search').trim() || 'Search',
        laneStatus: String(settings.laneStatus || 'Ready').trim() || 'Ready',
        suggestions: Array.isArray(settings.suggestions) ? settings.suggestions : [],
        instant: !!settings.instant
    };
}

function setSummaryCardVisibility(elements, isVisible) {
    if (!elements?.card) return;
    if (isVisible) elements.card.hidden = false;
    elements.card.classList.toggle('hidden', !isVisible);
    elements.card.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    if (!isVisible) elements.card.hidden = true;
}

function getSummaryTrailStoryElements() {
    const note = document.getElementById('summary-gemma-story') || document.getElementById('summary-trail-story');
    return {
        note,
        text: document.getElementById('summary-gemma-story-text') || document.getElementById('summary-trail-story-text'),
        source: document.getElementById('summary-gemma-story-source') || document.getElementById('summary-trail-story-source'),
        isReady: !!note
    };
}

function hideSummaryTrailStoryNote() {
    const elements = getSummaryTrailStoryElements();
    if (!elements.isReady) return;
    elements.note.classList.add('hidden');
    elements.note.setAttribute('aria-hidden', 'true');
    if (elements.text) elements.text.textContent = '';
    if (elements.source) elements.source.textContent = '';
}

function resetSummaryCardContent(elements, settings) {
    elements.card.classList.remove('is-synthesizing');
    elements.textEl.textContent = '';
    hideSummaryTrailStoryNote();
    elements.suggestions.classList.remove('active');
    renderSummarySuggestions(elements.suggestions, settings.suggestions);
    if (elements.titleEl) elements.titleEl.textContent = settings.title;
    if (elements.laneStatusEl) elements.laneStatusEl.textContent = settings.laneStatus;
}

function revealSummaryCardSuggestions(elements, suggestions = []) {
    if (suggestions.length) elements.suggestions.classList.add('active');
}

function typeSummaryCardText(elements, text, suggestions, typeToken) {
    let index = 0;
    const speed = 16;

    function type() {
        if (typeToken !== state.summaryCardTypeToken) return;
        if (index < text.length) {
            elements.textEl.textContent += text.charAt(index);
            index += 1;
            window.setTimeout(type, speed);
        } else {
            revealSummaryCardSuggestions(elements, suggestions);
        }
    }

    type();
}

export function showSummaryCard(config = {}) {
    const elements = getSummaryCardElements();
    if (!elements.isReady) return;
    const settings = normalizeSummaryCardConfig(config);
    state.currentSemanticGuide = settings;
    state.summaryCardTypeToken = (state.summaryCardTypeToken || 0) + 1;
    const typeToken = state.summaryCardTypeToken;

    setSummaryCardVisibility(elements, true);
    resetSummaryCardContent(elements, settings);

    if (settings.instant) {
        elements.textEl.textContent = settings.text;
        revealSummaryCardSuggestions(elements, settings.suggestions);
        return;
    }

    typeSummaryCardText(elements, settings.text, settings.suggestions, typeToken);
}

export function hideSummaryCard() {
    state.summaryCardTypeToken = (state.summaryCardTypeToken || 0) + 1;
    hideSummaryTrailStoryNote();
    const elements = getSummaryCardElements();
    if (elements.suggestions) {
        elements.suggestions.innerHTML = '';
        elements.suggestions.classList.remove('active');
    }
    setSummaryCardVisibility(elements, false);
}

const SEMANTIC_GUIDE_TIMEOUT_MS = 30000;

async function fetchSemanticGuide(payload, signal) {
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, SEMANTIC_GUIDE_TIMEOUT_MS);
    const abortFromRequest = () => timeoutController.abort(signal?.reason);

    if (signal?.aborted) {
        abortFromRequest();
    } else {
        signal?.addEventListener('abort', abortFromRequest, { once: true });
    }

    let response;
    try {
        response = await fetch('api.php?action=semantic_guide', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            cache: 'no-store',
            body: JSON.stringify(payload),
            signal: timeoutController.signal
        });
    } catch (error) {
        if (timedOut) {
            const timeoutError = new Error('Guide response timed out. Showing a local summary instead.');
            Object.defineProperty(timeoutError, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
            throw timeoutError;
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortFromRequest);
    }

    let result;
    try {
        result = await response.json();
    } catch (jsonErr) {
        Object.defineProperty(jsonErr, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
        throw new Error('Guide response returned invalid JSON.', { cause: jsonErr });
    }

    if (!response.ok || !result?.ok) {
        const err = new Error(result?.error || 'Guide response is unavailable right now.');
        Object.defineProperty(err, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
        throw err;
    }

    return result;
}

function startSemanticGuideRequest(button) {
    if (state.semanticGuideAbortController) {
        state.semanticGuideAbortController.abort();
        state.semanticGuideAbortController = null;
    }
    const requestId = (state.semanticGuideRequestSequence = (state.semanticGuideRequestSequence || 0) + 1);
    const controller = new AbortController();
    state.semanticGuideAbortController = controller;
    setSemanticGuideButtonState(button, 'loading');

    const card = document.getElementById('semantic-summary-card');
    if (card) card.classList.add('is-synthesizing');
    showSummaryCard(getSemanticGuideLoadingCardConfig());
    if (card) card.classList.add('is-synthesizing');

    return { requestId, controller };
}

function isSemanticGuideRequestCurrent(requestId) {
    return requestId === state.semanticGuideRequestSequence;
}

function isSemanticGuideRequestCancelled(requestId, controller) {
    return controller.signal.aborted || !isSemanticGuideRequestCurrent(requestId);
}

function showSemanticGuideSuccess(guide) {
    showSummaryCard(buildSemanticGuideCardConfig(guide));
}

function showSemanticGuideFailure(payload, error) {
    const card = document.getElementById('semantic-summary-card');
    if (card) card.classList.remove('is-synthesizing');
    hideSummaryTrailStoryNote();
    const fallback = buildClientSemanticGuideFallback(payload, error?.message || 'Guide response is still warming up.');
    showSummaryCard(buildSemanticGuideFallbackCardConfig(fallback));
}

function finishSemanticGuideRequest(controller, button) {
    if (state.semanticGuideAbortController === controller) {
        state.semanticGuideAbortController = null;
    }
    setSemanticGuideButtonState(button, 'refresh', { disabled: false });
    if (typeof window.updateLegendGuideState === 'function') window.updateLegendGuideState();
}

export async function requestSemanticGuide() {
    const payload = buildSemanticGuideRequestPayload();
    const button = document.getElementById('btn-synthesize');
    if (!payload) return;

    const { requestId, controller } = startSemanticGuideRequest(button);

    try {
        const guide = await fetchSemanticGuide(payload, controller.signal);
        if (!isSemanticGuideRequestCurrent(requestId)) return;
        showSemanticGuideSuccess(guide);
        if (typeof window.showSemanticThreadsDetail === 'function') {
            window.showSemanticThreadsDetail();
        }
    } catch (error) {
        if (isSemanticGuideRequestCancelled(requestId, controller)) return;
        Object.defineProperty(error, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
        showSemanticGuideFailure(payload, error);
    } finally {
        finishSemanticGuideRequest(controller, button);
    }
}

export { focusOnNode } from './camera-controls.js';

export function focusOnPoint(point, options = {}) {
    if (!point) return false;
    const pointIndex = state.points.indexOf(point);
    state.selectedPoint = point;
    if (pointIndex >= 0) return focusOnNode(pointIndex, options);
    if (typeof window.updateSelectedBusiness === 'function') window.updateSelectedBusiness(point, options);
    if (!options.skipUrlSync && typeof window.updateUrlState === 'function') {
        window.updateUrlState({ record: point.lead_id || null }, { mode: options.historyMode || 'push', reason: 'focus' });
    }
    if (typeof window.updateJourneyCompass === 'function') window.updateJourneyCompass();
    return true;
}

export function resetNodePositions(options = {}) {
    if (!options.preserveSearch) clearSearchGlow();
    state.focusedNode = null;
    state.selectedPoint = null;
    state.navState.mode = 'overview';
    state.navState.focusedIndex = null;
    state.navState.trailSeedIndex = null;
    state.navState.trailNeighborIndices = [];
    state.navState.trailCursor = -1;
    state.navState.explorationHistoryIndices = [];
    state.navState.lastTraversalReason = null;
    state.navState.focusPocketIndices = [];
    state.focusPocketMotionByIndex = new Map();
    state.navState.focusPocketRoleByIndex = new Map();
    state.navState.focusPocketMeta = null;
    state.semanticDiveMode = false;
    document.body.dataset.focusOrigin = 'overview';
    document.body.dataset.focusPanelMode = 'overview';
    if (Array.isArray(state.originalPositions) && state.originalPositions.length) {
        state.targetPositions = state.originalPositions.map((position) => ({ ...position }));
    }
    if (typeof window.updateSelectedBusiness === 'function') window.updateSelectedBusiness(null);
    if (typeof window.applyPointFilterColors === 'function') window.applyPointFilterColors();
    if (typeof window.updateTraversalUi === 'function') window.updateTraversalUi();
    refreshMapRouteEmbodiment();
    if (typeof window.refreshCompositionState === 'function') window.refreshCompositionState();
    if (!options.skipUrlSync && typeof window.updateUrlState === 'function') {
        window.updateUrlState({ record: null }, { reason: 'reset' });
    }
}

// === Input Helpers & Legend ===

export function isKeyboardTextEntryTarget(target) {
    if (!target || typeof target.tagName !== 'string') return false;
    const tagName = target.tagName.toLowerCase();
    const type = typeof target.type === 'string' ? target.type.toLowerCase() : '';
    
    if (tagName === 'input' && (type === 'text' || type === 'search' || type === 'email' || type === 'url' || type === 'password')) {
        return true;
    }
    if (tagName === 'textarea') return true;
    if (target.isContentEditable) return true;
    
    return false;
}

export function isKeyboardControlTarget(target) {
    if (!target || typeof target.tagName !== 'string') return false;
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'button' || tagName === 'select' || tagName === 'a') return true;
    return false;
}

export function updateLegendGuideState() {
    const legendPanel = document.getElementById('legend-panel');
    if (!legendPanel) return;
    const guide = state.currentSemanticGuide;
    if (!guide) {
        if (legendPanel.classList.contains('active')) {
            legendPanel.classList.remove('active');
            legendPanel.setAttribute('aria-hidden', 'true');
            legendPanel.innerHTML = '';
            document.documentElement.dataset.legendActive = 'false';
        }
        return;
    }
    // Auto-open the legend panel when guide data is available
    if (!legendPanel.classList.contains('active')) {
        legendPanel.classList.add('active');
        legendPanel.setAttribute('aria-hidden', 'false');
        document.documentElement.dataset.legendActive = 'true';
        const legendToggle = document.getElementById('btn-legend');
        if (legendToggle) {
            legendToggle.setAttribute('aria-expanded', 'true');
            legendToggle.setAttribute('aria-pressed', 'true');
            legendToggle.setAttribute('aria-label', 'Hide field guide');
        }
    }
    const kicker = guide.laneStatus || 'Field Guide';
    const title = getSemanticGuideTitle(guide);
    const note = guide.text || '';
    const next = guide.nextLabel || '';
    legendPanel.innerHTML = `
        <div class="legend-guide">
            <div class="legend-guide-head">
                <span class="legend-guide-kicker">${escapeHtml(kicker)}</span>
            </div>
            <div class="legend-guide-title">${escapeHtml(title)}</div>
            ${note ? `<div class="legend-guide-note">${escapeHtml(note)}</div>` : ''}
            ${next ? `<div class="legend-guide-next">${escapeHtml(next)}</div>` : ''}
        </div>
    `;
}

export function closeLegendGuide(options = {}) {
    const legendPanel = document.getElementById('legend-panel');
    const legendToggle = document.getElementById('btn-legend');
    if (!legendPanel || !legendPanel.classList.contains('active')) return;

    legendPanel.classList.remove('active');
    legendPanel.setAttribute('aria-hidden', 'true');
    document.documentElement.dataset.legendActive = 'false';
    if (legendToggle) {
        legendToggle.setAttribute('aria-expanded', 'false');
        legendToggle.setAttribute('aria-pressed', 'false');
        legendToggle.setAttribute('aria-label', 'Show field guide');
    }

    if (options.restoreFocusPanel !== false && typeof window.restoreLegendCollapsedPanel === 'function') {
        window.restoreLegendCollapsedPanel();
    }
    if (options.restoreFocus) {
        if (window._previouslyFocusedLegend) {
            window._previouslyFocusedLegend.focus({ preventScroll: true });
        } else if (legendToggle) {
            legendToggle.focus({ preventScroll: true });
        }
    }
}

// === Keyboard Shortcuts Hint Panel ===

let _shortcutsPanelArrowToastShown = false;
let _keyboardShortcutKeyListenerBound = false;

export function initKeyboardShortcutsHint() {
    // Don't re-create if already in DOM
    if (document.getElementById('keyboard-hint-panel')) return;

    let _previouslyFocused = null;

    const panel = document.createElement('div');
    panel.id = 'keyboard-hint-panel';
    panel.className = 'keyboard-hint-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Keyboard shortcuts');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
        <div class="kh-title">Keyboard Shortcuts</div>
        <div class="kh-row"><span class="kh-keys"><kbd>Arrow</kbd></span><span>Navigate nodes</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>Home</kbd></span><span>Reset view</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>End</kbd></span><span>Recenter</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>+ / -</kbd></span><span>Zoom</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>Esc</kbd></span><span>Close overlays</span></div>
        <button class="kh-close" type="button" aria-label="Dismiss shortcuts panel">&times;</button>
    `;
    document.body.appendChild(panel);

    function closePanel() {
        if (panel._autoDismissTimer) {
            clearTimeout(panel._autoDismissTimer);
            panel._autoDismissTimer = null;
        }
        panel.classList.remove('visible');
        panel.setAttribute('aria-hidden', 'true');
        const helpButton = document.getElementById('btn-keyboard-help');
        if (helpButton) {
            helpButton.setAttribute('aria-expanded', 'false');
            helpButton.setAttribute('aria-pressed', 'false');
        }
        sessionStorage.setItem('kh_dismissed', '1');
        if (_previouslyFocused) {
            _previouslyFocused.focus();
            _previouslyFocused = null;
        }
        document.removeEventListener('keydown', _onPanelKeydown);
    }

    function _onPanelKeydown(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePanel();
            return;
        }
        // Simple focus trap: Tab cycles within the panel
        if (e.key === 'Tab') {
            const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    // Wire the close button
    panel.querySelector('.kh-close').addEventListener('click', closePanel);

    function openPanel(returnFocusEl) {
        if (panel._autoDismissTimer) {
            clearTimeout(panel._autoDismissTimer);
            panel._autoDismissTimer = null;
        }
        _previouslyFocused = returnFocusEl || document.getElementById('btn-keyboard-help') || document.activeElement;
        const onboarding = document.getElementById('onboarding-hint');
        onboarding?.classList.remove('visible');
        onboarding?.setAttribute('aria-hidden', 'true');
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        const helpButton = document.getElementById('btn-keyboard-help');
        if (helpButton) {
            helpButton.setAttribute('aria-expanded', 'true');
            helpButton.setAttribute('aria-pressed', 'true');
        }
        panel.querySelector('.kh-close')?.focus({ preventScroll: true });
        document.removeEventListener('keydown', _onPanelKeydown);
        document.addEventListener('keydown', _onPanelKeydown);
    }

    panel._openKeyboardHintPanel = openPanel;
    panel._closeKeyboardHintPanel = closePanel;

    // Wire "?" toolbar button if it exists
    const helpBtn = document.getElementById('btn-keyboard-help');
    if (helpBtn) {
        helpBtn.setAttribute('aria-controls', 'keyboard-hint-panel');
        helpBtn.setAttribute('aria-expanded', 'false');
        helpBtn.setAttribute('aria-pressed', 'false');
        helpBtn.addEventListener('click', () => {
            if (panel.classList.contains('visible')) {
                closePanel();
            } else {
                openPanel(document.activeElement || helpBtn);
            }
        });
    }

    if (!_keyboardShortcutKeyListenerBound) {
        _keyboardShortcutKeyListenerBound = true;
        document.addEventListener('keydown', (event) => {
            const isShortcutKey = event.key === '?' || (event.key === '/' && event.shiftKey);
            if (!isShortcutKey) return;
            if (isKeyboardTextEntryTarget(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            openPanel(document.getElementById('btn-keyboard-help'));
        });
    }

    // Keep shortcuts on demand through the toolbar and keyboard shortcut.
}

export function showKeyboardShortcutsHint() {
    const panel = document.getElementById('keyboard-hint-panel');
    if (!panel) return;
    if (typeof panel._openKeyboardHintPanel === 'function') {
        panel._openKeyboardHintPanel(document.getElementById('btn-keyboard-help'));
    } else {
        const onboarding = document.getElementById('onboarding-hint');
        onboarding?.classList.remove('visible');
        onboarding?.setAttribute('aria-hidden', 'true');
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        panel.querySelector('.kh-close')?.focus({ preventScroll: true });
    }
    // Auto-dismiss after 5 seconds — clear any pending auto-dismiss first to avoid double-firing
    if (panel._autoDismissTimer) clearTimeout(panel._autoDismissTimer);
    panel._autoDismissTimer = setTimeout(() => {
        if (typeof panel._closeKeyboardHintPanel === 'function') {
            panel._closeKeyboardHintPanel();
        } else {
            panel.classList.remove('visible');
            panel.setAttribute('aria-hidden', 'true');
        }
        panel._autoDismissTimer = null;
    }, 5000);
}

export function flashArrowKeyToast() {
    if (_shortcutsPanelArrowToastShown) return;
    _shortcutsPanelArrowToastShown = true;
    if (typeof window.showExperienceToast === 'function') {
        window.showExperienceToast('Arrow keys to navigate — press ? for shortcuts', { duration: 3500 });
    }
}

export function handleGalaxyKeydown(event) {
    if (!event?.target) return;
    if (isKeyboardTextEntryTarget(event.target)) return;
    const isControlTarget = isKeyboardControlTarget(event.target);

    if (event.key === 'Escape') {
        // Demo takes priority — cancel it before any other Esc action
        if (window.demoController?.isRunning?.()) {
            window.demoController.cancel();
            return;
        }
        if (typeof window.closeLegendGuide === 'function') window.closeLegendGuide();
        if (typeof window.hideTooltip === 'function') window.hideTooltip();
        if (typeof window.hideSummaryCard === 'function') window.hideSummaryCard();
        // Also close/toggle the info panel — escape should close it when open
        if (typeof window.setInfoPanelOpen === 'function') {
            window.setInfoPanelOpen(false);
        }
        const searchInput = document.getElementById('search-input');
        const hasSearchText = Boolean(searchInput?.value?.trim());
        const hasSearchState = Boolean(state.currentSearchSummary || state.searchGlowActive);
        const hasFocusState = state.focusedNode !== null || state.navState?.focusedIndex !== null;
        if (hasSearchText || hasSearchState || hasFocusState) {
            event.preventDefault();
            clearSearch();
            resetExplorationFocus();
        }
        return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        if (isControlTarget && event.key === 'ArrowUp') return;
        event.preventDefault();
        flashArrowKeyToast();
        if (typeof window.traverseNeighbor === 'function') window.traverseNeighbor(-1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        if (isControlTarget && event.key === 'ArrowDown') return;
        event.preventDefault();
        if (typeof window.traverseNeighbor === 'function') window.traverseNeighbor(1);
    } else if (event.key === 'Home') {
        if (state.currentView === 'galaxy') {
            event.preventDefault();
            resetExplorationFocus();
        }
    } else if (event.key === 'End' || (event.key === 'c' && !event.ctrlKey && !event.metaKey)) {
        if (state.currentView === 'galaxy') {
            event.preventDefault();
            if (typeof window.recenterFocusedNode === 'function') window.recenterFocusedNode();
        }
    }

    if (event.key === '=' || event.key === '+') {
        if (typeof window.zoomCamera === 'function') window.zoomCamera(0.84);
    } else if (event.key === '-' || event.key === '_') {
        if (typeof window.zoomCamera === 'function') window.zoomCamera(1.18);
    } else if (event.key === '?' || event.key === '/') {
        event.preventDefault();
        if (typeof showKeyboardShortcutsHint === 'function') {
            showKeyboardShortcutsHint();
        }
    }
}

// === Event Listeners ===

export function initEventListeners() {
    return initSemanticDemoEventListeners({
        onWindowResize,
        recordSemanticLaneSnapshot,
        resetExperienceState,
        resetNodePositions,
        setMyceliumMode,
        setSemanticLaneUiState
    });
}

// Global exposure for compatibility
if (typeof window !== 'undefined') {
    window.setLoadingPhase = setLoadingPhase;
    window.hideLoadingOverlay = hideLoadingOverlay;
    window.startSceneReveal = startSceneReveal;
    window.startDeferredHydration = startDeferredHydration;
    window.scheduleWeatherHydration = scheduleWeatherHydration;
    window.setSemanticLaneUiState = setSemanticLaneUiState;
    window.probeSemanticLane = probeSemanticLane;
    window.scheduleSemanticLaneMonitor = scheduleSemanticLaneMonitor;
    window.onWindowResize = onWindowResize;

    // Extracted functions (de-windowed: use named imports instead)
    window.syncClusterSectionState = function () {
        const clusterSection = document.getElementById('cluster-section');
        if (clusterSection && window.innerWidth <= 768) {
            clusterSection.open = false;
        }
    };
    window.updateExplorationUi = updateExplorationUi;
    window.setMyceliumMode = setMyceliumMode;
    window.setTrailDepth = setTrailDepth;
    window.applyStoryPrompt = applyStoryPrompt;
    window.copyCurrentViewLink = copyCurrentViewLink;
    window.returnToOverview = returnToOverview;
    window.resetExplorationFocus = resetExplorationFocus;
    window.resetStateBeforeUrlRestore = resetStateBeforeUrlRestore;
    window.refreshCompositionState = refreshCompositionState;
    window.syncSemanticDiveUi = syncSemanticDiveUi;
    window.getJourneyCompassState = getJourneyCompassState;
    window.updateJourneyCompass = updateJourneyCompass;
    window.executeJourneyCompassAction = executeJourneyCompassAction;
    window.showViewHandoff = showViewHandoff;
    window.hideViewHandoff = hideViewHandoff;
    window.showExperienceToast = showExperienceToast;



    window.getInterestingBusinessNote = function (point) {
        if (!point) return null;
        if (point.trivia) {
            const t = point.trivia.trim();
            // Suppress placeholder values that don't add user value
            if (t === 'Pending research.' || t === 'Pending research') return null;
            // Suppress SearXNG-sourced placeholders — implementation detail leaks into UI
            if (t.includes('SearXNG') || t.includes('Insufficient evidence')) return null;
            // Suppress verification-system outputs that read like legal/entity确认书
            if (t.includes('exact entity name') || t.includes('verified official') || t.includes('entity confirmed') || t.includes('Registry-only') || t.includes('FMCSA carrier') || t.includes('USDOT') || t.includes('SAFER snapshot') || t.includes('Texas Comptroller')) return null;
            // Suppress research-check and third-party lookup outputs
            if (t.includes('Research check') || t.includes('MapQuest') || t.includes('GoDaddy') || t.includes('WordPress site on Cloudflare') || t.includes('Hotel page is active') || t.includes('Local dirt track') || t.includes('carrier records') || t.includes('carrier lookup') || t.includes('via carrier') || t.includes('via lookup') || t.includes('contact found') || t.includes('Verified phone') || t.includes('Verified email')) return null;
            // Suppress entity-transition metadata — strings describing brand/chain transitions or legal entity history
            if (t.includes('formerly ') || t.includes('formerly known') || t.includes('renamed') || t.includes('rebranded as')) return null;
            // Suppress quasi-internal entity metadata like "National retail chain location" or "A [Brand] brand location"
            if (t.includes('retail chain location') || t.includes('brand location') || t.includes('chain location')) return null;
            // Suppress entity operating-as metadata — "operating as", "operated as", "dba", "also known as"
            if (t.includes('operating as') || t.includes('operated as') || t.includes('dba') || t.includes('also known as') || t.includes('doing business as')) return null;
            // Suppress disqualification and audit-flag strings — internal QA markers, not user-facing insights
            if (t.includes('Disqualified') || t.includes('SKIP') || t.includes('DO NOT') || t.includes('REDACTED') || t.includes(' Omits ')) return null;
            // Suppress NAICS/metadata structure strings — these are data-field artifacts, not useful business insights
            if (t.includes('NAICS') || t.includes('**Industry**') || t.includes('**Service**') || t.includes('SIC ') || t.includes('SIC:')) return null;
            // Suppress lead/profile/internal import artifacts — "New lead profile", "directory:" etc.
            if (t.includes('New lead profile') || t.includes('directory:') || t.includes('from directory') || t.includes('created from')) return null;
            // Suppress absence/negative-placeholder phrasing — these are implementation details, not useful signals
            if (t.toLowerCase().startsWith('no ') || t.toLowerCase().startsWith('none') || t.toLowerCase().startsWith('no verifiable') || t.toLowerCase().startsWith('unable to') || t.toLowerCase().startsWith('could not')) return null;
            // Suppress vague or low-content strings that don't give users an interesting signal
            if (t.length < 20) return null;
            // Suppress generic data-field fallbacks that read like field indicators, not business insights
            if (t === 'Has both email and phone.') return null;
            if (t === 'Website only — no direct contact on file.') return null;
            return t;
        }
        // Fallback signals are also generic data indicators — suppress them too
        if (point.email && point.phone) return null;
        if (point.website && !point.email && !point.phone) return null;
        return null;
    };
    window.buildSelectedMatchNarrative = function (point) {
        if (!point) return '';
        if (state.currentSearchSummary?.reason) return state.currentSearchSummary.reason;
        return '';
    };

    window.setSemanticDiveMode = function (enabled) {
        const nextActive = Boolean(enabled);
        state.semanticDiveMode = nextActive;
        
        if (typeof window.syncSemanticDiveUi === 'function') window.syncSemanticDiveUi();
        
        // 10/10 Polish: Sync with trailDepth state machine (Step Inside is depth 2)
        if (typeof window.setTrailDepth === 'function') {
            window.setTrailDepth(nextActive ? 2 : 1, { fromUserGesture: true });
        }

        if (state.semanticDiveMode) {
            // 10/10 Polish: Trigger the 'Sonic Boom' transition effect
            if (document.body) {
                document.body.dataset.semanticDive = 'transitioning';
                window.setTimeout(() => {
                    if (state.semanticDiveMode && document.body.dataset.semanticDive === 'transitioning') {
                        document.body.dataset.semanticDive = 'active';
                    }
                }, 820);
            }

            // 10/10 Polish: Re-apply focus pocket to trigger the 'Deep Dive' layout (tighten rosette)
            if (Number.isFinite(state.focusedNode) && typeof window._fp?.applyLocalNeighborhoodFocus === 'function') {
                window._fp.applyLocalNeighborhoodFocus(state.focusedNode);
            }

            // 10/10 Polish: Trigger a camera dive when entering the neighborhood
            if (Number.isFinite(state.focusedNode) && typeof window.animateCameraToNode === 'function') {
                window.animateCameraToNode(state.focusedNode, { transitionStyle: 'dive' });
            }
            if (typeof window.previewInsideNextThread === 'function') window.previewInsideNextThread({ force: true });
        } else {
            // Surface the camera back to normal focus distance when exiting dive mode
            if (Number.isFinite(state.focusedNode) && typeof window.animateCameraToNode === 'function') {
                window.animateCameraToNode(state.focusedNode, { transitionStyle: 'focus' });
            }
            // 10/10 Polish: Re-apply focus pocket to restore standard neighborhood spacing
            if (Number.isFinite(state.focusedNode) && typeof window._fp?.applyLocalNeighborhoodFocus === 'function') {
                window._fp.applyLocalNeighborhoodFocus(state.focusedNode);
            }
            if (document.body.dataset.threadInspectSurface === 'inside-cue') {
                if (typeof window.clearThreadInspection === 'function') window.clearThreadInspection({ force: true, preserveJourney: true });
            }
        }
    };

    window.exploreInsideToNextStop = function () {
        if (state.strandContinuityState?.phase === 'exploring') return;
        if (
            state.semanticDiveMode
            && Number.isFinite(state.inspectedThreadIndex)
            && document.body.dataset.threadInspectSurface === 'inside-cue'
        ) {
            if (typeof window.walkThreadNeighbor === 'function') window.walkThreadNeighbor(state.inspectedThreadIndex, { surface: 'inside-cue' });
            return;
        }
        if (typeof window.traverseNeighbor === 'function') window.traverseNeighbor(1);
    };

    window.recenterFocusedNode = function () {
        const index = state.focusedNode;
        if (!Number.isFinite(index)) return;
        if (typeof window.animateCameraToNode === 'function') {
            window.animateCameraToNode(index, { transitionStyle: 'focus' });
        }
    };

    window.returnToCountyView = function () {
        resetExplorationFocus();
    };

    // Expose btn-surprise handler
    // 10/10 Polish: Removed redundant legacy __handleSurpriseClick. Handled in event-bindings.js

    window.setSemanticGuideButtonState = setSemanticGuideButtonState;
    window.showSummaryCard = showSummaryCard;
    window.hideSummaryCard = hideSummaryCard;
    window.requestSemanticGuide = requestSemanticGuide;
    window.focusOnPoint = focusOnPoint;
    window.resetNodePositions = resetNodePositions;
    window.syncSearchStatusForFocus = syncSearchStatusForFocus;
    window.recordSemanticLaneSnapshot = recordSemanticLaneSnapshot;
    window.setSemanticLaneOpsMode = setSemanticLaneOpsMode;
    window.refreshSemanticLaneOpsSummary = refreshSemanticLaneOpsSummary;
    installSemanticJourneyProbe();

    // Trail story detail — triggers on "Full report" button in summary suggestions row
    window.showSemanticThreadsDetail = showSemanticThreadsDetail;

    let _trailReviewReturnFocus = null;

    window._openTrailReview = function() {
        const overlay = document.getElementById('trail-review-overlay');
        const list = document.getElementById('trail-review-list');
        if (!overlay || !list) return;

        _trailReviewReturnFocus = document.activeElement;

        const path = Array.isArray(state.navState?.activeRoutePath) ? state.navState.activeRoutePath : [];
        if (!path.length) {
            list.innerHTML = '<p class="trail-review-empty">No reviewed trail is active yet.</p>';
        } else {
            list.innerHTML = path.map((leadId, index) => {
                const pointIndex = state.pointIndexByLeadId?.get(String(leadId));
                const point = Number.isFinite(pointIndex) ? state.points?.[pointIndex] : null;
                const name = point?.name || `Trail stop ${index + 1}`;
                const arrow = index < path.length - 1 ? '<div class="step-arrow" aria-hidden="true">↓</div>' : '';
                return `
                    <div class="trail-step">
                        <span class="step-num">${index + 1}</span>
                        <span class="step-name">${escapeHtml(name)}</span>
                    </div>
                    ${arrow}
                `;
            }).join('');
        }

        overlay.hidden = false;
        overlay.classList.add('visible');
        overlay.setAttribute('aria-hidden', 'false');

        const closeBtn = overlay.querySelector('.trail-review-close');
        if (closeBtn) {
            closeBtn.focus();
        }
    };

    window._closeTrailReview = function() {
        const overlay = document.getElementById('trail-review-overlay');
        if (!overlay) return;
        overlay.classList.remove('visible');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;

        if (_trailReviewReturnFocus && typeof _trailReviewReturnFocus.focus === 'function') {
            _trailReviewReturnFocus.focus();
            _trailReviewReturnFocus = null;
        }
    };

    // Keyboard & Legend
    window.isKeyboardTextEntryTarget = isKeyboardTextEntryTarget;
    window.isKeyboardControlTarget = isKeyboardControlTarget;
    window.closeLegendGuide = closeLegendGuide;
    window.updateLegendGuideState = updateLegendGuideState;
    window.handleGalaxyKeydown = handleGalaxyKeydown;
    window.hydrateLeadContext = function (point, options = {}) {
        if (!point || !point.lead_id) return;
        if (typeof window.updateSelectedBusiness === 'function') {
            window.updateSelectedBusiness(point, { revealCard: !!options.revealCard, skipUrlSync: true });
        }
    };
}
