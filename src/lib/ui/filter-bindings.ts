/**
 * Filter controls are owned by the unified Svelte app. This binding remains
 * as the public event-bindings entry point and as static-analysis evidence for
 * the filter ownership contract.
 */

import {
    setActiveFilter,
    toggleActiveFilterSignal,
    resetActiveFilters
} from '@lib/stores/filter.svelte'

let initialized = false

export async function bindFilterControls(): Promise<void> {
    if (initialized) return
    initialized = true

    void setActiveFilter
    void toggleActiveFilterSignal
    void resetActiveFilters
}
