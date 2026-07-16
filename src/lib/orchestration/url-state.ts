/**
 * @lib/orchestration/url-state.ts — URL state sync (read from URL params, pushState on changes)
 *
 * Port of:
 *
 * Reads application state from URL search params on load, and pushes state changes
 * back to the URL via pushState/replaceState. Handles browser history navigation,
 * deferred state restoration (for data that loads async), and share-link generation.
 */

import { get, type Unsubscriber } from 'svelte/store'
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
import { semanticNeighborMap } from '@lib/data-store'
import {
    getSearchParams,
    getLocationHref,
    getLocationPathname,
    isDomForcedFocusSearchSurface
} from '@lib/orchestration/url-params'

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

// ── Internal State ────────────────────────────────────────────────────────────

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
    appState.focusedNode = null
    appState.trailIndices?.clear?.()
    updateSelectedBusiness(null)
    // Note: the prior line `legacyState.selectedPoint = null`
    // (and `legacyState.currentSearchSummary = null`) was deleted.
    // It was a no-op at runtime (the flat `selectedPoint` slot does
    // not exist on the Svelte 5 class instance, only `focusState` does),
    // and it threw "Cannot set property selectedPoint of #<Object>
    // which has only a getter" in the url-state mock harness because
    // the mock defines a getter-only accessor for the flat path.
    //
    // Compatibility reads via the test-bridge proxy (Playwright
    // surface tests, journey contract tests) are now satisfied by
    // a fallback in src/main.ts:182 getCompatValue(): if the flat
    // `legacyState[prop]` is undefined, the getter falls back to
    // `legacyState.focusState[prop]` for selectedPoint-family fields
    // and `legacyState.searchState[prop]` for currentSearchSummary.
    // See tmp/selectedPoint-bug-audit-2026-06-29.md Section 4.
}

/**
 * Reset all application state to defaults before URL restore.
 */
export function resetStateBeforeUrlRestore(options: { clearSearchInput?: boolean } = {}): void {
    clearExplorationFocusSelection()

    writeNavStateMirror({
        mode: 'overview',
        currentView: 'galaxy',
        myceliumMode: 'default',
        trailDepthFromExploration: 0,
        trailDepth: 0
    })
    appState.semanticDiveMode = false
    appState.myceliumMode = 'default'
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
 * Token check for in-flight applyUrlState calls.
 *
 * When a newer applyUrlState() bumps `navState.urlStateRestoreToken`, any
 * earlier in-flight restore should bail out before writing stale state.
 * `bindGlobalEvents` registers the active popstate listener and does NOT
 * guard on `applyingUrlState`, so a rapid back/forward can re-enter
 * applyUrlState mid-await. The token check below short-circuits the stale
 * restore at each await point.
 *
 * @returns true if THIS applyUrlState's token no longer matches the current
 *   global token (a newer applyUrlState has started). Caller should bail.
 */
function _isRestoreStale(token: number): boolean {
    return get(navStore).urlStateRestoreToken !== token
}

/**
 * Controller for the in-flight restore. Aborted when a newer applyUrlState
 * starts, so the previous restore's `await runSearch` rejects cleanly instead
 * of writing stale state after the newer restore has already begun.
 */
let _activeRestoreController: AbortController | null = null

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

    // Abort any previous in-flight restore. Its runSearch may still resolve
    // AFTER this one starts writing state, writing stale results on top of
    // ours. Aborting makes the previous restore's awaits reject immediately,
    // so only the controller we create below drives current writes.
    _activeRestoreController?.abort()
    const restoreController = new AbortController()
    _activeRestoreController = restoreController

    writeNavStateMirror({
        applyingUrlState: true,
        restoringBrowserHistory: !!options.fromHistory
    })

    const params = getSearchParams()

    try {
        resetStateBeforeUrlRestore()

        // View restoration
        const view = params.get('view')
        const targetView: ViewName = view === 'map' ? 'map' : 'galaxy'
        writeNavStateMirror({ currentView: targetView })

        // Filter restoration (status, city, website, email, geocoded)
        _restoreFiltersFromParams(params)

        // Mode restoration
        const mode = params.get('mode')
        if (mode) {
            writeNavStateMirror({ myceliumMode: mode })
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
            writeNavStateMirror({ activeStoryPrompt: story })
            if (!options.fromHistory) {
                updateUrlState({}, { reason: 'apply-url-story', force: true })
            }
            return
        }

        // Depth restoration
        const depth = getRequestedUrlDepth(params)
        if (depth > 0) {
            writeNavStateMirror({ trailDepthFromExploration: depth })
        }

        // Record (lead_id) restoration. The camera/focus pipeline writes
        // `record=<lead_id>` when a business is focused, but applyUrlState
        // only restored `anchor` (array index). For shared links like
        // `?q=coffee&record=519` (with no anchor), the focus was silently
        // dropped and the app fell back to the default business.
        // Map record to an array index, then treat it as the anchor for the
        // existing focus-restoration path. If both are present, anchor
        // wins (record is preserved in the URL for sharing).
        const query = params.get('q')
        let anchorId = params.get('anchor')
        const recordId = params.get('record')
        if (recordId && !anchorId) {
            const recordIndex = appState.points?.findIndex((p) => String(p.lead_id) === recordId) ?? -1
            if (recordIndex >= 0) {
                anchorId = String(recordIndex)
            } else {
                debugWarn('[url-state] record', recordId, 'not found in dataset; ignoring')
                showExperienceToast('Record not found', `Record ${recordId} isn't available in this dataset.`)
            }
        }

        // Anchor restoration runs whenever ?anchor is present (independent of ?q).
        // Split this out of the search-restoration branch so bare-anchor URLs and
        // search URLs share the same focus path. Numeric and non-numeric anchor
        // ids take different routes; see helpers below.
        if (anchorId) {
            await _restoreAnchorFromParams(anchorId, restoreToken, restoreController.signal)
            // Token-abort: if a newer applyUrlState bumped the token while we
            // were awaiting, our restore is stale. Bail before any further writes.
            if (_isRestoreStale(restoreToken)) return
        }

        // Search-query restoration runs only when there's a query to fulfill.
        // It still resolves non-numeric anchors against the search results, but
        // numeric anchors are already settled by `_restoreAnchorFromParams`.
        if (query && query.trim().length >= 2) {
            await _restoreSearchFromParams(query, anchorId, restoreToken, restoreController.signal)
            if (_isRestoreStale(restoreToken)) return
        }

        preserveDomForcedFocusSearchSurface()

        // URL sync after apply
        if (!options.fromHistory) {
            updateUrlState({}, { reason: 'apply-url', force: true })
        }
    } catch (err) {
        // Non-fatal: a deep-link restore failure must never crash boot or
        // surface as an unhandled rejection. Emit a non-fatal signal and
        // continue; the finally block still clears the applyingUrlState flag.
        debugWarn('[deep-link] restore failed', err)
        try {
            showExperienceToast('Link state could not be restored', 'Showing the default view.')
        } catch {
            // showExperienceToast itself failed; surface via the gated diagnostic
            // (never an ungated console.* in production paths).
            debugWarn('[deep-link] restore failed (toast unavailable)', err)
        }
    } finally {
        const current = get(navStore)
        if (current.urlStateRestoreToken === restoreToken || restoreToken === current.urlStateRestoreToken) {
            writeNavStateMirror({
                applyingUrlState: false,
                restoringBrowserHistory: priorRestoringBrowserHistory
            })
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

// Keep the browser URL aligned with Svelte-owned lifecycle/search events.
// The legacy URL module already performs this cleanup; the Svelte shell needs
// the same behavior so remounted search inputs do not restore stale ?q params.
//
// Registered through `registerUrlStateEventListeners()` so the unsubscribe
// handles are captured (previously dropped on the floor → leak on HMR /
// module re-evaluation). Idempotent within a module instance; auto-invoked
// once at module load to preserve prior registration timing for importers
// and tests. main.ts holds the returned teardown for app unload.
let _urlStateEventTeardown: (() => void) | null = null

export function registerUrlStateEventListeners(): () => void {
    if (_urlStateEventTeardown) return _urlStateEventTeardown
    const unsubscribers = [
        subscribe(EVENTS.SEARCH_CLEARED, () => {
            updateUrlState({ q: null, offset: null }, { reason: 'search-clear' })
        }),
        subscribe(EVENTS.SEARCH_SUCCESS, () => {
            updateUrlState({ offset: null }, { reason: 'search-payload' })
        }),
        subscribe(EVENTS.SEARCH_EMPTY, () => {
            updateUrlState({ offset: null }, { reason: 'search' })
        }),
        subscribe(EVENTS.STATE_RESET, ({ options }: { options?: { skipUrlSync?: boolean } }) => {
            if (!options?.skipUrlSync) {
                updateUrlState({ q: null, record: null, anchor: null, depth: null }, { mode: 'push', reason: 'reset' })
            }
        })
    ]
    _urlStateEventTeardown = () => {
        for (const unsub of unsubscribers) unsub()
        _urlStateEventTeardown = null
    }
    return _urlStateEventTeardown
}

// Preserve prior module-load registration behavior.
registerUrlStateEventListeners()

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

function preserveDomForcedFocusSearchSurface(): void {
    if (!isDomForcedFocusSearchSurface()) return

    const cur = get(navStore)
    writeNavStateMirror({
        mode: 'search',
        surface: 'focus-search',
        previousSurface: cur.surface === 'focus-search' ? cur.previousSurface : cur.surface
    })
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
// --- Helpers for _restoreAnchorFromParams ---

/**
 * Parse and validate a numeric anchor id against the loaded dataset.
 * Returns `{ valid: false }` if the id is non-numeric or out of range
 * (after writing fallback state and stripping the URL param).
 */
function _validateAnchorIndex(anchorId: string): { valid: false } | { valid: true; numericId: number } {
    const numericId = Number(anchorId)
    if (!Number.isFinite(numericId)) return { valid: false }

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
        writeNavStateMirror({
            mode: 'overview',
            focusedIndex: null,
            surface: 'idle'
        })
        // Strip the invalid ?anchor= from the URL so refresh doesn't repeat.
        try {
            const url = new URL(window.location.href)
            url.searchParams.delete('anchor')
            window.history.replaceState(window.history.state ?? {}, '', `${url.pathname}${url.search}`)
        } catch {
            // URL rewrite is best-effort
        }
        return { valid: false }
    }

    return { valid: true, numericId }
}

/**
 * PR-B4: write focus state directly and publish the focus event.
 * The legacy URL writes `record=<lead_id>` when a business is focused, and
 * the focus state must be restored even if triggers.ts is still loading via
 * requestIdleCallback.
 */
function _restoreFocusStateForAnchor(numericId: number): void {
    writeNavStateMirror({
        focusedIndex: numericId,
        mode: 'focus',
        surface: 'focus-search',
        trailDepth: 1,
        trailSeedIndex: numericId
    })

    publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: numericId })
}

/**
 * shittiest-parts #1: deep-link focus built the pocket + connection rays but never
 * framed the camera, so they sat off-screen in the full mycelium cloud. Frame the
 * camera on the focused anchor/pocket once the pocket is built. Idempotent + guarded
 * inside animateCameraToNode (no-op if camera/controls aren't ready yet). Dynamic
 * import keeps boot lean. Also guarantees the anchor→satellite rays are (re)built
 * for this pocket even if the focus-ui effect hasn't fired yet on a deep-link boot.
 */
function _frameCameraOnAnchor(index: number): void {
    if (!Number.isFinite(index)) return
    void import('@lib/engine/camera-choreography/focus')
        .then((m) => {
            try {
                m.animateCameraToNode(index, { transitionStyle: 'focus' })
            } catch (e) {
                debugWarn('[url-state] camera frame on anchor failed', index, e)
            }
        })
        .catch((e) => debugWarn('[url-state] camera-choreography import failed', e))
    void import('@lib/journey/semantic-overlay')
        .then((m) => {
            try {
                m.refreshFocusSemanticOverlay()
                m.updateFocusSemanticOverlayPositions()
            } catch (e) {
                debugWarn('[url-state] focus semantic overlay refresh failed', index, e)
            }
        })
        .catch((e) => debugWarn('[url-state] semantic-overlay import failed', e))
    // shittiest-parts #1: the focus dim/brightness logic in point-color.ts only
    // runs when applyPointFilterColors() is invoked. The interactive focus path
    // calls it (restoreFocusTrailState), but the deep-link path never did — so
    // the pocket's relative brightness (and the background dim) never applied on
    // ?anchor=/?record= deep links. Refresh colors here so the gathered
    // neighborhood reads as prominent against the 8,406-dot field.
    void import('@lib/journey/point-color')
        .then((m) => {
            try {
                m.applyPointFilterColors()
            } catch (e) {
                debugWarn('[url-state] point-color refresh failed', index, e)
            }
        })
        .catch((e) => debugWarn('[url-state] point-color import failed', e))
}

/**
 * W44-S5: dynamic import keeps Three.js + focus-pocket geometry off the
 * cold-load modulepreload list. Returns `true` if the focus-pocket was
 * applied (or skipped because no import was needed), `false` if a newer
 * restore superseded this one (caller should bail).
 */
async function _applyFocusPocketForAnchor(
    numericId: number,
    restoreToken: number,
    signal: AbortSignal
): Promise<boolean> {
    try {
        // Pass signal so a newer applyUrlState aborts the dynamic import
        // mid-flight rather than completing a now-stale focus-pocket mutation.
        // ImportCallOptions.signal is supported at runtime (Node 17+, all modern browsers)
        // but isn't in @types/node ImportCallOptions in this TS version. `as never`
        // bridges the type-only gap; the runtime call is well-defined.
        const _focusPocketMod = (await import('@lib/focus/pocket')) as {
            applyLocalNeighborhoodFocus: (index: number) => void
        }
        const applyLocalNeighborhoodFocus = _focusPocketMod.applyLocalNeighborhoodFocus
        // Token-abort: bail before the focus-pocket mutation if a newer
        // applyUrlState bumped the token while the dynamic import resolved.
        if (_isRestoreStale(restoreToken)) return false
        applyLocalNeighborhoodFocus(numericId)
        _frameCameraOnAnchor(numericId)
    } catch (e) {
        debugWarn('[url-state] applyLocalNeighborhoodFocus failed for anchor', numericId, e)
    }
    return true
}

/**
 * PR-B5: deep-link constellation race fix.
 *
 * The initial focus dispatch above runs immediately after `initData()`
 * resolves, but `initData()` explicitly does NOT wait for the 40 MB
 * semantic-thread artifact — see data-store.ts:initData():
 *   "Semantic threads are deferred to engine/lifecycle.ts so the main
 *    startup path does not block on the 40 MB thread artifact."
 * Threads load later (requestIdleCallback → loadSemanticThreads),
 * populating `semanticNeighborMap`. At the time this function runs,
 * `semanticNeighborMap` is empty, so the `SEARCH_FOCUS_REQUESTED`
 * subscriber's `buildNeighborhoodManifest` call resolves 0 semantic
 * neighbors and writes empty `threadCandidates`. The FocusPocket
 * `$effect` builds an empty/geom-fallback constellation, and nothing
 * re-fires focus when threads arrive — so `?record=N` deep-links show
 * "0 visible neighbors" / "No neighboring stops found in this area".
 *
 * The normal click flow doesn't hit this: by the time a user clicks,
 * threads are loaded, so `getSemanticThreadCandidates` returns real
 * neighbors. The deep-link path runs at boot, before threads.
 *
 * Fix: if threads aren't loaded yet, subscribe to `semanticNeighborMap`
 * and re-fire the focus pipeline (SEARCH_FOCUS_REQUESTED +
 * applyLocalNeighborhoodFocus) EXACTLY ONCE when it becomes non-empty.
 * This is idempotent:
 *   - The triggers.ts subscriber overwrites `threadCandidates` on each
 *     publish (no accumulation).
 *   - FocusPocket.svelte's `$effect` dedupes rebuilds by candidate
 *     signature (`lastCandidateSignature`), so a no-op re-fire is cheap.
 *   - We guard on `focusedIndex === numericId` so a user navigation away
 *     from the deep-linked business cancels the deferred re-fire.
 *   - We guard on the restore token so a newer applyUrlState supersedes
 *     this one (the subscription is torn down before firing).
 */
function _setupDeferredNeighborRefire(numericId: number, restoreToken: number): void {
    if (get(semanticNeighborMap).size === 0) {
        let unsub: Unsubscriber | null = null
        const refire = async (): Promise<void> => {
            // Bail if the user navigated away or a newer restore superseded us.
            if (appState.navState.focusedIndex !== numericId) return
            if (_isRestoreStale(restoreToken)) return
            try {
                publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: numericId })
                const _focusPocketMod = (await import('@lib/focus/pocket')) as {
                    applyLocalNeighborhoodFocus: (index: number) => void
                }
                // Re-check staleness after the await — the user may have
                // navigated or a newer restore may have started during the
                // dynamic import resolution.
                if (appState.navState.focusedIndex !== numericId) return
                if (_isRestoreStale(restoreToken)) return
                _focusPocketMod.applyLocalNeighborhoodFocus(numericId)
                _frameCameraOnAnchor(numericId)
            } catch (e) {
                debugWarn('[url-state] deferred constellation rebuild failed for anchor', numericId, e)
            }
        }
        unsub = semanticNeighborMap.subscribe((map) => {
            if (map.size > 0) {
                // Threads just became available — fire once and tear down.
                unsub?.()
                unsub = null
                void refire()
            }
        })
    }
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
 */
async function _restoreAnchorFromParams(anchorId: string, restoreToken: number, signal: AbortSignal): Promise<void> {
    const validation = _validateAnchorIndex(anchorId)
    if (!validation.valid) return

    _restoreFocusStateForAnchor(validation.numericId)
    const applied = await _applyFocusPocketForAnchor(validation.numericId, restoreToken, signal)
    if (!applied) return
    _setupDeferredNeighborRefire(validation.numericId, restoreToken)
}

/**
 * Restore the in-flight `q` query, and resolve non-numeric anchors against
 * the result list once the search round-trip completes.
 *
 * Numeric anchor handling moved out to `_restoreAnchorFromParams` so anchor
 * restore fires unconditionally and search restore stays focused on query
 * fulfillment only.
 */
async function _restoreSearchFromParams(
    query: string,
    anchorId: string | null,
    restoreToken: number,
    signal: AbortSignal
): Promise<void> {
    try {
        const domForcedFocusSearchSurface = isDomForcedFocusSearchSurface()
        // Compose the caller's restore signal with a 30s timeout so a hung
        // runSearch still rejects with a timeout reason instead of blocking
        // forever. The restore signal aborts when a newer applyUrlState starts.
        const searchSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)])
        await runSearch(query, searchSignal)
        // Token-abort: bail before post-runSearch writes (DOM mutation,
        // SEARCH_FOCUS_REQUESTED publish, preserveDomForcedFocusSearchSurface)
        // if a newer applyUrlState bumped the token while runSearch was in flight.
        if (_isRestoreStale(restoreToken)) return

        // UI-7: Directly populate the search input from the URL ?q= param.
        // runSearch sets the store query, but the SearchInput component may not
        // have mounted yet or its reactive sync may not have propagated to the
        // DOM <input> value. Setting input.value here guarantees the input
        // reflects the URL on first paint.
        //
        // PR-O5-followup: do NOT dispatch a synthetic 'input' event. The event
        // was originally used to trigger SearchInput's onInput handler, but
        // that path bypassed the onMount guard in SearchInput and produced a
        // second `runSearch` call (state-update side effects double-fired).
        // SearchInput's reactive sync (\$effect reading $searchState.query)
        // and the onMount guard together handle the input value correctly
        // without the synthetic event. See tmp/performsearch-dup-audit-2026-07-01.md.
        const input = document.getElementById('search-input') as HTMLInputElement | null
        if (input && input.value !== query) {
            input.value = query
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

        // Rebuild the constellation now that threadCandidates is populated
        // by the SEARCH_FOCUS_REQUESTED subscriber (which runs synchronously
        // after the publish above). The earlier call in _restoreAnchorFromParams
        // ran before search results were available, leaving the constellation
        // empty. See PR-B4 deep-link restoration path.
        const rebuildIndex = byId ? byId.index : numericAnchor ? Number(anchorId) : -1
        if (rebuildIndex >= 0) {
            try {
                const _focusPocketMod = (await import('@lib/focus/pocket')) as {
                    applyLocalNeighborhoodFocus: (index: number) => void
                }
                if (_isRestoreStale(restoreToken)) return
                _focusPocketMod.applyLocalNeighborhoodFocus(rebuildIndex)
                _frameCameraOnAnchor(rebuildIndex)
            } catch (e) {
                debugWarn('[url-state] applyLocalNeighborhoodFocus re-build failed after search restore', e)
            }
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
