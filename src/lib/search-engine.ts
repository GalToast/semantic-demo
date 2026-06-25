/**
 * @lib/search-engine.ts — Semantic search orchestrator
 *
 * Public API surface for the search subsystem:
 *   - initSearchEngine(): no-op compatibility hook
 *   - performSearch(query, signal, page, offset): execute a search
 *   - getSearchEngineEmptyStateSuggestions(): top-5 categories for chips
 *   - getSearchEngineDiagnostics(): static-dev fallback status
 *
 * The orchestrator composes four single-responsibility modules:
 *   - semantic-search-types.ts: shared interfaces (RawServiceRow, etc.)
 *   - semantic-search-mapper.ts: Row → SearchResult + pagination math
 *   - mock-search-fallback.ts: static dev data + scoring + env flags
 *   - local-search-index.ts: 8,406-record inverted-index search
 *
 * Each module is pure-TS where possible (no Svelte store mutation, no
 * network), so it can be unit-tested in isolation. The orchestrator owns
 * the cache, dedup, and routing logic.
 */

import type { SearchResult } from '@lib/types/state'
import { rerankResults } from '@lib/utils/rerank'
import { searchUseRerank } from '@lib/stores/search.svelte'
import { get } from 'svelte/store'
import { shouldLogStaticDevFallback } from '@lib/utils/ui-presentation'
import { debugWarn } from '@lib/utils/diagnostic-adapter'
import {
    getCachedSearch,
    setCachedSearch,
    getPendingSearch,
    setPendingSearch
} from '@lib/search-cache'

import {
    PAGE_SIZE,
    normalizeSearchPage,
    normalizeSearchOffset,
    normalizeSearchLimit,
    mapServiceRow,
    getPayloadResults
} from '@lib/search/semantic-search-mapper'
import type { RawServiceRow, SemanticSearchPayload } from '@lib/search/semantic-search-types'
import {
    performMockSearch,
    canUseStaticDevFallback,
    shouldSurfaceApiFailures,
    shouldBypassApiSearch
} from '@lib/search/mock-search-fallback'
import {
    performLocalIndexSearch,
    localHitsToResults,
    getSearchEngineEmptyStateSuggestions,
    shouldPreferLiveSearch
} from '@lib/search/local-search-index'

// Re-export the empty-state helper so its existing import path is preserved.
export { getSearchEngineEmptyStateSuggestions }

// ── Rerank Gate ──────────────────────────────────────────────────────────────

/**
 * Determine whether the rerank step should run.
 * Priority: URL param > localStorage > store flag > default (off).
 */
function shouldApplyRerank(): boolean {
    try {
        // 1. URL param ?rerank=1 → force-on for QA
        if (typeof window !== 'undefined' && window.location) {
            const params = new URLSearchParams(window.location.search || '')
            if (params.get('rerank') === '1') return true
        }
        // 2. localStorage power-user opt-in
        if (typeof localStorage !== 'undefined' && localStorage.getItem('semantic_explorer_rerank_v1') === '1') {
            return true
        }
        // 3. Store flag (A/B test toggle, default false)
        return get(searchUseRerank)
    } catch {
        return false
    }
}

// ── Direct API fetch ─────────────────────────────────────────────────────────

async function fetchSemanticSearchResultsDirect(
    query: string,
    signal?: AbortSignal,
    timeoutMs = 8000,
    offset = 0,
    limit = 18
): Promise<SearchResult[]> {
    if (shouldBypassApiSearch()) {
        throw new Error('API search bypassed by staticOnly/offline mode.')
    }
    const safeOffset = Math.max(0, Math.floor(offset))
    const safeLimit = normalizeSearchLimit(limit)
    const controller = new AbortController()
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
        timedOut = true
        controller.abort()
    }, timeoutMs)
    const onAbort = (): void => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
        const response = await fetch(
            `/api.php?action=semantic_search&q=${encodeURIComponent(query)}&limit=${safeLimit}&offset=${safeOffset}`,
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: controller.signal
            }
        )

        if (!response.ok) {
            throw new Error(`Semantic search returned HTTP status ${response.status}`)
        }

        const responseText = await response.text()
        const trimmedText = responseText.trim()
        if (trimmedText.startsWith('<?php') || (trimmedText.includes('<?php') && trimmedText.indexOf('<?php') < 100)) {
            throw new Error('Semantic search returned raw PHP source.')
        }

        let payload: SemanticSearchPayload
        try {
            payload = JSON.parse(responseText) as SemanticSearchPayload
        } catch (jsonErr) {
            throw new Error('Semantic search returned invalid JSON.', { cause: jsonErr })
        }

        if (!payload?.ok) {
            throw new Error(payload?.error || 'Semantic search is unavailable right now.')
        }

        const rawRows = getPayloadResults(payload)
        return rawRows
            .map((row: RawServiceRow, idx: number) => mapServiceRow(row, idx))
            .filter((r): r is SearchResult => r !== null)
            .slice(0, safeLimit)
    } catch (err) {
        if (canUseStaticDevFallback()) {
            try {
                window.sessionStorage.setItem('api_unreachable', '1')
            } catch (error) {
                debugWarn('[search-engine] sessionStorage read/write blocked:', error)
            }
        }
        if (timedOut && err instanceof DOMException && err.name === 'AbortError') {
            throw new Error(`Semantic search timed out after ${timeoutMs}ms.`, { cause: err })
        }
        throw err
    } finally {
        window.clearTimeout(timeoutId)
        signal?.removeEventListener('abort', onAbort)
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the search engine.
 * Kept as a no-op compatibility hook for callers that previously warmed the
 * legacy search cache.
 */
export async function initSearchEngine(): Promise<void> {
    void 0
}

/**
 * Execute a semantic search against the business corpus.
 *
 * Tries the real API first. If the API is unavailable (404, raw PHP source,
 * network error — common when running against a static Python http.server
 * without a PHP backend), falls back to local deterministic mock results.
 *
 * @param query   The raw search query string.
 * @param signal  AbortSignal for cancellation.
 * @returns A promise resolving to a ranked array of SearchResult objects.
 */
export async function performSearch(query: string, signal: AbortSignal, page = 0, offset = 0): Promise<SearchResult[]> {
    const trimmed = query.trim()

    if (trimmed.length < 2) {
        return []
    }

    const normalizedPage = normalizeSearchPage(page)
    const effectiveOffset = normalizeSearchOffset(normalizedPage, offset)
    const forceApiFailureSurface = shouldSurfaceApiFailures()

    // ── Cache check ──────────────────────────────────────────────────────────
    // Cache key is composite: {query, page, offset}.  This prevents page 2
    // from overwriting page 1 in the cache, and keeps pagination isolated.
    if (!forceApiFailureSurface) {
        const cached = getCachedSearch(trimmed, normalizedPage, effectiveOffset)
        if (cached) return cached
    }

    // Advisory deduplication: if an identical key is already in-flight,
    // piggyback on that promise instead of issuing a duplicate fetch.
    if (!forceApiFailureSurface) {
        const pending = getPendingSearch(trimmed, normalizedPage, effectiveOffset)
        if (pending) return pending
    }

    const searchPromise = _executeSearch(trimmed, signal, normalizedPage, effectiveOffset)
    setPendingSearch(trimmed, normalizedPage, effectiveOffset, searchPromise)
    return searchPromise
}

/** Internal search execution — called through the cache/dedup wrapper. */
async function _executeSearch(
    trimmed: string,
    signal: AbortSignal,
    page: number,
    offset: number
): Promise<SearchResult[]> {
    const preferLive = shouldPreferLiveSearch()
    const staticDevFallbackAllowed = canUseStaticDevFallback()
    if (import.meta.env.DEV)
        console.debug('DEBUG - canUseStaticDevFallback():', staticDevFallbackAllowed, 'search:', window.location.search)
    let results: SearchResult[] = []
    const limit = normalizeSearchLimit(PAGE_SIZE)

    // When `staticDev=0` is present, surface API failures instead of silently
    // replacing them with local mock/index results. Contract tests use this to
    // force `.search-error-state` on the production preview shell.
    if (!staticDevFallbackAllowed) {
        try {
            const apiResults = await fetchSemanticSearchResultsDirect(trimmed, signal, 8000, offset, limit)
            if (apiResults && apiResults.length > 0) {
                results = apiResults
            } else {
                throw new Error('Semantic search returned no results from the live API.')
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                throw err
            }
            throw err
        }
    } else {
        // Try the live API first. If `VITE_USE_LIVE_SEARCH` is enabled, the API
        // is the source of truth and any non-OK response throws so we can fall
        // through to the local index below.
        if (preferLive) {
            try {
                results = await fetchSemanticSearchResultsDirect(trimmed, signal, 8000, offset, limit)
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    throw err
                }
                if (shouldLogStaticDevFallback()) {
                    if (import.meta.env.DEV)
                        console.warn(
                            '[search-engine] Live search failed, falling back to local index for:',
                            trimmed,
                            err
                        )
                }
            }
        } else {
            // Dev / static-dev path: still attempt the API for parity, but on any
            // error (502, raw PHP, network) skip directly to the local index.
            try {
                const apiTimeoutMs = canUseStaticDevFallback() ? 1200 : 8000
                const apiResults = await fetchSemanticSearchResultsDirect(trimmed, signal, apiTimeoutMs, offset, limit)
                if (apiResults && apiResults.length > 0) {
                    results = apiResults
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    throw err
                }
                if (canUseStaticDevFallback() && shouldLogStaticDevFallback()) {
                    if (import.meta.env.DEV)
                        console.warn(
                            '[search-engine] API unavailable on static dev, using local index for:',
                            trimmed,
                            err
                        )
                }
            }
        }

        // Local index fallback
        if (results.length === 0) {
            const localHits = performLocalIndexSearch(trimmed, offset, limit)
            if (localHits && localHits.length > 0) {
                results = localHitsToResults(localHits)
            }
        }

        // Mock fallback (last resort — only the static-dev path uses this)
        if (results.length === 0 && canUseStaticDevFallback()) {
            results = await performMockSearch(trimmed, signal, offset, limit)
        }

        // Optional rerank
        if (results.length > 0 && shouldApplyRerank()) {
            try {
                results = await rerankResults(trimmed, results)
            } catch (err) {
                debugWarn('[search-engine] rerank step failed; returning unreranked results:', err)
            }
        }
    }

    // Cache normal results so subsequent requests for the same key are instant.
    // Forced API-failure surfaces must not reuse or poison the normal cache.
    if (!shouldSurfaceApiFailures()) {
        setCachedSearch(trimmed, page, offset, results)
    }
    return results
}

/**
 * Get diagnostic info about the search engine state.
 */
export function getSearchEngineDiagnostics(): {
    canUseStaticDevFallback: boolean
} {
    return {
        canUseStaticDevFallback: canUseStaticDevFallback()
    }
}