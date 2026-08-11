/**
 * @lib/stores/search-glows.ts — Glow/highlight setters extracted from search.svelte.ts (S-2)
 */
import { appState } from '@lib/state/app.svelte'
import type { SearchStoreState } from './search.svelte'
import { withSearchNotify } from './search.svelte'

export function setGlowIndices(indices: Set<number>): void {
    withSearchNotify(() => {
        appState.searchState.searchGlowIndices = indices
    })
}

export function setGlowActive(active: boolean): void {
    withSearchNotify(() => {
        appState.searchState.searchGlowActive = active
    })
}

export function setSearchGlow(indices: readonly number[], topIndex: number | null = indices[0] ?? null): void {
    withSearchNotify(() => {
        appState.searchState.searchGlowIndices = new Set(indices)
        appState.searchState.searchGlowTopIndex = topIndex
        appState.searchState.searchGlowActive = indices.length > 0
    })
}

export function clearSearchGlow(): void {
    withSearchNotify(() => {
        appState.searchState.searchGlowIndices = new Set()
        appState.searchState.searchGlowTopIndex = null
        appState.searchState.searchGlowActive = false
    })
}
