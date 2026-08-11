import { appState } from '@lib/state/app.svelte.ts'
import { testCompatStore } from './test-compat.svelte'
import type { SearchSummary } from '@lib/types/state'

// ── Derived Getters ──────────────────────────────────────────────────────────

export const searchQuery = () => appState.searchState.currentSearchSummary?.query ?? ''
export const searchStatus = () => appState.searchState.searchStatus
export const searchResults = () => appState.searchState.currentSearchSummary?.resultIndices ?? []
export const hasSearchQuery = () => (appState.searchState.currentSearchSummary?.query ?? '').length > 0
export const hasResults = () => (appState.searchState.currentSearchSummary?.resultIndices?.length ?? 0) > 0
export const isSearching = () => appState.searchState.searchStatus === 'searching'
export const searchSummary = () => appState.searchState.currentSearchSummary
export const activeResult = () =>
    appState.navState.focusedIndex !== null ? String(appState.navState.focusedIndex) : null

/** Returns the current search summary, or null. */
export function getSearchSummary(): SearchSummary | null {
    if (appState.searchState.currentSearchSummary) return appState.searchState.currentSearchSummary as SearchSummary
    const testState = testCompatStore()
    // @ts-expect-error -- testCompatStore returns TestCompatState which lacks searchState; legacy bridge gap (w32-b). Remove when TestCompatState includes a searchState field (ticket W53-L2-followup)
    return (testState?.searchState?.summary as SearchSummary) ?? null
}

// ── Focus-intent bridge (idle↔search-surface remount) ───────────────────────
//
// Typing into #search-input flips the panel surface 'idle'→'search' (parity
// layer), which unmounts the idle <SearchBar> (App.svelte {#if idleSearchVisible})
// and mounts the panel-contained one inside InfoPanel. That remount destroys
// the focused <input>, dropping focus to <body> and swallowing every keystroke
// after the first. This module-scoped flag bridges the two SearchInput
// instances: the dying instance sets it on input; the freshly-mounted instance
// consumes it in onMount and restores focus.
let _searchInputFocusIntent = false

/** Mark that #search-input should reclaim focus after the next mount. */
export function requestSearchInputFocus(): void {
    _searchInputFocusIntent = true
}

/** One-shot: returns true if focus should be restored, then resets the flag. */
export function consumeSearchInputFocusIntent(): boolean {
    const v = _searchInputFocusIntent
    _searchInputFocusIntent = false
    return v
}
