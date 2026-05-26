/**
 * search-panel-adapter.js
 *
 * Owns search panel container/body visual state so search-state.js can keep
 * search decisions separate from cross-surface DOM flags.
 */

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
}

export function setSearchGlowState(active) {
    if (!document.body?.dataset) return;
    document.body.dataset.searchGlow = active ? 'active' : 'inactive';
}

export function setMobileSearchSheetMode(mode = 'peek', { userInitiated = false } = {}) {
    const safeMode = mode === 'expanded' ? 'expanded' : 'peek';
    document.body.dataset.mobileSearchSheet = safeMode;
    document.body.dataset.panelSurfaceDetail = safeMode;
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
    if (document.body.dataset.panelSurface === 'search' || document.body.dataset.panelSurface === 'focus-search') {
        document.body.dataset.panelSurfaceDetail = 'none';
    }
}

export function setupMobileSearchSheetToggle({ isCompactSearchViewport } = {}) {
    const searchContainer = getSearchContainer();
    const label = searchContainer?.querySelector?.('.search-label');
    if (!searchContainer || !label) return;
    const isCompact = typeof isCompactSearchViewport === 'function' ? isCompactSearchViewport : () => false;

    label.setAttribute('aria-controls', 'search-results');

    if (!label.dataset.mobileSheetToggleBound) {
        label.addEventListener('click', () => {
            if (!isCompact() || !searchContainer.classList.contains('has-query')) return;
            const nextMode = document.body.dataset.mobileSearchSheet === 'expanded' ? 'peek' : 'expanded';
            setMobileSearchSheetMode(nextMode, { userInitiated: true });
        });
        label.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (!isCompact() || !searchContainer.classList.contains('has-query')) return;
            event.preventDefault();
            const nextMode = document.body.dataset.mobileSearchSheet === 'expanded' ? 'peek' : 'expanded';
            setMobileSearchSheetMode(nextMode, { userInitiated: true });
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
