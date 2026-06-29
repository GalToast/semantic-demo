/**
 * @lib/ui/use-search-summary.svelte.ts — composable for currentSearchSummary reads
 *
 * `appState.searchState.currentSearchSummary` is the project's #1 coupling
 * point — 67 access sites across 15+ files. The single biggest consumer is
 * src/lib/engine/map-state.ts with 20 reads of `anchorIndex`, `topIndex`,
 * `resultIndices`, and truthy checks of the summary itself. Each reader
 * used to write `appState.searchState.currentSearchSummary?.X ?? Y` inline,
 * duplicating the same fallback pattern.
 *
 * Extracted into a single reactive bundle. Consumers read properties
 * directly:
 *
 *   const search = useSearchSummary()
 *   if (search.summary) { ... }
 *   const anchor = search.anchorIndex ?? -1
 *
 * The composable owns the fallbacks (`null` for indices, `[]` for arrays,
 * `null` for the whole summary when not set). Consumers no longer write
 * `?? null` / `?? []` themselves.
 *
 * Naming note: the interface is `SearchSummaryView` (not `SearchSummary`)
 * to avoid colliding with the existing `SearchSummary` interface in
 * src/lib/state/state-types.ts which describes the schema.
 *
 * Decomp risk: getters must be read directly (not destructured) to keep
 * reactivity:
 *
 *   const { anchorIndex } = useSearchSummary()   // ❌ loses reactivity
 *   const search = useSearchSummary()             // ✅ reactive via getters
 */

import { appState } from '@lib/state/app.svelte'
import type { SearchSummary } from '@lib/state/state-types'

export interface SearchSummaryView {
    /** Full summary object, or null when no search has run yet. */
    readonly summary: SearchSummary | null
    /** Anchor point index from the latest search, or null. */
    readonly anchorIndex: number | null
    /** Top-scored result index, or null. */
    readonly topIndex: number | null
    /** Read-only list of result point indices. Always an array (empty when no search). */
    readonly resultIndices: readonly number[]
}

/**
 * Returns the current search summary view. Each property is a getter that
 * re-fires when appState.searchState.currentSearchSummary changes.
 *
 * The returned object is fresh per call. Each call site gets its own
 * dependency tracking, so updates fire once per consumer.
 *
 * Fallbacks:
 *   - summary:         null (no search has run)
 *   - anchorIndex:     null
 *   - topIndex:        null
 *   - resultIndices:   [] (callers can spread/iterate safely)
 */
export function useSearchSummary(): SearchSummaryView {
    return {
        get summary(): SearchSummary | null {
            return appState.searchState.currentSearchSummary
        },
        get anchorIndex(): number | null {
            return appState.searchState.currentSearchSummary?.anchorIndex ?? null
        },
        get topIndex(): number | null {
            return appState.searchState.currentSearchSummary?.topIndex ?? null
        },
        get resultIndices(): readonly number[] {
            return appState.searchState.currentSearchSummary?.resultIndices ?? []
        }
    }
}