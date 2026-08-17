/**
 * @lib/orchestration/url-restore.ts — URL state restore (orchestrator)
 *
 * Deserializes URL search params and applies them to application state.
 * Owns the read/restore side of the URL state sync contract; the write
 * side lives in url-writer.ts.
 *
 * Deep-link focus helpers live in url-restore-deep-link.ts and search
 * restore in url-restore-search.ts; this file is the thin orchestrator
 * plus the state-reset / surface helpers that own no other module's state.
 *
 * Extracted from url-state.ts (Phase 8 split, 2026-08-09);
 * monolith split shittiest-parts W3, 2026-08-17.
 */

import { get } from 'svelte/store'
import { navStore, bumpUrlStateRestoreToken, writeNavStateMirror } from '@lib/stores/navigation.svelte.ts'
import { setJourneyPhase, journeyStore } from '@lib/stores/journey.svelte'
import type { ViewName } from '@lib/types/state'
import { debugWarn } from '@lib/utils/debug'
import { clearSearch } from '@lib/stores/search.svelte'
import { focusStore, setSemanticDiveMode } from '@lib/stores/focus.svelte'
import { appState } from '@lib/state/app.svelte'
import {
    getSearchParams,
    isDomForcedFocusSearchSurface,
    hasRestorableUrlState,
    getRequestedUrlDepth,
    surfaceParamToNavMode,
    resolveAnchorFromRecordId
} from '@lib/orchestration/url-params'
import { showExperienceToast } from '@lib/orchestration/toast'
import { updateUrlState, clearExplorationFocusSelection } from './url-writer'
import { _restoreAnchorFromParams } from './url-restore-deep-link'
import { _restoreFiltersFromParams, _restoreClusterFilter, _restoreSearchFromParams } from './url-restore-search'
import { isRestoreStale } from './url-restore-state'

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

// ── State Reset ───────────────────────────────────────────────────────────────

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

// Re-export from url-writer so the barrel surface is preserved (lifecycle.ts
// imports this symbol from url-restore; the canonical definition lives in
// url-writer.ts).
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
            const surfacePatch = surfaceParamToNavMode(surfaceParam)
            if (surfacePatch) writeNavStateMirror(surfacePatch)
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
        const { anchorId, notFound } = resolveAnchorFromRecordId(params, appState.points)
        if (notFound !== undefined) {
            debugWarn('[url-state] record', notFound, 'not found in dataset; ignoring')
            showExperienceToast('Listing not found', `Listing ${notFound} isn't available in this dataset.`)
        }

        // Anchor restoration runs whenever ?anchor is present (independent of ?q).
        // Split this out of the search-restoration branch so bare-anchor URLs and
        // search URLs share the same focus path. Numeric and non-numeric anchor
        // ids take different routes; see helpers below.
        if (anchorId) {
            await _restoreAnchorFromParams(anchorId, restoreToken, restoreController.signal)
            // Token-abort: if a newer applyUrlState bumped the token while we
            // were awaiting, our restore is stale. Bail before any further writes.
            if (isRestoreStale(restoreToken)) return
        }

        // Search-query restoration runs only when there's a query to fulfill.
        // It still resolves non-numeric anchors against the search results, but
        // numeric anchors are already settled by `_restoreAnchorFromParams`.
        if (query && query.trim().length >= 2) {
            await _restoreSearchFromParams(query, anchorId, restoreToken, restoreController.signal)
            if (isRestoreStale(restoreToken)) return
        }

        // Anchor/search hydration republishes focus and normally settles on
        // `focus-search`; honor an explicit shared-link request for the
        // deeper semantic-dive surface after those async writes finish.
        restoreExplicitInsideSurface(surfaceParam)
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

// ── Surface helpers ───────────────────────────────────────────────────────────

function restoreExplicitInsideSurface(surfaceParam: string | null): void {
    if (surfaceParam !== 'inside') return

    const current = get(navStore)
    if (current.focusedIndex == null) return

    setJourneyPhase('inside')
    setSemanticDiveMode(true)
    writeNavStateMirror({ mode: 'inside', surface: 'inside', trailDepth: 2 })
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
