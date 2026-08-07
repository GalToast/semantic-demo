/**
 * @lib/stores/filter.svelte.ts — Filter state store (Svelte 5 Runes)
 *
 * Replaces and the filter slice from state.js.
 * Manages status, city, and contact-feature filters for the business network.
 * Canonical owner for filter ↔ state sync.
 *
 * Migration status:
 *   - filterVersion / filterColorVersion: kept as createStateMirror
 *     (single-field counter mirrors — factory handles writable + mirror).
 *   - activeClusterFilter: migrated to $state class with set action.
 *   - filterState: migrated to $state class with update/set actions.
 *   - Derived stores: migrated to $state-backed DerivedFilterStore instances.
 */
import { type Readable } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { createStateMirror } from '@lib/state/create-state-mirror'
import type { ActiveFilters } from '@lib/types/state'

// ── Constants ────────────────────────────────────────────────────────

const INITIAL_FILTERS: ActiveFilters = {
    status: 'all',
    city: '',
    website: false,
    email: false,
    geocoded: false
}

// ── Core State Class ─────────────────────────────────────────────────

class FilterState {
    status = $state<string>('all')
    city = $state<string>('')
    website = $state<boolean>(false)
    email = $state<boolean>(false)
    geocoded = $state<boolean>(false)

    private subscribers = new Set<(_v: ActiveFilters) => void>()

    getSnapshot(): ActiveFilters {
        return {
            status: this.status,
            city: this.city,
            website: this.website,
            email: this.email,
            geocoded: this.geocoded
        }
    }

    subscribe(run: (_v: ActiveFilters) => void): () => void {
        this.subscribers.add(run)
        run(this.getSnapshot())
        return () => {
            this.subscribers.delete(run)
        }
    }

    set(value: ActiveFilters): void {
        this.status = value.status
        this.city = value.city
        this.website = value.website
        this.email = value.email
        this.geocoded = value.geocoded
        this.notify()
    }

    update(fn: (_s: ActiveFilters) => ActiveFilters): void {
        this.set(fn(this.getSnapshot()))
    }

    private notify(): void {
        const snap = this.getSnapshot()
        for (const run of this.subscribers) {
            run(snap)
        }
    }
}

const _filterState = new FilterState()

// ── Active Cluster Filter State ──────────────────────────────────────

class ActiveClusterFilterState {
    value = $state<string | null>(appState.activeClusterFilter !== null ? String(appState.activeClusterFilter) : null)

    private subscribers = new Set<(_v: string | null) => void>()

    subscribe(run: (_v: string | null) => void): () => void {
        this.subscribers.add(run)
        run(this.value)
        return () => {
            this.subscribers.delete(run)
        }
    }

    set(value: string | null): void {
        this.value = value
        appState.activeClusterFilter = value !== null ? Number(value) : null
        this.notify()
    }

    private notify(): void {
        for (const run of this.subscribers) {
            run(this.value)
        }
    }
}

const _activeClusterFilter = new ActiveClusterFilterState()

// ── Derived Store Helper ─────────────────────────────────────────────

class DerivedFilterStore<T> {
    private subscribers = new Set<(_v: T) => void>()
    private unsubBase: (() => void) | null = null

    constructor(private compute: () => T) {
        this.unsubBase = _filterState.subscribe(() => this._notify())
    }

    subscribe(run: (_v: T) => void): () => void {
        this.subscribers.add(run)
        run(this.compute())
        return () => {
            this.subscribers.delete(run)
            if (this.subscribers.size === 0) {
                this.unsubBase?.()
                this.unsubBase = null
            }
        }
    }

    private _notify(): void {
        const val = this.compute()
        for (const run of this.subscribers) {
            run(val)
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────

/** Version counter — incremented on every filter change. */
export const filterVersion = createStateMirror<number>({
    computeFromAppState: () => appState.filterVersion,
    bindings: { filterVersion: 'filterVersion' },
    storageKey: '__SEMANTIC_EXPLORER_FILTER_VERSION__'
})

/** Color recompute version — incremented when cluster colors should recalc. */
export const filterColorVersion = createStateMirror<number>({
    computeFromAppState: () => appState.filterColorVersion,
    bindings: { filterColorVersion: 'filterColorVersion' },
    storageKey: '__SEMANTIC_EXPLORER_FILTER_COLOR_VERSION__'
})

/** Active cluster filter (null = show all clusters). */
export const activeClusterFilter: Readable<string | null> & { set(_value: string | null): void } = {
    subscribe: (run) => _activeClusterFilter.subscribe(run),
    set: (value: string | null) => _activeClusterFilter.set(value)
}

/** Alias for compatibility with legacy SearchResultsList. */
export const activeClusterFilterStore = activeClusterFilter

/** Active filters — the single source of truth for filter state. */
export const filterState: Readable<ActiveFilters> & {
    update(_fn: (_s: ActiveFilters) => ActiveFilters): void
    set(_value: ActiveFilters): void
} = {
    subscribe: (run) => _filterState.subscribe(run),
    update: (updater: (_s: ActiveFilters) => ActiveFilters) => {
        const next = updater(_filterState.getSnapshot())
        const cloned = { ...next }
        _filterState.set(cloned)
        appState.activeFilters = { ...cloned }
    },
    set: (value: ActiveFilters) => {
        const cloned = { ...value }
        _filterState.set(cloned)
        appState.activeFilters = { ...cloned }
    }
}

// ── Derived Convenience Stores ─────────────────────────────────────────

/** True if any filter is active (non-default). */
export const hasActiveFilters: Readable<boolean> = new DerivedFilterStore(
    () =>
        !(_filterState.status === 'all') ||
        !(_filterState.city === '') ||
        _filterState.website ||
        _filterState.email ||
        _filterState.geocoded
)

/** Number of individually active filters. */
export const activeFilterCount: Readable<number> = new DerivedFilterStore(() => {
    let count = 0
    const isAll = _filterState.status === 'all'
    const isEmpty = _filterState.city === ''
    if (!isAll) count++
    if (!isEmpty) count++
    if (_filterState.website) count++
    if (_filterState.email) count++
    if (_filterState.geocoded) count++
    return count
})

/** The current status filter value. */
export const statusFilter: Readable<string> = new DerivedFilterStore(() => _filterState.status)

/** The current city filter value. */
export const cityFilter: Readable<string> = new DerivedFilterStore(() => _filterState.city)

/** Contact-related filter flags as a derived object. */
export const contactFilters: Readable<{ website: boolean; email: boolean; geocoded: boolean }> = new DerivedFilterStore(
    () => ({
        website: _filterState.website,
        email: _filterState.email,
        geocoded: _filterState.geocoded
    })
)

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Toggle a filter value.
 *
 * - For `status`: cycles through 'all' -> value -> 'all' (radio-style).
 * - For `website`, `email`, `geocoded`: boolean toggle.
 * - For `city`: sets the city string (pass empty string to clear).
 */
export function toggleFilter(_type: 'status', _value: string): void
export function toggleFilter(_type: 'website' | 'email' | 'geocoded', _value: boolean): void
export function toggleFilter(_type: 'city', _value: string): void
export function toggleFilter(type: keyof ActiveFilters, value: string | boolean): void {
    filterState.update((current) => {
        const next = { ...current }
        switch (type) {
            case 'status': {
                next.status = next.status === value ? 'all' : (value as string)
                break
            }
            case 'city': {
                // Normalize 'all' sentinel from legacy to '' so city='all' is not counted active.
                next.city = value === 'all' ? '' : (value as string)
                break
            }
            case 'website':
                next.website = value as boolean
                break
            case 'email':
                next.email = value as boolean
                break
            case 'geocoded':
                next.geocoded = value as boolean
                break
        }
        return next
    })

    // Bump versions
    filterVersion.update((v) => v + 1)
    filterColorVersion.update((v) => v + 1)
}

/**
 * Overwrite all filters at once (from legacy filter-state.js).
 * Bumps versions and syncs body attribute.
 */
export function overwriteActiveFilters(filters: ActiveFilters): void {
    // Normalize 'all' sentinel from legacy to '' so city='all' is not counted active.
    filterState.set({
        status: filters.status,
        city: filters.city === 'all' ? '' : filters.city,
        website: filters.website,
        email: filters.email,
        geocoded: filters.geocoded
    })
    filterVersion.update((v) => v + 1)
    filterColorVersion.update((v) => v + 1)
}

/** Set a single filter field without toggle semantics. */
export function setFilter<K extends keyof ActiveFilters>(type: K, value: ActiveFilters[K]): void {
    filterState.update((current) => ({ ...current, [type]: value }))
    incrementFilterVersion()
    bumpFilterColorVersion()
}

/** Increment the public filter version counter. */
export function incrementFilterVersion(): number {
    let next = 0
    filterVersion.update((v) => {
        next = v + 1
        return next
    })
    return next
}

/** Increment the public filter color version counter. */
export function bumpFilterColorVersion(): number {
    let next = 0
    filterColorVersion.update((v) => {
        next = v + 1
        return next
    })
    return next
}

/** Set the active cluster filter. */
export function setClusterFilter(cluster: string | null): void {
    activeClusterFilter.set(cluster)
}

/** Backward-compatible alias used by retired js/modules/filter-state.ts consumers. */
export function setActiveClusterFilter(cluster: string | number | null): void {
    setClusterFilter(cluster === null ? null : String(cluster))
}

/** Reset all filters to their initial (inactive) state. */
export function resetFilters(): void {
    filterState.set({ ...INITIAL_FILTERS })
    activeClusterFilter.set(null)
    filterVersion.update((v) => v + 1)
    filterColorVersion.update((v) => v + 1)
}

/** Synchronous snapshot of the current filter state. */
export function getFilterState(): ActiveFilters {
    return _filterState.getSnapshot()
}

/** Check if a specific point matches the active filters. */
export function pointMatchesActiveFilters(
    point: {
        status?: string
        city?: string
        website?: string | null
        email?: string | null
        geocoded?: boolean
    } | null,
    filters?: ActiveFilters
): boolean {
    if (!point) return false
    const f = filters ?? getFilterState()

    if (f.status !== 'all' && point.status !== f.status) return false
    if (f.city !== '' && normalizeCityForFilter(point.city) !== normalizeCityForFilter(f.city)) return false
    if (f.website && !point.website) return false
    if (f.email && !point.email) return false
    if (f.geocoded && !point.geocoded) return false

    return true
}

/**
 * Normalize a city name for consistent filter comparison.
 * Lowercases, trims, removes trailing " tx" or ", tx" suffixes.
 */
function normalizeCityForFilter(city: string | undefined): string {
    if (!city) return ''
    return city
        .toLowerCase()
        .trim()
        .replace(/,?\s*tx$/, '')
}

/** Backwards-compatible alias for getFilterState. */
export function getActiveFilters(): ActiveFilters {
    return getFilterState()
}

/** Backwards-compatible getter for the active cluster filter. */
export function getActiveClusterFilter(): number | null {
    const value = _activeClusterFilter.value
    const numericValue = value !== null ? Number(value) : null
    return Number.isFinite(numericValue) ? numericValue : null
}

const FILTER_KEYS = new Set<keyof ActiveFilters>(['status', 'city', 'website', 'email', 'geocoded'])

/** Backwards-compatible owner API from retired js/modules/filter-state.ts. */
export function setActiveFilter<K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]): boolean {
    if (!FILTER_KEYS.has(key)) return false
    setFilter(key, value)
    return true
}

/** Backwards-compatible boolean signal toggle from retired js/modules/filter-state.ts. */
export function toggleActiveFilterSignal(key: string): boolean {
    if (key !== 'website' && key !== 'email' && key !== 'geocoded') return false
    const filters = getFilterState()
    setFilter(key, !filters[key])
    return true
}

/** Backwards-compatible reset alias from retired js/modules/filter-state.ts. */
export const resetActiveFilters = resetFilters

/** Restore filters from URL params using the canonical filter store owner. */
export function restoreActiveFiltersFromUrl(params: URLSearchParams): void {
    const status = params.get('status')
    const city = params.get('city')
    const website = params.get('website')
    const email = params.get('email')
    const geocoded = params.get('geocoded')

    if (status) setActiveFilter('status', status)
    if (city !== null) setActiveFilter('city', city === 'all' ? '' : city)
    if (website !== null) setActiveFilter('website', website === '1' || website === 'true')
    if (email !== null) setActiveFilter('email', email === '1' || email === 'true')
    if (geocoded !== null) setActiveFilter('geocoded', geocoded === '1' || geocoded === 'true')

    const cityFilter =
        typeof document !== 'undefined' ? (document.getElementById('city-filter') as HTMLSelectElement | null) : null
    if (cityFilter && city !== null) cityFilter.value = city
}

/** Restore cluster filter from URL params using the canonical filter store owner. */
export function restoreActiveClusterFilterFromUrl(params: URLSearchParams): void {
    const cluster = params.get('cluster')
    setActiveClusterFilter(cluster)
}
