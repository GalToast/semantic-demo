/**
 * @lib/ui/use-panel-cleanup.svelte.ts — reactive panel cleanup
 *
 * App.svelte owned an imperative $effect that closed the legend when
 * entering search/trail/focus/inside/map surfaces — 20 lines of
 * nav reads + store writes that didn't belong in the top-level
 * component. Extracted so:
 *   - App.svelte delegates cleanup instead of owning the effect
 *   - The predicate is co-located with surface composition (single source for “which surfaces hide legend”)
 *   - Future panel stacking rules can be added without growing App.svelte
 *
 * Usage:
 *   usePanelCleanup()
 *   // — no return, just installs the effect in the caller's context.
 *
 * Note: reads nav state via useNavState() + appState.view for map check,
 * and legendOpen via the Svelte store rune (get/set).
 */

import { get } from 'svelte/store'

import { useNavState } from '@lib/ui/use-nav-state.svelte'
import { legendOpen, setLegendOpen } from '@lib/stores/legend.svelte'

export function usePanelCleanup(): void {
    const nav = useNavState()

    $effect(() => {
        const navSurface = nav.surface
        const mode = nav.mode

        // Close legend when entering search, trail, focus, inside, or map modes
        // The legend is only relevant in idle/overview and info-panel states
        if (
            navSurface === 'search' ||
            navSurface === 'focus-search' ||
            mode === 'trail' ||
            mode === 'focus' ||
            mode === 'inside' ||
            nav.view === 'map'
        ) {
            if (get(legendOpen)) {
                setLegendOpen(false)
            }
        }
    })
}
