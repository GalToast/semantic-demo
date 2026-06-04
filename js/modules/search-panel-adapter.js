/**
 * search-panel-adapter.js
 *
 * Owns search panel container/body visual state so search-state.js can keep
 * search decisions separate from cross-surface DOM flags.
 */
import { state } from '../state.js';

export function getSearchContainer() {
    return document.querySelector('.search-container');
}

export function setSearchContainerState({
    searching,
    focusing,
    hasQuery,
    resultsRendered,
    degraded
} = {}) {
    const searchContainer = getSearchContainer();
    if (!searchContainer) return;

    if (typeof searching === 'boolean') {
        searchContainer.classList.toggle('searching', searching);
    }
    if (typeof focusing === 'boolean') {
        searchContainer.classList.toggle('focusing', focusing);
    }
    if (typeof hasQuery === 'boolean') {
        searchContainer.classList.toggle('has-query', hasQuery);
    }
    if (typeof resultsRendered === 'boolean') {
        searchContainer.classList.toggle('results-rendered', resultsRendered);
    }
    if (typeof degraded === 'boolean') {
        searchContainer.classList.toggle('search-degraded', degraded);
    }

    if (typeof searching === 'boolean' || typeof focusing === 'boolean') {
        const currentCue = state.semanticTrailCue || 'idle';
        const nextSearching = typeof searching === 'boolean' ? searching : currentCue === 'searching';
        const nextFocusing = typeof focusing === 'boolean' ? focusing : currentCue === 'focusing';
        state.semanticTrailCue = nextFocusing ? 'focusing' : nextSearching ? 'searching' : 'idle';
    }
}

export function setSearchGlowState(active) {
    if (!document.body?.dataset) return;
    document.body.dataset.searchGlow = active ? 'active' : 'inactive';
}

export function getPanelSurfaceDetailFromMobileSheet(context = document.body?.dataset?.panelSurface) {
    if (!document.body?.dataset) return 'none';
    const hasSheetState = Boolean(document.body.dataset.mobileSearchSheet);
    return hasSheetState && (context === 'search' || context === 'focus-search')
        ? (document.body.dataset.mobileSearchSheet === 'expanded' ? 'expanded' : 'peek')
        : 'none';
}

export function syncPanelSurfaceDetailFromMobileSheet(context = document.body?.dataset?.panelSurface) {
    if (!document.body?.dataset) return 'none';
    const detail = getPanelSurfaceDetailFromMobileSheet(context);
    document.body.dataset.panelSurfaceDetail = detail;
    return detail;
}

export function setMobileSearchSheetMode(mode = 'peek', { userInitiated = false } = {}) {
    const safeMode = mode === 'expanded' ? 'expanded' : 'peek';
    document.body.dataset.mobileSearchSheet = safeMode;
    syncPanelSurfaceDetailFromMobileSheet(document.body.dataset.panelSurface || 'search');
    if (userInitiated) document.body.dataset.mobileSearchSheetUser = 'true';

    if (safeMode === 'peek') {
        const content = document.getElementById('info-panel-content');
        if (content) content.scrollTop = 0;
    }

    const label = document.querySelector('.search-label');
    if (label) {
        label.setAttribute('aria-expanded', String(safeMode === 'expanded'));
        label.setAttribute('aria-label', safeMode === 'expanded' ? 'Collapse search results panel' : 'Expand search results panel');
    }
}

export function clearMobileSearchSheetState() {
    if (!document.body?.dataset) return;
    delete document.body.dataset.mobileSearchSheet;
    delete document.body.dataset.mobileSearchSheetUser;
    syncPanelSurfaceDetailFromMobileSheet();
}

export function setupMobileSearchSheetToggle({ isCompactSearchViewport } = {}) {
    const searchContainer = getSearchContainer();
    const label = searchContainer?.querySelector?.('.search-label');
    if (!searchContainer || !label) return;
    const isCompact = typeof isCompactSearchViewport === 'function' ? isCompactSearchViewport : () => false;

    label.setAttribute('aria-controls', 'search-results');

    if (!label.dataset.mobileSheetToggleBound) {
        const focusSearchInput = () => {
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.focus();
        };
        const toggleSheet = () => {
            // The toggle's primary job is to put the cursor in the search
            // field. Focus is unconditional so a fresh page (no query yet)
            // and any viewport size still hand focus to the input on click.
            // Sheet expansion is secondary and stays gated on has-query since
            // there are no results to expand until the user has typed.
            focusSearchInput();
            if (!isCompact() || !searchContainer.classList.contains('has-query')) return;
            const isOpening = document.body.dataset.mobileSearchSheet !== 'expanded';
            const nextMode = isOpening ? 'expanded' : 'peek';
            setMobileSearchSheetMode(nextMode, { userInitiated: true });
        };
        label.addEventListener('click', toggleSheet);
        label.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleSheet();
        });
        label.dataset.mobileSheetToggleBound = 'true';
    }

    if (isCompact() && searchContainer.classList.contains('has-query')) {
        if (!document.body.dataset.mobileSearchSheetUser) setMobileSearchSheetMode('peek');
        else setMobileSearchSheetMode(document.body.dataset.mobileSearchSheet || 'peek');
    } else {
        clearMobileSearchSheetState();
        label.removeAttribute('aria-expanded');
        label.removeAttribute('aria-label');
    }
}
