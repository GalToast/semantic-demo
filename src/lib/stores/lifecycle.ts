/**
 * @lib/stores/lifecycle — Lifecycle helpers ported from js/modules/lifecycle-*.js
 *
 * Functions here read from and write to the Svelte stores (navStore,
 * focusStore, searchStore, journeyStore) and derive body data attributes
 * for CSS composition.  The event-bus publish() call keeps the legacy
 * engine bridge subscribers in sync.
 *
 * The 3 working delegates (setTrailDepth, setMyceliumMode,
 * setSemanticDiveMode) remain unchanged.
 */
import { get } from 'svelte/store';
import { navStore, updateNavState, switchView, currentView, setMyceliumMode as _setMyceliumMode } from './navigation.svelte';
import { setSemanticDiveMode as _setSemanticDiveMode, focusStore, resetFocus } from './focus.svelte';
import { searchStore, clearSearch, clearSearchGlow, setSearchStatus } from './search.svelte';
import { setTrailDepth as _setTrailDepth } from './journey.svelte';
import { publish, EVENTS } from '../orchestration/event-bus';

// ── Delegates to real stores ─────────────────────────────────────────────────

export const setTrailDepth = _setTrailDepth;
export const setSemanticDiveMode = _setSemanticDiveMode;
export const setMyceliumMode = _setMyceliumMode;

// ── Composition State (ported from js/modules/lifecycle.js) ──────────────────

/**
 * Derive the graph-context from the current nav/search state.
 * Matches the legacy `deriveGraphContext` in lifecycle.js.
 */
function deriveGraphContext(
  view: string,
  hasFocus: boolean,
  hasSearchIntent: boolean,
  mapContextOverride?: string
): string {
  if (mapContextOverride !== undefined) return mapContextOverride;
  if (hasFocus && hasSearchIntent) return 'focus-search';
  if (hasFocus) return 'focus';
  if (hasSearchIntent) return 'search';
  return 'idle';
}

/**
 * Derive the panel surface label from view, graph context, semantic dive,
 * search intent, and focus state.
 * Matches the legacy `derivePanelSurface` in lifecycle.js.
 */
function derivePanelSurface(opts: {
  view: string;
  graphContext: string;
  mapContext: string;
  semanticDive: string;
  hasSearchIntent: boolean;
  hasFocus: boolean;
  hasActiveTrailState: boolean;
}): string {
  const { view, graphContext, mapContext, semanticDive } = opts;
  if (view !== 'galaxy') {
    if (mapContext === 'focus-search') return 'map-focus-search';
    if (mapContext === 'focus') return 'map-focus';
    if (mapContext === 'search') return 'map-search';
    if (opts.hasActiveTrailState) return 'map-trail';
    return 'map-idle';
  }
  if (semanticDive === 'active' || semanticDive === 'transitioning') return 'semantic-dive';
  if (graphContext === 'focus-search') return 'focus-search';
  if (graphContext === 'focus') return 'focus';
  if (graphContext === 'search') return 'search';
  return 'idle';
}

/**
 * Apply current state to body data-attributes for CSS composition.
 * Matches the legacy `applyCompositionState` in lifecycle.js.
 */
function applyCompositionState(): void {
  const $nav = get(navStore);
  const $focus = get(focusStore);
  const $search = get(searchStore);

  const activeView = $nav.currentView || 'galaxy';
  const hasFocus = !!($nav.focusedIndex != null || $focus.selectedBusiness);
  const hasSearchIntent = !!($search.summary || $search.query.trim().length >= 2);
  const hasActiveTrailState = activeView === 'map'
    ? (hasSearchIntent || hasFocus)
    : (hasFocus && ($nav.mode === 'trail' || hasSearchIntent));

  const semanticDive = $focus.semanticDiveMode && hasFocus
    ? 'active'
    : 'inactive';

  const graphContext = deriveGraphContext(activeView, hasFocus, hasSearchIntent);
  const mapContext = activeView === 'map'
    ? deriveGraphContext(activeView, hasFocus, hasSearchIntent, undefined)
    : 'idle';

  const panelSurface = derivePanelSurface({
    view: activeView,
    graphContext: activeView === 'galaxy' ? graphContext : mapContext,
    mapContext,
    semanticDive,
    hasSearchIntent,
    hasFocus,
    hasActiveTrailState,
  });

  const root = document.body;
  if (root?.dataset) {
    root.dataset.activeView = activeView;
    root.dataset.searchGlow = $search.glowActive ? 'active' : 'inactive';
    root.dataset.trailState = hasActiveTrailState ? 'active' : 'inactive';
    root.dataset.trailDepth = String($nav.trailDepth ?? 0);
    root.dataset.graphContext = activeView === 'galaxy' ? graphContext : 'idle';
    root.dataset.semanticDive = activeView === 'galaxy' ? semanticDive : 'inactive';
    root.dataset.panelSurface = panelSurface;
    root.dataset.panelSurfaceDetail = panelSurface;
  }
}

/**
 * Refresh the composition state: apply body data-attributes and emit event.
 * This is the central "sync UI to state" function called after every
 * state mutation that affects the visual composition.
 */
export function refreshCompositionState(): void {
  applyCompositionState();
  publish(EVENTS.COMPOSITION_UPDATED);
}

/**
 * updateExplorationUi is a legacy alias for refreshCompositionState.
 * Matches the legacy lifecycle.js where both names pointed to the same impl.
 */
export function updateExplorationUi(): void {
  refreshCompositionState();
}

// ── Bloom / Bridge Indices (legacy state bridge) ────────────────────────────

/**
 * Get bloom indices from the legacy global state.
 * The bloom/bridge computation lives in the legacy lifecycle.js (recomputeBloomIndices)
 * and operates on the global state.points array, so we bridge through window.
 */
export function getBloomIndices(): number[] {
  const s = (window as unknown as Record<string, unknown>).__semanticState as
    { bloomIndices?: Set<number> } | undefined;
  if (!s?.bloomIndices) return [];
  return Array.from(s.bloomIndices);
}

/**
 * Get bridge indices from the legacy global state.
 */
export function getBridgeIndices(): number[] {
  const s = (window as unknown as Record<string, unknown>).__semanticState as
    { bridgeIndices?: Set<number> } | undefined;
  if (!s?.bridgeIndices) return [];
  return Array.from(s.bridgeIndices);
}

// ── Focus Reset (ported from js/modules/lifecycle-reset.js) ─────────────────

/**
 * Reset exploration focus: clears navState focus fields, trail depth,
 * semantic dive, mycelium mode, and optionally clears the search summary.
 * Matches the legacy `resetExplorationFocus` in lifecycle-reset.js.
 */
export function resetExplorationFocus(
  options?: { preserveSearch?: boolean; skipSearchClearEvent?: boolean; skipUrlSync?: boolean }
): void {
  const preserveSearch = options?.preserveSearch !== false;

  updateNavState({ trailDepth: 0, mode: 'overview' });

  _setSemanticDiveMode(false);
  _setTrailDepth(0);

  resetFocus();
  clearSearchGlow();

  _setMyceliumMode('default');

  if (preserveSearch) {
    // Keep the search summary intact — only reset the focus/nav state.
  } else {
    clearSearch();
  }

  if (!options?.skipUrlSync) {
    publish(EVENTS.STATE_RESET, { reason: 'manual-reset', options });
  }

  refreshCompositionState();
}

/**
 * Reset positions: clear focus selection then reset exploration focus.
 * Matches the legacy `resetNodePositions` in lifecycle-reset.js.
 */
export function resetNodePositions(_options?: object): void {
  resetFocus();
  resetExplorationFocus(_options as Parameters<typeof resetExplorationFocus>[0]);
}

// ── Experience Reset (ported from js/modules/lifecycle-reset.js) ─────────────

/**
 * Full experience reset: clears everything — focus, search, empty query,
 * glow, and the search input DOM element.
 * Matches the legacy `resetExperienceState` in lifecycle-reset.js.
 */
export function resetExperienceState(): void {
  resetExplorationFocus({ skipSearchClearEvent: true });

  searchStore.update(s => ({
    ...s,
    summary: null,
    currentEmptyQuery: null,
    anchorIndex: null,
    previewIndex: null,
    glowActive: false,
    glowIndices: new Set(),
  }));
  clearSearchGlow();

  // Clear the search input DOM element
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  if (searchInput) searchInput.value = '';

  // Hide search results panel
  const searchResults = document.getElementById('search-results');
  if (searchResults) {
    searchResults.classList.remove('active');
    setTimeout(() => {
      if (!searchResults.classList.contains('active')) {
        searchResults.hidden = true;
      }
    }, 450);
  }

  setSearchStatus('idle');
  refreshCompositionState();
  publish(EVENTS.STATE_RESET, { reason: 'manual-reset' });
}

/**
 * Return to the county overview: full experience reset + switch to galaxy view.
 * Matches the legacy `returnToOverview` in lifecycle-reset.js.
 */
export function returnToOverview(): void {
  resetExperienceState();
  if (currentView() !== 'galaxy') {
    switchView('galaxy');
  }
  refreshCompositionState();
}

// ── Search Glow (ported from js/modules/lifecycle-search-sync.js) ────────────

/**
 * Activate search glow on the field: sets the search summary and glow
 * indices so the Three.js renderer can highlight matching nodes.
 * Matches the legacy `activateSearchGlow` in lifecycle-search-sync.js.
 */
export function activateSearchGlow(summary?: unknown): void {
  const s = summary as {
    resultIndices?: number[];
    summary?: unknown;
    [key: string]: unknown;
  } | undefined;

  searchStore.update(st => ({
    ...st,
    summary: (s?.summary as typeof st.summary) ?? st.summary,
    currentEmptyQuery: null,
    glowActive: true,
    glowIndices: new Set(s?.resultIndices ?? []),
  }));

  refreshCompositionState();
}

// ── Empty Query Tracking (ported from js/modules/lifecycle-search-sync.js) ───

/**
 * Get the last recorded empty query (for no-results fallback suggestions).
 * Matches the legacy `getCurrentEmptyQuery` selector.
 */
export function getCurrentEmptyQuery(): string | null {
  return get(searchStore).currentEmptyQuery ?? null;
}

/**
 * Record an empty search query so the UI can show suggestions.
 * Matches the legacy `recordEmptySearch` in lifecycle-search-sync.js.
 */
export function recordEmptySearch(query?: string): void {
  searchStore.update(s => ({
    ...s,
    currentEmptyQuery: query ?? null,
    summary: null,
  }));
}

// ── Trail Review Overlay (ported from js/modules/lifecycle-search-sync.js) ───

let _trailReviewPreviouslyFocused: HTMLElement | null = null;

/**
 * Show the trail-review overlay DOM element.
 * Matches the legacy `showExploreTrailReview` in lifecycle-search-sync.js.
 */
export function showExploreTrailReview(_summary?: unknown): void {
  const overlay = document.getElementById('trail-review-overlay');
  if (!overlay) return;

  overlay.setAttribute('aria-hidden', 'false');
  overlay.hidden = false;
  overlay.classList.add('visible');

  const closeBtn = overlay.querySelector('.trail-review-close') as HTMLElement | null;
  if (closeBtn) {
    _trailReviewPreviouslyFocused = document.activeElement as HTMLElement | null;
    closeBtn.focus();
  }
}

/**
 * Hide the trail-review overlay and restore focus.
 * Matches the legacy `hideExploreTrailReview` in lifecycle-search-sync.js.
 */
export function hideExploreTrailReview(): void {
  const overlay = document.getElementById('trail-review-overlay');
  if (overlay) {
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    overlay.classList.remove('visible');

    if (_trailReviewPreviouslyFocused && typeof _trailReviewPreviouslyFocused.focus === 'function') {
      _trailReviewPreviouslyFocused.focus();
    }
    _trailReviewPreviouslyFocused = null;
  }

  searchStore.update(s => ({ ...s, summary: null, glowActive: false }));
  clearSearchGlow();
  refreshCompositionState();
}

// ── Constants ────────────────────────────────────────────────────────────────

export const MODE_DESCRIPTIONS = {
  default: 'County-wide overview across all visible records.',
  bloom: 'Living records with high relationship potential.',
  bridge: 'Connective nodes linking disparate county themes.',
  trail: 'Focused path of related business entities.',
  inside: 'Immersive exploration of local neighborhoods.'
};

export const STORY_DESCRIPTIONS = {
  standard: 'A semantic journey through Montgomery County.'
};
