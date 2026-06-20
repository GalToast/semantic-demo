/**
 * legacy-stores.ts
 *
 * Svelte native stores that mirror state.js fields.
 *
 * Ported from js/modules/stores.ts (W15 Wave E).
 */

import { writable } from 'svelte/store'
import type { Writable } from 'svelte/store'
import type { ActiveFilters } from '@lib/state/state-types'

interface CompositionState {
    activeView: string
    trailState: string
    trailDepth: string
    graphContext: string
    mapContext: string
    semanticDive: string
    panelSurface: string
    panelSurfaceDetail: string
    searchGlow: string
    isActive: boolean
}

interface WeatherStateStoreValue {
    weather: Record<string, unknown> | null
    lastFetch: number | null
    fallback: boolean
    stalenessMsg: string
}

interface SemanticGuideState {
    isVisible: boolean
    isSynthesizing: boolean
    config: Record<string, unknown> | null
    typeToken: number
    buttonMode: string
}

export const activeFiltersStore: Writable<ActiveFilters> = writable({
    status: 'all',
    city: 'all',
    website: false,
    email: false,
    geocoded: false
})

export const activeClusterFilterStore: Writable<number | null> = writable(null)

export const searchResultsStore: Writable<Array<Record<string, unknown>>> = writable([])

export const searchSummaryStore: Writable<Record<string, unknown> | null> = writable(null)

export const isSearchingStore: Writable<boolean> = writable(false)

export const searchErrorStore: Writable<unknown | null> = writable(null)

export const searchVisibleCountStore: Writable<number> = writable(5)

export const compositionStore: Writable<CompositionState> = writable({
    activeView: 'galaxy',
    trailState: 'inactive',
    trailDepth: '0',
    graphContext: 'idle',
    mapContext: 'idle',
    semanticDive: 'inactive',
    panelSurface: 'idle',
    panelSurfaceDetail: 'peek',
    searchGlow: 'inactive',
    isActive: false
})

export const weatherStateStore: Writable<WeatherStateStoreValue> = writable({
    weather: null,
    lastFetch: null,
    fallback: false,
    stalenessMsg: ''
})

export const semanticGuideStateStore: Writable<SemanticGuideState> = writable({
    isVisible: false,
    isSynthesizing: false,
    config: null,
    typeToken: 0,
    buttonMode: 'ready'
})
