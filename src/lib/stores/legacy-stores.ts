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


export const activeFiltersStore: Writable<ActiveFilters> = writable({
    status: 'all',
    city: 'all',
    website: false,
    email: false,
    geocoded: false
})

export const activeClusterFilterStore: Writable<number | null> = writable(null)



