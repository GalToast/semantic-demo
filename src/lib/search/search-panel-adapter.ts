/**
 * search-panel-adapter.ts
 *
 *
 * Owns search panel container/body visual state so search-state.js can keep
 * search decisions separate from cross-surface DOM flags.
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface SearchContainerState {
    searching?: boolean;
    focusing?: boolean;
    hasQuery?: boolean;
    resultsRendered?: boolean;
    resultsExpanded?: boolean;
    degraded?: boolean;
}

type PanelSurfaceDetail = 'none' | 'expanded' | 'peek';

type MobileSearchSheetMode = 'expanded' | 'peek';

interface MobileSearchSheetOptions {
    userInitiated?: boolean;
}

interface SetupMobileSearchSheetToggleOptions {
    isCompactSearchViewport?: (() => boolean) | undefined;
}

// ── Functions ──────────────────────────────────────────────────────────────

export function getSearchContainer(): Element | null {
    return document.querySelector('.search-container');
}

export function setSearchContainerState({
    searching,
    focusing,
    hasQuery,
    resultsRendered,
    resultsExpanded,
    degraded
}: SearchContainerState = {}): void {
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
    if (typeof resultsExpanded === 'boolean') {
        searchContainer.classList.toggle('has-expanded-results', resultsExpanded);
    }
    if (typeof degraded === 'boolean') {
        searchContainer.classList.toggle('search-degraded', degraded);
    }
}

export function setSearchGlowState(_active: boolean): void {
    // NOTE: body.dataset.searchGlow removed — not used by CSS or JS readers.
    // The state is managed in appState.searchGlowActive.
}

export function getPanelSurfaceDetailFromMobileSheet(
    context: string = (document.body?.dataset?.panelSurface ?? 'search') as string
): PanelSurfaceDetail {
    if (!document.body?.dataset) return 'none';
    const hasSheetState = Boolean(document.body.dataset.mobileSearchSheet);
    return hasSheetState && (context === 'search' || context === 'focus-search')
        ? (document.body.dataset.mobileSearchSheet === 'expanded' ? 'expanded' : 'peek')
        : 'none';
}

export function syncPanelSurfaceDetailFromMobileSheet(
    context: string = (document.body?.dataset?.panelSurface ?? 'search') as string
): PanelSurfaceDetail {
    if (!document.body?.dataset) return 'none';
    const detail = getPanelSurfaceDetailFromMobileSheet(context);
    // NOTE: body.dataset.panelSurfaceDetail write removed — parity-attrs.svelte.ts handles this.
    return detail;
}

export function setMobileSearchSheetMode(
    mode: MobileSearchSheetMode = 'peek',
    { userInitiated = false }: MobileSearchSheetOptions = {}
): void {
    const safeMode: MobileSearchSheetMode = mode === 'expanded' ? 'expanded' : 'peek';
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

export function clearMobileSearchSheetState(): void {
    if (!document.body?.dataset) return;
    delete document.body.dataset.mobileSearchSheet;
    delete document.body.dataset.mobileSearchSheetUser;
    syncPanelSurfaceDetailFromMobileSheet();
}

export function setupMobileSearchSheetToggle(
    { isCompactSearchViewport }: SetupMobileSearchSheetToggleOptions = {}
): void {
    const searchContainer = getSearchContainer();
    const rawLabel = searchContainer?.querySelector?.('.search-label');
    if (!searchContainer || !rawLabel) return;
    const label = rawLabel as HTMLElement;
    const isCompact = typeof isCompactSearchViewport === 'function' ? isCompactSearchViewport : () => false;

    label.setAttribute('aria-controls', 'search-results');

    if (!label.dataset.mobileSheetToggleBound) {
        const focusSearchInput = (): void => {
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.focus();
        };
        const toggleSheet = (): void => {
            // The toggle's primary job is to put the cursor in the search
            // field. Focus is unconditional so a fresh page (no query yet)
            // and any viewport size still hand focus to the input on click.
            // Sheet expansion is secondary and stays gated on has-query since
            // there are no results to expand until the user has typed.
            focusSearchInput();
            if (!isCompact() || !searchContainer.classList.contains('has-query')) return;
            const isOpening = document.body.dataset.mobileSearchSheet !== 'expanded';
            const nextMode: MobileSearchSheetMode = isOpening ? 'expanded' : 'peek';
            setMobileSearchSheetMode(nextMode, { userInitiated: true });
        };
        label.addEventListener('click', toggleSheet);
        label.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleSheet();
        });
        label.dataset.mobileSheetToggleBound = 'true';
    }

    if (isCompact() && searchContainer.classList.contains('has-query')) {
        if (!document.body.dataset.mobileSearchSheetUser) setMobileSearchSheetMode('peek');
        else setMobileSearchSheetMode((document.body.dataset.mobileSearchSheet as MobileSearchSheetMode) || 'peek');
    } else {
        clearMobileSearchSheetState();
        label.removeAttribute('aria-expanded');
        label.removeAttribute('aria-label');
    }
}
