/**
 * @lib/orchestration/url-restore.ts — URL state restore
 *
 * Deserializes URL search params and applies them to application state.
 * Owns the read/restore side of the URL state sync contract; the write
 * side lives in url-writer.ts.
 *
 * Extracted from url-state.ts (Phase 8 split, 2026-08-09).
 */

import { get, type Unsubscriber } from 'svelte/store'
import { navStore, bumpUrlStateRestoreToken, writeNavStateMirror } from '@lib/stores/navigation.svelte.ts'
import { setJourneyPhase, journeyStore } from '@lib/stores/journey.svelte'
import type { NavMode, NavState, PanelSurface, ViewName } from '@lib/types/state'
import { debugWarn } from '@lib/utils/debug'
import { clearSearch, runSearch, searchStore, setSearchError } from '@lib/stores/search.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import {
    getFilterState,
    restoreActiveClusterFilterFromUrl,
    restoreActiveFiltersFromUrl
} from '@lib/stores/filter.svelte'
import { updateSelectedBusiness } from '@lib/journey/selected-card'
import { setFocusedNode } from '@lib/journey/thread-settler'
import { showExperienceToast } from '@lib/orchestration/toast'
import { DisposableRegistry } from '@lib/utils/disposable-registry'
import { animateCameraToNode } from '@lib/engine/camera-choreography/focus'
import { refreshFocusSemanticOverlay, updateFocusSemanticOverlayPositions } from '@lib/journey/semantic-overlay'
import { applyPointFilterColors } from '@lib/journey/point-color'
import { appState } from '@lib/state/app.svelte'
import { applyFilters } from '@lib/orchestration/search-filter-core'
import { syncFilterControls } from '@lib/orchestration/cluster-filter-controller'
import { semanticNeighborMap } from '@lib/data-store'
import {
    getSearchParams,
    getLocationPathname,
    isDomForcedFocusSearchSurface,
    hasRestorableUrlState,
    getRequestedUrlDepth
} from '@lib/orchestration/url-params'
import { setMobileSearchSheetMode } from '@lib/search/search-panel-adapter'
import { isCompactSearchViewport } from '@lib/utils/ui-presentation'
import { startSearch } from '@lib/search/search-abort'
import { updateUrlState, waitForSearchSettle, clearExplorationFocusSelection } from './url-writer'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UrlStateOptions {
    /** Whether this restore was triggered by browser history navigation. */
    fromHistory?: boolean
    /** History state payload from popstate event. */
    historyState?: { params?: Record<string, string> }
    /** Force the update even when applyingUrlState is true. */
    force?: boolean
}

// ── Internal State ────────────────────────────────────────────────────────────

// URL_STATE_KEYS, hasRestorableUrlState, getRequestedUrlDepth moved to url-params.ts

/**
 * Controller for the in-flight restore. Aborted when a newer applyUrlState
 * starts, so the previous restore's `await runSearch` rejects cleanly instead
 * of writing stale state after the newer restore has already begun.
 */
let _activeRestoreController: AbortController | null = null

/**
 * Token check for in-flight applyUrlState calls.
 */
function _isRestoreStale(token: number): boolean {
    return get(navStore).urlStateRestoreToken !== token
}

// ── State Reset ───────────────────────────────────────────────────────────────

/**
 * Reset all application state to defaults before URL restore.
 */
export function resetStateBeforeUrlRestore(options: { clearSearchInput?: boolean } = {}): void {
    // Note: clearSearchInput is accepted for API compat but the input
    // reset is handled by the caller (applyUrlState) to keep the DOM
    // write scoped to the restore path.
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

// Re-export from url-writer so the barrel surface is preserved.
export { clearExplorationFocusSelection } from './url-writer'

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
    const params = getSearchParams()

    // On a fresh visit there is no URL state to restore. In particular, the
    // boot-only `nodemo=1` flag used by the journey tests must not allow the
    // deferred post-data restore to overwrite a mode selected by the user
    // while data initialization is still settling. History restores remain
    // authoritative even when returning to a clean URL, because they must
    // clear the state represented by the previous history entry.
    if (!options.fromHistory && !hasRestorableUrlState(params)) return

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

    const restoredQuery = params.get('q')

    try {
        resetStateBeforeUrlRestore()

        // View restoration
        const view = params.get('view')
        const targetView: ViewName = view === 'map' ? 'map' : 'galaxy'
        writeNavStateMirror({ currentView: targetView, surface: targetView === 'map' ? 'map' : 'idle' })

        // Surface restoration — map ?surface= URL param back to nav mode/surface.
        // Uses the same surface→mode mapping as setSurface() in mode-transitions.
        // Runs AFTER view restoration so an explicit ?surface= overrides the
        // view-derived default (e.g. ?surface=map without ?view=map sets map view).
        const surfaceParam = params.get('surface')
        if (surfaceParam) {
            const _surfaceToMode: Record<string, NavMode> = {
                search: 'search',
                focus: 'focus',
                inside: 'inside',
                trail: 'trail',
                idle: 'overview'
            }
            const restoredMode = _surfaceToMode[surfaceParam]
            const isMapFamily = surfaceParam === 'map' || surfaceParam.startsWith('map-')
            const surfacePatch: Partial<NavState> = { surface: surfaceParam as PanelSurface }
            if (restoredMode) surfacePatch.mode = restoredMode
            if (isMapFamily) surfacePatch.currentView = 'map'
            writeNavStateMirror(surfacePatch)
        }

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

        // Story restoration. NOTE: this must NOT return early — ?story= composes
        // with the other restore params (?story=welcome&q=coffee,
        // ?story=welcome&anchor=42, ?story=welcome&record=5&depth=2). The story
        // prompt is applied first (ordering preserved) but depth/record/anchor/
        // query restoration still runs below so a story link restores ALL of its
        // state, not just the prompt.
        const story = params.get('story')
        if (story) {
            writeNavStateMirror({ activeStoryPrompt: story })
            if (!options.fromHistory) {
                updateUrlState(
                    { q: restoredQuery || null },
                    { reason: 'apply-url-story', force: true, preserveDeepLinkParams: true }
                )
            }
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
                showExperienceToast('Listing not found', `Listing ${recordId} isn't available in this dataset.`)
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

        // URL sync after apply — preserve the original ?q= value even when the
        // search-input DOM hasn't mounted yet, so shared search deep-links stay
        // shareable and browser history doesn't silently drop the query.
        if (!options.fromHistory) {
            updateUrlState(
                { q: restoredQuery || null },
                { reason: 'apply-url', force: true, preserveDeepLinkParams: true }
            )
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
        if (current.urlStateRestoreToken === restoreToken) {
            writeNavStateMirror({
                applyingUrlState: false,
                restoringBrowserHistory: priorRestoringBrowserHistory
            })
        }
    }
}

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
 * inside animateCameraToNode (no-op if camera/controls aren't ready yet). Related
 * helpers are imported directly so the camera frame + overlay refresh stay in one
 * place. Also guarantees the anchor→satellite rays are (re)built for this pocket even
 * if the focus-ui effect hasn't fired yet on a deep-link boot.
 */
function _frameCameraOnAnchor(index: number, restoreToken: number): void {
    if (!Number.isFinite(index)) return

    // PR-B4 follow-up: applyUrlState() runs as soon as data is ready, but the
    // WebGL Canvas initializes asynchronously. The engine creates camera/controls
    // mid-init and then finishes by setting the default overview camera position.
    // If we call animateCameraToNode too early, the move is overwritten. We poll
    // until camera/controls exist, wait one extra tick for the engine to settle, and
    // only then frame the focused anchor.
    const reg = new DisposableRegistry({ label: '_frameCameraOnAnchor' })
    let attempts = 0
    const maxAttempts = 200
    const tryFrame = () => {
        // M10 stale-restore liveness guard: a newer applyUrlState may have
        // bumped urlStateRestoreToken while we polled for camera/controls. If
        // so, bail before animating — otherwise animateCameraToNode(index)
        // yanks the camera back to a now-stale anchor the user navigated away
        // from. Matches the F3 postprocessing liveness-guard pattern (f907e0f5).
        if (_isRestoreStale(restoreToken)) {
            reg.disposeAll()
            return
        }
        attempts += 1
        if (!appState.camera || !appState.controls) {
            if (attempts <= maxAttempts) {
                reg.schedule(100, tryFrame)
            } else {
                debugWarn('[url-state] camera frame on anchor timed out waiting for camera/controls', index)
                reg.disposeAll()
            }
            return
        }

        // Camera/controls exist, but the engine may still be settling its initial
        // overview framing. Wait 500ms before animating so the camera move sticks.
        reg.schedule(500, () => {
            reg.disposeAll()
            // M10: re-check staleness after the 500ms settle — the user may
            // have navigated between camera-ready and this callback firing.
            if (_isRestoreStale(restoreToken)) return
            try {
                animateCameraToNode(index, { transitionStyle: 'focus' })
            } catch (e) {
                debugWarn('[url-state] camera frame on anchor failed', index, e)
            }
            try {
                refreshFocusSemanticOverlay()
                updateFocusSemanticOverlayPositions()
            } catch (e) {
                debugWarn('[url-state] focus semantic overlay refresh failed', index, e)
            }
            try {
                applyPointFilterColors()
            } catch (e) {
                debugWarn('[url-state] point-color refresh failed', index, e)
            }
        })
    }
    tryFrame()
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
    _signal: AbortSignal
): Promise<boolean> {
    try {
        // Pass signal so a newer applyUrlState aborts the dynamic import
        // mid-flight rather than completing a now-stale focus-pocket mutation.
        // ImportCallOptions.signal is supported at runtime (Node 17+, all modern browsers)
        // but isn't in @types/node ImportCallOptions in this TS version. `as never`
        // bridges the type-only gap; the runtime call is well-defined.
        const _focusPocketMod = (await import('@lib/focus/pocket', { signal: _signal } as never)) as {
            applyLocalNeighborhoodFocus: (index: number) => void
        }
        const applyLocalNeighborhoodFocus = _focusPocketMod.applyLocalNeighborhoodFocus
        // Token-abort: bail before the focus-pocket mutation if a newer
        // applyUrlState bumped the token while the dynamic import resolved.
        if (_isRestoreStale(restoreToken)) return false
        applyLocalNeighborhoodFocus(numericId)
        _frameCameraOnAnchor(numericId, restoreToken)
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
                _frameCameraOnAnchor(numericId, restoreToken)
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
    // Compose the caller's restore signal with a 30s deadline so a hung
    // runSearch cannot block URL restore forever. The restore signal aborts
    // when a newer applyUrlState supersedes this restore.
    const searchSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)])
    // True only when the 30s deadline fired. A caller supersession aborts
    // `signal` (not the deadline) and must stay silent below.
    let restoreTimedOut = false
    let rejectDeadline: ((reason: unknown) => void) | undefined
    const onSearchAbort = (): void => {
        restoreTimedOut = !signal.aborted
        rejectDeadline?.(
            searchSignal.reason instanceof Error
                ? searchSignal.reason
                : new DOMException('URL search restore timed out', 'TimeoutError')
        )
    }
    searchSignal.addEventListener('abort', onSearchAbort)
    const restoreDeadline = new Promise<never>((_, reject) => {
        rejectDeadline = reject
    })
    let releaseSearch: () => void = () => {}

    try {
        const domForcedFocusSearchSurface = isDomForcedFocusSearchSurface()

        // W54: raise mobile search sheet for the deep-link / URL-restore path
        // (/?q=coffee). dispatchSearch handles the typed-input path
        // (search-dispatch.ts); this handles the URL-param path that goes
        // through applyUrlState -> _restoreSearchFromParams -> runSearch
        // without ever calling dispatchSearch. Without this, mobile users
        // who land on ?q=coffee see a blank hero (panelSurface='focus-search'
        // but data-mobile-search-sheet='' -> .search-results-wrapper display:none).
        if (isCompactSearchViewport() && !document.body.dataset.mobileSearchSheet) {
            setMobileSearchSheetMode('peek')
        }

        // If the same query is already in flight from the typed-input path,
        // piggyback on it instead of issuing a duplicate API request. Do NOT
        // return early here: the anchor resolution below (SEARCH_FOCUS_REQUESTED
        // re-fire, constellation rebuild, camera frame) must still run once the
        // in-flight search settles, or shared links like ?q=coffee&anchor=519
        // silently fail to focus when the typed-input path is mid-flight.
        const { isNew, release } = startSearch(query)
        releaseSearch = release
        if (isNew) {
            // Race runSearch against the restore deadline. runSearch swallows
            // AbortError internally (silent return, leaving status 'searching'), so
            // the await alone cannot distinguish a deadline hit from a normal
            // settle. The deadline reject below is the source of truth for a
            // timeout; the post-await searchSignal.aborted check covers the shape
            // where runSearch settles instead of the deadline losing the race.
            await Promise.race([runSearch(query, searchSignal), restoreDeadline])

            if (searchSignal.aborted && !signal.aborted) {
                // runSearch swallowed the deadline abort and resolved normally.
                restoreTimedOut = true
            }
        } else {
            // In-flight search from the typed-input path: wait for it to settle
            // (results/error/idle) so the anchor resolution below sees populated
            // results, then continue. If the restore deadline expires first, bail
            // like the fresh-search path does.
            try {
                await Promise.race([restoreDeadline, waitForSearchSettle(searchStore)])
            } catch {
                // A caller supersession (newer applyUrlState / popstate / re-init)
                // aborts `signal`, not the deadline — onSearchAbort already set
                // restoreTimedOut=false; this catch must NOT clobber it back to
                // true or a legitimately-running piggybacked search gets a spurious
                // error card (contract: supersession stays silent).
                if (signal.aborted) return
                restoreTimedOut = true
            }
        }

        if (restoreTimedOut) {
            // The 30s restore deadline expired without results. Never leave the
            // global search state stuck at 'searching' forever: settle through
            // the established search-error path (the same one a failed API
            // search uses), then bail BEFORE the post-restore writes below
            // (DOM input value, SEARCH_FOCUS_REQUESTED, pocket rebuild) so the
            // restore never continues as if results were restored.
            //
            // Guard: if runSearch already settled to results/error/idle before
            // the deadline fired (a near-miss where results landed at 29.9s),
            // do NOT clobber that state with a timeout error.
            if (searchStore().status === 'searching') {
                setSearchError(
                    query,
                    searchSignal.reason ?? new DOMException('Search restore timed out', 'TimeoutError'),
                    'full'
                )
            }
            return
        }

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
                _frameCameraOnAnchor(rebuildIndex, restoreToken)
            } catch (e) {
                debugWarn('[url-state] applyLocalNeighborhoodFocus re-build failed after search restore', e)
            }
        }

        preserveDomForcedFocusSearchSurface()
    } catch (err) {
        // A newer applyUrlState superseded this restore: the caller signal
        // aborted (and the token was bumped). Stay silent — the newer restore
        // drives state. This preserves the intentional cancellation semantics:
        // a supersession abort must NOT surface as a search error.
        if (signal.aborted) return
        // The 30s restore deadline expired. Same settle-as-error handling as
        // the post-await path above (this branch covers runSearch rejecting
        // with the deadline reason instead of resolving).
        if (restoreTimedOut) {
            if (searchStore().status === 'searching') {
                setSearchError(query, searchSignal.reason ?? new Error('Search restore timed out'), 'full')
            }
            return
        }
        debugWarn('[url-state] Search restore from URL failed:', err)
    } finally {
        // Release only the URL-restore owner. A piggybacking restore receives
        // a no-op release, while an older restore cannot clear a newer query.
        releaseSearch()
        searchSignal.removeEventListener('abort', onSearchAbort)
    }
}
