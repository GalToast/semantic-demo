/**
 * @lib/orchestration/url-state.ts — URL state sync (read from URL params, pushState on changes)
 *
 * Port of:
 *
 * Reads application state from URL search params on load, and pushes state changes
 * back to the URL via pushState/replaceState. Handles browser history navigation,
 * deferred state restoration (for data that loads async), and share-link generation.
 */

import { get } from 'svelte/store'
import { navStore, bumpUrlStateRestoreToken, writeNavStateMirror } from '@lib/stores/navigation.svelte.ts'
import { setJourneyPhase, journeyStore } from '@lib/stores/journey.svelte'
import type { NavState, ViewName } from '@lib/types/state'
import { debugWarn } from '@lib/utils/debug'
import { clearSearch, runSearch, searchStore } from '@lib/stores/search.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import { publish, subscribe, EVENTS } from '@lib/orchestration/event-bus'
import { restoreActiveClusterFilterFromUrl, restoreActiveFiltersFromUrl } from '@lib/stores/filter.svelte'
import { showExperienceToast } from '@lib/orchestration/toast'
import { updateSelectedBusiness } from '@lib/journey/selected-card'
import { appState } from '@lib/state/app.svelte'
import { applyFilters } from '@lib/orchestration/search-filter-core'
import { syncFilterControls } from '@lib/orchestration/cluster-filter-controller'

/**
 * NavState extended with the legacy `activeStoryPrompt` field that lives in
 * the runtime state object but is not (yet) declared in the canonical
 * NavState interface in types/state.ts.  Remove this augmentation once the
 * upstream type is updated.
 */
type NavStateWithStory = NavState & { activeStoryPrompt?: string | null }

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UrlStateOptions {
    /** Whether this restore was triggered by browser history navigation. */
    fromHistory?: boolean
    /** History state payload from popstate event. */
    historyState?: { params?: Record<string, string> }
    /** Force the update even when applyingUrlState is true. */
    force?: boolean
}

export interface UpdateUrlStateOptions {
    /** 'push' creates a new history entry; 'replace' modifies the current one. */
    mode?: 'push' | 'replace'
    /** Reason for the update (for debugging). */
    reason?: string
    /** Force update even when applyingUrlState is true. */
    force?: boolean
}

export interface ActiveFilters {
    status: string
    city: string
    website: boolean
    email: boolean
    geocoded: boolean
}

// ── Internal State ────────────────────────────────────────────────────────────

// ── URL Param Helpers ─────────────────────────────────────────────────────────

function getSearchParams(): URLSearchParams {
    if (typeof window === 'undefined') return new URLSearchParams()
    return new URLSearchParams(window.location.search || '')
}

function getLocationHref(): string {
    if (typeof window === 'undefined') return ''
    return window.location.href
}

function getLocationPathname(): string {
    if (typeof window === 'undefined') return '/'
    return window.location.pathname || '/'
}

/**
 * Parse a depth value from URL params, clamped to [0, 2].
 * Exported (Phase 6c, 2026-06-26) to enable direct contract testing without
 * Svelte runtime / appState mocking.
 */
export function getRequestedUrlDepth(params: URLSearchParams): number {
    const rawDepth = Number(params.get('depth') || 0)
    return Number.isFinite(rawDepth) ? Math.max(0, Math.min(2, rawDepth)) : 0
}

// ── State Reset ───────────────────────────────────────────────────────────────

/**
 * Clear exploration/selection state before restoring from URL.
 */
export function clearExplorationFocusSelection(): void {
    writeNavStateMirror({
        focusedIndex: null,
        mode: 'overview',
        trailDepth: 0,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1
    })
    appState.withMutation(() => {
        appState.focusedNode = null
        appState.trailIndices?.clear?.()
    })
    updateSelectedBusiness(null)
}

/**
 * Reset all application state to defaults before URL restore.
 */
export function resetStateBeforeUrlRestore(options: { clearSearchInput?: boolean } = {}): void {
    clearExplorationFocusSelection()

    navStore.update((s) => ({
        ...s,
        mode: 'overview',
        currentView: 'galaxy',
        myceliumMode: 'default',
        trailDepthFromExploration: 0,
        trailDepth: 0
    }))
    appState.withMutation(() => {
        appState.currentView = 'galaxy'
        appState.trailDepth = 0
        appState.semanticDiveMode = false
        appState.myceliumMode = 'default'
        appState.navState.trailDepth = 0
    })
    clearSearch()
    focusStore.update((s) => {
        const next = { ...s }
        next.selectedBusiness = null
        next.semanticDiveMode = false
        return next
    })
    journeyStore.update((s) => {
        const next = { ...s }
        next.depth = 0
        next.trailDepth = 0
        return next
    })

    if (options.clearSearchInput) {
        const input = document.getElementById('search-input') as HTMLInputElement | null
        if (input) {
            input.value = ''
            if (typeof input.dispatchEvent === 'function') {
                input.dispatchEvent(new Event('input', { bubbles: true }))
            }
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
    const restoreToken = bumpUrlStateRestoreToken()
    const $nav = get(navStore)
    const priorRestoringBrowserHistory = $nav.restoringBrowserHistory

    navStore.update((s) => ({
        ...s,
        applyingUrlState: true,
        restoringBrowserHistory: !!options.fromHistory
    }))

    const params = getSearchParams()

    try {
        resetStateBeforeUrlRestore()

        // View restoration
        const view = params.get('view')
        const targetView: ViewName = view === 'map' ? 'map' : 'galaxy'
        navStore.update((s) => ({ ...s, currentView: targetView }))
        if (typeof document !== 'undefined' && document.body) {
            document.body.dataset.viewMode = targetView
        }

        // Filter restoration (status, city, website, email, geocoded)
        _restoreFiltersFromParams(params)

        // Mode restoration
        const mode = params.get('mode')
        if (mode) {
            navStore.update((s) => ({ ...s, myceliumMode: mode }))
        }

        // Cluster filter restoration
        const cluster = params.get('cluster')
        if (cluster !== null) {
            // Delegate to cluster filter owner
            _restoreClusterFilter(cluster)
        }

        // Story restoration
        const story = params.get('story')
        if (story) {
            navStore.update((s) => ({ ...s, activeStoryPrompt: story }))
            if (!options.fromHistory) {
                updateUrlState({}, { reason: 'apply-url-story', force: true })
            }
            return
        }

        // Depth restoration
        const depth = getRequestedUrlDepth(params)
        if (depth > 0) {
            navStore.update((s) => ({ ...s, trailDepthFromExploration: depth }))
        }

        // Anchor restoration runs whenever ?anchor is present (independent of ?q).
        // Split this out of the search-restoration branch so bare-anchor URLs and
        // search URLs share the same focus path. Numeric and non-numeric anchor
        // ids take different routes; see helpers below.
        const query = params.get('q')
        const anchorId = params.get('anchor')
        if (anchorId) {
            await _restoreAnchorFromParams(anchorId)
        }

        // Search-query restoration runs only when there's a query to fulfill.
        // It still resolves non-numeric anchors against the search results, but
        // numeric anchors are already settled by `_restoreAnchorFromParams`.
        if (query && query.trim().length >= 2) {
            await _restoreSearchFromParams(query, anchorId)
        }

        preserveDomForcedFocusSearchSurface()

        // URL sync after apply
        if (!options.fromHistory) {
            updateUrlState({}, { reason: 'apply-url', force: true })
        }
    } finally {
        const current = get(navStore)
        if (current.urlStateRestoreToken === restoreToken || restoreToken === current.urlStateRestoreToken) {
            navStore.update((s) => ({
                ...s,
                applyingUrlState: false,
                restoringBrowserHistory: priorRestoringBrowserHistory
            }))
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
    if (typeof window === 'undefined' || !window.location || !window.history) return

    const $nav = get(navStore) as NavStateWithStory
    if ($nav.applyingUrlState && !options.force) return
    if ($nav.restoringBrowserHistory) return

    const params = getSearchParams()

    // View — only encode when non-default (galaxy) so a fresh visit keeps a
    // clean URL. applyUrlState() already defaults a missing `view` param to
    // galaxy, so omitting it on the default is lossless.
    if ($nav.currentView !== 'galaxy') params.set('view', $nav.currentView)
    else params.delete('view')

    // Search query
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null
    const query = (searchInput?.value || '').trim()
    if (query) params.set('q', query)
    else params.delete('q')

    // Mode
    if ($nav.myceliumMode !== 'default') params.set('mode', $nav.myceliumMode)
    else params.delete('mode')

    // Depth
    if ($nav.trailDepthFromExploration > 0) {
        params.set('depth', String($nav.trailDepthFromExploration))
    } else {
        params.delete('depth')
    }

    // Story
    if ($nav.activeStoryPrompt) params.set('story', $nav.activeStoryPrompt)
    else params.delete('story')

    // Extra params
    for (const [key, value] of Object.entries(extra)) {
        if (value === null || value === undefined || value === '') params.delete(key)
        else params.set(key, String(value))
    }

    // Build URL
    const pathname = getLocationPathname()
    const queryString = params.toString()
    const next = `${pathname}${queryString ? `?${queryString}` : ''}`
    const current = `${pathname}${window.location.search || ''}`

    const historyState = {
        semanticDemo: true,
        reason: options.reason || 'state',
        params: Object.fromEntries(params.entries())
    }

    // No-op if URL hasn't changed
    if (next === current) {
        if (!window.history.state?.semanticDemo || !window.history.state?.params) {
            try {
                window.history.replaceState(historyState, '', next)
            } catch (err) {
                if (err instanceof Error && err.name !== 'SecurityError') {
                    debugWarn('updateUrlState replaceState failed:', err)
                }
            }
        }
        return
    }

    // Push or replace
    const method = options.mode === 'push' && !$nav.applyingUrlState ? 'pushState' : 'replaceState'
    try {
        window.history[method](historyState, '', next)
    } catch (err) {
        if (err instanceof Error && err.name !== 'SecurityError') {
            debugWarn('updateUrlState history call failed:', err)
        }
    }
}

// ── Share Link ────────────────────────────────────────────────────────────────

/**
 * Copy a shareable URL for the current view state to the clipboard.
 */
export async function copyCurrentViewLink(): Promise<string | null> {
    let shareUrl: URL
    try {
        shareUrl = new URL(getLocationHref())
    } catch {
        _showToast('Copy unavailable', 'Could not read the current page URL.')
        return null
    }

    const $nav = get(navStore)

    shareUrl.searchParams.delete('cb')
    shareUrl.searchParams.delete('lead')
    shareUrl.searchParams.set('view', $nav.currentView || 'galaxy')

    if ($nav.myceliumMode && $nav.myceliumMode !== 'default') {
        shareUrl.searchParams.set('mode', $nav.myceliumMode)
    }

    const href = shareUrl.toString()
    try {
        await navigator.clipboard.writeText(href)
    } catch (err) {
        debugWarn('Clipboard write failed:', err)
        _showToast('Copy unavailable', 'Could not write to clipboard.')
        return null
    }

    _showToast('View link copied', 'Link copied to clipboard.')
    return href
}

// ── Event Subscriptions ───────────────────────────────────────────────────────

/**
 * Initialize URL state event listeners.
 * Call once after the app shell is ready.
 */
export function initUrlStateSync(): void {
    if (typeof window === 'undefined') return

    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', () => {
        const nav = get(navStore)
        if (!nav.applyingUrlState) {
            applyUrlState({ fromHistory: true })
        }
    })

    // Listen for custom url-sync events from other modules
    window.addEventListener('semantic:url-sync-requested', ((e: CustomEvent) => {
        updateUrlState(e.detail?.params, {
            mode: e.detail?.mode || 'push',
            reason: e.detail?.reason || 'external'
        })
    }) as EventListener)
}

// Keep the browser URL aligned with Svelte-owned lifecycle/search events.
// The legacy URL module already performs this cleanup; the Svelte shell needs
// the same behavior so remounted search inputs do not restore stale ?q params.
subscribe(EVENTS.SEARCH_CLEARED, () => {
    updateUrlState({ q: null, offset: null }, { reason: 'search-clear' })
})

subscribe(EVENTS.SEARCH_SUCCESS, () => {
    updateUrlState({ offset: null }, { reason: 'search-payload' })
})

subscribe(EVENTS.SEARCH_EMPTY, () => {
    updateUrlState({ offset: null }, { reason: 'search' })
})

subscribe(EVENTS.STATE_RESET, ({ options }: { options?: { skipUrlSync?: boolean } }) => {
    if (!options?.skipUrlSync) {
        updateUrlState({ q: null, record: null, anchor: null, depth: null }, { mode: 'push', reason: 'reset' })
    }
})

// ── Internal Helpers ──────────────────────────────────────────────────────────

function _restoreFiltersFromParams(params: URLSearchParams): void {
    const hasFilterParams = ['status', 'city', 'website', 'email', 'geocoded'].some((key) => params.has(key))
    restoreActiveFiltersFromUrl(params)
    if (!hasFilterParams) return

    try {
        syncFilterControls()
        applyFilters()
    } catch (err) {
        debugWarn('[url-state] Filter UI sync after URL restore failed:', err)
        applyFilters()
    }
}

function _restoreClusterFilter(clusterStr: string): void {
    const cluster = Number(clusterStr)
    if (!Number.isFinite(cluster)) return

    const params = new URLSearchParams()
    params.set('cluster', String(cluster))
    restoreActiveClusterFilterFromUrl(params)

    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('semantic:cluster-filter-restore-requested', {
                detail: { cluster }
            })
        )
    }
}

function isDomForcedFocusSearchSurface(): boolean {
    if (typeof document === 'undefined' || !document.body) return false
    return (
        document.body.dataset.focusSearchForced === 'true' ||
        (document.body.dataset.panelSurface === 'focus-search' && document.body.dataset.journeyPhase === 'search')
    )
}

function preserveDomForcedFocusSearchSurface(): void {
    if (!isDomForcedFocusSearchSurface()) return

    document.body.dataset.graphContext = 'focus-search'
    document.body.dataset.panelSurface = 'focus-search'
    document.body.dataset.journeyPhase = 'search'

    navStore.update((s) => ({
        ...s,
        mode: 'search',
        surface: 'focus-search',
        previousSurface: s.surface === 'focus-search' ? s.previousSurface : s.surface
    }))
    setJourneyPhase('search')
}

/**
 * _restoreAnchorFromParams — restore focus for a numeric anchor id,
 * independent of any `q` query.
 *
 * Why a separate helper: the previous design routed anchor handling through
 * `_restoreSearchFromParams`, which only ran when `q?.trim().length >= 2`.
 * Bare `?anchor=<id>` URLs (no query) silently skipped focus dispatch and the
 * focus pocket never rebuilt. Splitting the path means anchor restoration now
 * runs whenever `?anchor` is present, regardless of whether a query followed.
 *
 * Numeric anchor flow:
 *   1. Publish `SEARCH_FOCUS_REQUESTED` from the mounted URL-state replay path
 *      after data is available and Svelte has an active component context.
 *   2. Direct `applyLocalNeighborhoodFocus` call as a defensive reflection of
 *      the FocusPocket `$effect` rebuild — closes the URL→focus race even
 *      when the navStore update races the data-ready transition.
 *
 * Non-numeric ids (e.g. a lead_id string) are resolved against search results
 * inside `_restoreSearchFromParams` after the search round-trip, because they
 * need a result list to map against.
 */
async function _restoreAnchorFromParams(anchorId: string): Promise<void> {
    const numericId = Number(anchorId)
    if (!Number.isFinite(numericId)) return

    // A3-3: Validate the anchor index against the loaded dataset.
    // Out-of-range, negative, or dataset-not-yet-loaded indices fall back to
    // overview so the app never hangs in a broken focus state.
    const pointCount = appState?.points?.length ?? 0
    if (pointCount === 0 || numericId < 0 || numericId >= pointCount) {
        debugWarn(
            '[url-state] A3-3: anchor',
            numericId,
            'out of range (dataset has',
            pointCount,
            'points) — falling back to overview'
        )
        showExperienceToast('Anchor not available', `Business #${numericId} isn't available in this dataset.`)
        // Return to overview mode so the app is usable.
        navStore.update((s) => ({
            ...s,
            mode: 'overview',
            focusedIndex: null,
            surface: 'idle'
        }))
        // Strip the invalid ?anchor= from the URL so refresh doesn't repeat.
        try {
            const url = new URL(window.location.href)
            url.searchParams.delete('anchor')
            window.history.replaceState(window.history.state ?? {}, '', `${url.pathname}${url.search}`)
        } catch {
            // URL rewrite is best-effort
        }
        return
    }

    publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: numericId })
    // W44-S5: dynamic import keeps Three.js + focus-pocket geometry off the
    // cold-load modulepreload list. focus/pocket.ts imports Vector3 / PerspectiveCamera
    // from 'three' for layout math; url-state sits on App.svelte's cold path so any
    // static import here would pull the entire Three chunk into cold-preload.
    // The function is only called for numeric `?anchor=` params, so lazy-loading
    // it does not affect anything outside the anchor-restoration path.
    try {
        const { applyLocalNeighborhoodFocus } = await import('@lib/focus/pocket')
        applyLocalNeighborhoodFocus(numericId)
    } catch (e) {
        debugWarn('[url-state] applyLocalNeighborhoodFocus failed for anchor', numericId, e)
    }
}

/**
 * Restore the in-flight `q` query, and resolve non-numeric anchors against
 * the result list once the search round-trip completes.
 *
 * Numeric anchor handling moved out to `_restoreAnchorFromParams` so anchor
 * restore fires unconditionally and search restore stays focused on query
 * fulfillment only.
 */
async function _restoreSearchFromParams(query: string, anchorId: string | null): Promise<void> {
    try {
        const domForcedFocusSearchSurface = isDomForcedFocusSearchSurface()
        const signal = AbortSignal.timeout(30000)
        await runSearch(query, signal)

        // UI-7: Directly populate the search input from the URL ?q= param.
        // runSearch sets the store query, but the SearchInput component may not
        // have mounted yet or its reactive sync may not have propagated to the
        // DOM <input> value. Setting it here guarantees the input reflects the URL.
        const input = document.getElementById('search-input') as HTMLInputElement | null
        if (input && input.value !== query) {
            input.value = query
            input.dispatchEvent(new Event('input', { bubbles: true }))
        }

        if (domForcedFocusSearchSurface) preserveDomForcedFocusSearchSurface()

        // Focus the anchor once search results are available. Numeric anchors
        // are ALSO re-fired here: their earlier publish in `_restoreAnchorFromParams`
        // fires before currentSearchSummary populates,
        // leaving threadCandidates empty and the focus pocket / thread inspector
        // without neighbor data. This re-fire runs after runSearch completes, so
        // resultIndices is populated. The subscriber guards addTrailStop against
        // duplicate trail stops. See docs/bug-thread-inspector-baseline-and-activation-2026-06-18.md
        const numericAnchor = Number.isFinite(Number(anchorId))
        const results = searchStore().results
        const byId = results && results.length > 0 ? results.find((r: { id: string }) => r.id === anchorId) : null
        if (byId) {
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: byId.index })
        } else if (numericAnchor) {
            // Raw numeric anchor (?anchor=519) that isn't in results by .id
            // (results .id is a lead_id string). Re-fire by numeric index directly.
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: Number(anchorId) })
        }
        preserveDomForcedFocusSearchSurface()
    } catch (err) {
        debugWarn('[url-state] Search restore from URL failed:', err)
    }
}

/**
 * Minimal toast notification. Ported to Svelte Toast component
 * (see src/components/Toast.svelte, src/lib/orchestration/toast.ts).
 */
function _showToast(title: string, message: string): void {
    showExperienceToast(title, message)
}
