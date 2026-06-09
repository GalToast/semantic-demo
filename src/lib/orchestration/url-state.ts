/**
 * @lib/orchestration/url-state.ts — URL state sync (read from URL params, pushState on changes)
 *
 * Port of: js/modules/url-state.js
 *
 * Reads application state from URL search params on load, and pushes state changes
 * back to the URL via pushState/replaceState. Handles browser history navigation,
 * deferred state restoration (for data that loads async), and share-link generation.
 */

import { get } from 'svelte/store';
import { navStore, bumpUrlStateRestoreToken } from '@lib/stores/navigation';
import type { NavState, ViewName } from '@lib/types/state';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

/**
 * NavState extended with the legacy `activeStoryPrompt` field that lives in
 * the runtime state object but is not (yet) declared in the canonical
 * NavState interface in types/state.ts.  Remove this augmentation once the
 * upstream type is updated.
 */
type NavStateWithStory = NavState & { activeStoryPrompt?: string | null };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UrlStateOptions {
  /** Whether this restore was triggered by browser history navigation. */
  fromHistory?: boolean;
  /** History state payload from popstate event. */
  historyState?: { params?: Record<string, string> };
  /** Force the update even when applyingUrlState is true. */
  force?: boolean;
}

export interface UpdateUrlStateOptions {
  /** 'push' creates a new history entry; 'replace' modifies the current one. */
  mode?: 'push' | 'replace';
  /** Reason for the update (for debugging). */
  reason?: string;
  /** Force update even when applyingUrlState is true. */
  force?: boolean;
}

export interface ActiveFilters {
  status: string;
  city: string;
  website: boolean;
  email: boolean;
  geocoded: boolean;
}

// ── Internal State ────────────────────────────────────────────────────────────

// ── URL Param Helpers ─────────────────────────────────────────────────────────

function getSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search || '');
}

function getLocationHref(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}

function getLocationPathname(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

/**
 * Parse a depth value from URL params, clamped to [0, 2].
 */
function getRequestedUrlDepth(params: URLSearchParams): number {
  const rawDepth = Number(params.get('depth') || 0);
  return Number.isFinite(rawDepth) ? Math.max(0, Math.min(2, rawDepth)) : 0;
}

// ── State Reset ───────────────────────────────────────────────────────────────

/**
 * Clear exploration/selection state before restoring from URL.
 */
export function clearExplorationFocusSelection(): void {
  navStore.update((s) => ({
    ...s,
    focusedIndex: null,
    mode: 'overview',
    trailDepth: 0,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: -1,
  }));
}

/**
 * Reset all application state to defaults before URL restore.
 */
export function resetStateBeforeUrlRestore(options: { clearSearchInput?: boolean } = {}): void {
  clearExplorationFocusSelection();

  navStore.update((s) => ({
    ...s,
    mode: 'overview',
    currentView: 'galaxy',
    myceliumMode: 'default',
    trailDepthFromExploration: 0,
  }));

  if (options.clearSearchInput) {
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

// ── Apply URL State ───────────────────────────────────────────────────────────

/**
 * Read the current URL and apply all state params to the application.
 *
 * Handles:
 * - View switching (galaxy/map)
 * - Search query restoration
 * - Filter restoration (status, city, website, email, geocoded)
 * - Mode restoration
 * - Story prompt restoration
 * - Record/lead focus restoration
 * - Deferred restoration when data hasn't loaded yet
 */
export async function applyUrlState(options: UrlStateOptions = {}): Promise<void> {
  const restoreToken = bumpUrlStateRestoreToken();
  const $nav = get(navStore);
  const priorRestoringBrowserHistory = $nav.restoringBrowserHistory;

  navStore.update((s) => ({
    ...s,
    applyingUrlState: true,
    restoringBrowserHistory: !!options.fromHistory,
  }));

  const params = getSearchParams();

  try {
    resetStateBeforeUrlRestore();

    // View restoration
    const view = params.get('view');
    const targetView: ViewName = view === 'map' ? 'map' : 'galaxy';
    navStore.update((s) => ({ ...s, currentView: targetView }));
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.viewMode = targetView;
    }

    // Filter restoration (status, city, website, email, geocoded)
    _restoreFiltersFromParams(params);

    // Mode restoration
    const mode = params.get('mode');
    if (mode) {
      navStore.update((s) => ({ ...s, myceliumMode: mode }));
    }

    // Cluster filter restoration
    const cluster = params.get('cluster');
    if (cluster !== null) {
      // Delegate to cluster filter owner
      _restoreClusterFilter(cluster);
    }

    // Story restoration
    const story = params.get('story');
    if (story) {
      navStore.update((s) => ({ ...s, activeStoryPrompt: story }));
      if (!options.fromHistory) {
        updateUrlState({}, { reason: 'apply-url-story', force: true });
      }
      return;
    }

    // Depth restoration
    const depth = getRequestedUrlDepth(params);
    if (depth > 0) {
      navStore.update((s) => ({ ...s, trailDepthFromExploration: depth }));
    }

    // Search query + anchor restoration
    const query = params.get('q');
    const anchorId = params.get('anchor');
    if (query && query.trim().length >= 2) {
      await _restoreSearchFromParams(query, anchorId);
    }

    // URL sync after apply
    if (!options.fromHistory) {
      updateUrlState({}, { reason: 'apply-url', force: true });
    }
  } finally {
    const current = get(navStore);
    if (current.urlStateRestoreToken === restoreToken || restoreToken === current.urlStateRestoreToken) {
      navStore.update((s) => ({
        ...s,
        applyingUrlState: false,
        restoringBrowserHistory: priorRestoringBrowserHistory,
      }));
    }
  }
}

// ── Update URL State ──────────────────────────────────────────────────────────

/**
 * Push current application state into the URL bar.
 *
 * Reads current state from navStore and DOM, builds URL search params,
 * and calls pushState or replaceState.
 */
export function updateUrlState(
  extra: Record<string, string | null | undefined> = {},
  options: UpdateUrlStateOptions = {}
): void {
  if (typeof window === 'undefined' || !window.location || !window.history) return;

  const $nav = get(navStore) as NavStateWithStory;
  if ($nav.applyingUrlState && !options.force) return;
  if ($nav.restoringBrowserHistory) return;

  const params = getSearchParams();

  // View
  params.set('view', $nav.currentView);

  // Search query
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  const query = (searchInput?.value || '').trim();
  if (query) params.set('q', query);
  else params.delete('q');

  // Mode
  if ($nav.myceliumMode !== 'default') params.set('mode', $nav.myceliumMode);
  else params.delete('mode');

  // Depth
  if ($nav.trailDepthFromExploration > 0) {
    params.set('depth', String($nav.trailDepthFromExploration));
  } else {
    params.delete('depth');
  }

  // Story
  if ($nav.activeStoryPrompt) params.set('story', $nav.activeStoryPrompt);
  else params.delete('story');

  // Extra params
  for (const [key, value] of Object.entries(extra)) {
    if (value === null || value === undefined || value === '') params.delete(key);
    else params.set(key, String(value));
  }

  // Build URL
  const pathname = getLocationPathname();
  const queryString = params.toString();
  const next = `${pathname}${queryString ? `?${queryString}` : ''}`;
  const current = `${pathname}${window.location.search || ''}`;

  const historyState = {
    semanticDemo: true,
    reason: options.reason || 'state',
    params: Object.fromEntries(params.entries()),
  };

  // No-op if URL hasn't changed
  if (next === current) {
    if (!window.history.state?.semanticDemo || !window.history.state?.params) {
      try {
        window.history.replaceState(historyState, '', next);
      } catch (err) {
        if (err instanceof Error && err.name !== 'SecurityError') {
          debugWarn('updateUrlState replaceState failed:', err);
        }
      }
    }
    return;
  }

  // Push or replace
  const method = options.mode === 'push' && !$nav.applyingUrlState ? 'pushState' : 'replaceState';
  try {
    window.history[method](historyState, '', next);
  } catch (err) {
    if (err instanceof Error && err.name !== 'SecurityError') {
      debugWarn('updateUrlState history call failed:', err);
    }
  }
}

// ── Share Link ────────────────────────────────────────────────────────────────

/**
 * Copy a shareable URL for the current view state to the clipboard.
 */
export async function copyCurrentViewLink(): Promise<string | null> {
  let shareUrl: URL;
  try {
    shareUrl = new URL(getLocationHref());
  } catch {
    _showToast('Copy unavailable', 'Could not read the current page URL.');
    return null;
  }

  const $nav = get(navStore);

  shareUrl.searchParams.delete('cb');
  shareUrl.searchParams.delete('lead');
  shareUrl.searchParams.set('view', $nav.currentView || 'galaxy');

  if ($nav.myceliumMode && $nav.myceliumMode !== 'default') {
    shareUrl.searchParams.set('mode', $nav.myceliumMode);
  }

  const href = shareUrl.toString();
  try {
    await navigator.clipboard.writeText(href);
  } catch (err) {
    debugWarn('Clipboard write failed:', err);
    _showToast('Copy unavailable', 'Could not write to clipboard.');
    return null;
  }

  _showToast('View link copied', 'Link copied to clipboard.');
  return href;
}

// ── Event Subscriptions ───────────────────────────────────────────────────────

/**
 * Initialize URL state event listeners.
 * Call once after the app shell is ready.
 */
export function initUrlStateSync(): void {
  if (typeof window === 'undefined') return;

  // Listen for popstate (browser back/forward)
  window.addEventListener('popstate', () => {
    const nav = get(navStore);
    if (!nav.applyingUrlState) {
      applyUrlState({ fromHistory: true });
    }
  });

  // Listen for custom url-sync events from other modules
  window.addEventListener('semantic:url-sync-requested', ((e: CustomEvent) => {
    updateUrlState(e.detail?.params, {
      mode: e.detail?.mode || 'push',
      reason: e.detail?.reason || 'external',
    });
  }) as EventListener);
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _restoreFiltersFromParams(params: URLSearchParams): void {
  const status = params.get('status');
  const city = params.get('city');
  const website = params.get('website');
  const email = params.get('email');
  const geocoded = params.get('geocoded');

  // Filters are restored via the legacy bridge during phased migration.
  // TODO: Replace with direct store mutations once filter-state.ts is ported.
  if (status || city || website || email || geocoded) {
    // Dispatch a custom event for the filter owner to handle
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('semantic:filters-restore-requested', {
          detail: {
            status: status || undefined,
            city: city || undefined,
            website: website === '1',
            email: email === '1',
            geocoded: geocoded === '1',
          },
        })
      );
    }
  }
}

function _restoreClusterFilter(clusterStr: string): void {
  const cluster = Number(clusterStr);
  if (!Number.isFinite(cluster)) return;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('semantic:cluster-filter-restore-requested', {
        detail: { cluster },
      })
    );
  }
}

/**
 * Restore search state from URL `q` param and optionally focus the `anchor`.
 * Fires the Svelte search engine, populates the search store, and if an
 * anchor id is provided, dispatches SEARCH_FOCUS_REQUESTED so that
 * triggers.ts can populate the trail stores.
 */
async function _restoreSearchFromParams(
  query: string,
  anchorId: string | null
): Promise<void> {
  try {
    const { runSearch, searchStore } = await import('@lib/stores/search.svelte');
    const { publish, EVENTS } = await import('@lib/orchestration/event-bus');

    // If a numeric anchor was specified, dispatch SEARCH_FOCUS_REQUESTED
    // immediately so the focus/trail stores populate synchronously with URL
    // restore. This ensures the Svelte shell renders the focus-stage
    // trail controls without waiting for the (potentially slow) search
    // request to complete — contract tests query the DOM right after
    // load, and would otherwise race the async search.
    if (anchorId) {
      const numericId = Number(anchorId);
      if (Number.isFinite(numericId)) {
        publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: numericId });
      }
    }

    const signal = AbortSignal.timeout(30000);
    await runSearch(query, signal);

    // If an anchor was specified by id (non-numeric), focus it once results
    // are available. Numeric anchors are already handled above.
    if (anchorId && !Number.isFinite(Number(anchorId))) {
      const results = searchStore.results;
      if (results && results.length > 0) {
        const byId = results.find((r) => r.id === anchorId);
        if (byId) {
          publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: byId.index });
        }
      }
    }
  } catch (err) {
    debugWarn('[url-state] Search restore from URL failed:', err);
  }
}

/**
 * Minimal toast notification. TODO: Port from lifecycle.js showExperienceToast.
 */
function _showToast(_title: string, _message: string): void {
  // Placeholder — will be replaced by the notification system
  console.info(`[Toast] ${_title}: ${_message}`);
}
