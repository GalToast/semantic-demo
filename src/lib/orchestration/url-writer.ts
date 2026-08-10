import { isCompactSearchViewport } from '@lib/utils/ui-presentation'
import { startSearch } from '@lib/search/search-abort' /**
 * @lib/orchestration/url-writer.ts — URL state writer
 *
 * Serializes application state into URL search params and writes them
 * via history pushState/replaceState. Owns the write-side of the URL
 * state sync contract; the read/restore side lives in url-restore.ts.
 *
 * Extracted from url-state.ts (Phase 8 split, 2026-08-09).
 */

import { get } from 'svelte/store'
import { navStore, writeNavStateMirror } from '@lib/stores/navigation.svelte.ts'
import type { NavState } from '@lib/types/state'

/**
 * NavState extended with the legacy `activeStoryPrompt` field that lives in
 * the runtime state object but is not (yet) declared in the canonical
 * NavState interface in types/state.ts.  Remove this augmentation once the
 * upstream type is updated.
 */
type NavStateWithStory = NavState & { activeStoryPrompt?: string | null }
import { debugWarn } from '@lib/utils/debug'
import { clearSearch } from '@lib/stores/search.svelte'
import { appState } from '@lib/state/app.svelte'
import { setFocusedNode } from '@lib/journey/thread-settler'
import { updateSelectedBusiness } from '@lib/journey/selected-card'
import { getFilterState } from '@lib/stores/filter.svelte'
import { getSearchParams, getLocationPathname, isDomForcedFocusSearchSurface } from '@lib/orchestration/url-params'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpdateUrlStateOptions {
    /** 'push' creates a new history entry; 'replace' modifies the current one. */
    mode?: 'push' | 'replace'
    /** Reason for the update (for debugging). */
    reason?: string
    /** Force update even when applyingUrlState is true. */
    force?: boolean
    /** Keep record/anchor params while an initial deep-link restore is settling. */
    preserveDeepLinkParams?: boolean
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
    setFocusedNode(null)
    appState.trailIndices?.clear?.()
    updateSelectedBusiness(null)
    // Note: the prior line `appState.selectedPoint = null`
    // (and `appState.currentSearchSummary = null`) was deleted.
    // It was a no-op at runtime (the flat `selectedPoint` slot does
    // not exist on the Svelte 5 class instance, only `focusState` does),
    // and it threw "Cannot set property selectedPoint of #<Object>
    // which has only a getter" in the url-state mock harness because
    // the mock defines a getter-only accessor for the flat path.
    //
    // Compatibility reads via the test-bridge proxy (Playwright
    // surface tests, journey contract tests) are now satisfied by
    // a fallback in src/main.ts:182 getCompatValue(): if the flat
    // `appState[prop]` is undefined, the getter falls back to
    // `appState.focusState[prop]` for selectedPoint-family fields
    // and `appState.searchState[prop]` for currentSearchSummary.
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
}

// ── URL Writer ────────────────────────────────────────────────────────────────

/**
 * Resolve once the search store leaves the in-flight 'searching' status
 * (settles to results/empty/error). Used by the piggyback path in
 * _restoreSearchFromParams: when a same-query search is already in flight
 * from the typed-input path, we wait for it to settle before running the
 * anchor-resolution writes, instead of returning early and dropping the
 * deep-link anchor focus (W71 shared-link fix). Polls the store every 100ms;
 * never rejects (the caller applies its own restore deadline).
 */
export async function waitForSearchSettle(store: () => { status: string }, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const status = store().status
        if (status !== 'searching' && status !== 'focusing') return
        // eslint-disable-next-line no-restricted-syntax -- bounded poll loop; timer is awaited, never leaked
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
}

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

    // Surface (nav mode) — encode so reload/F5 restores the same mode.
    // Default surface 'idle' is omitted for clean overview URLs.
    if ($nav.surface && $nav.surface !== 'idle') params.set('surface', $nav.surface)
    else params.delete('surface')

    // Deep-link entry params (record, anchor) must NOT persist across mode
    // switches: leaving them in the URL causes popstate→applyUrlState to
    // re-enter focus mode and revert the switch (mode-lock bug). An active
    // applyUrlState restore opts into preserving them until the initial
    // deep-link has settled so the resulting URL remains shareable.
    if (!options.preserveDeepLinkParams) {
        params.delete('record')
        params.delete('anchor')
    }

    // Anchor (focused business index) — re-encode from navStore after the
    // preserveDeepLinkParams block may have deleted it. Only persists when
    // a business is actually focused, so mode-switching away clears it.
    if ($nav.focusedIndex != null) params.set('anchor', String($nav.focusedIndex))

    // Filters (status, city, website, email, geocoded) — encode so shared
    // links and reloads restore the same filtered view (mirror of
    // restoreActiveFiltersFromUrl in filter.svelte.ts). Omitted when
    // all-default for clean overview URLs, matching the depth/story/surface
    // delete-when-default pattern. Boolean flags encode as '1' so the
    // restore side's '1'/'true' parsing round-trips losslessly.
    const filters = getFilterState()
    if (filters.status !== 'all') params.set('status', filters.status)
    else params.delete('status')
    // city='' is the default; the legacy 'all' sentinel is normalized to ''
    // by toggleFilter/overwriteActiveFilters and by the restore side, so it
    // is never encoded as an active filter.
    if (filters.city && filters.city !== 'all') params.set('city', filters.city)
    else params.delete('city')
    if (filters.website) params.set('website', '1')
    else params.delete('website')
    if (filters.email) params.set('email', '1')
    else params.delete('email')
    if (filters.geocoded) params.set('geocoded', '1')
    else params.delete('geocoded')

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
