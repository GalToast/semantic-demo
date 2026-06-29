/**
 * @lib/ui/use-nav-state.svelte.ts — composable for navState surface reads
 *
 * App.svelte owned 4 separate $derived reads of appState.navState fields:
 *   let navSurface     = $derived(appState.navState.surface ?? 'idle')
 *   let navMode        = $derived(appState.navState.mode ?? 'overview')
 *   let navView        = $derived(appState.navState.currentView ?? 'galaxy')
 *   let navFocusedIndex = $derived(appState.navState.focusedIndex ?? null)
 *
 * Each was a leaky abstraction: consumers had to know the navState shape
 * AND the fallback defaults. Extracted into a single reactive bundle.
 *
 * This composable only owns the **raw nav reads with their defaults**.
 * Surface composition (mapModeActive, searchSurfaceActive, focusActive,
 * etc.) stays in App.svelte because it composes both nav + parity attrs
 * and template-local logic — moving it would couple this composable to
 * parity-attrs for no win.
 *
 * Naming note: the interface is `NavStateSnapshot` (not `NavState`) to
 * avoid colliding with the existing `NavState` interface in
 * src/lib/state/state-types.ts which describes the full navState shape.
 *
 * Usage:
 *   const nav = useNavState()
 *   $effect(() => console.log(nav.mode))
 *   {#if nav.mode === 'focus'} ... {/if}
 *
 * Decomp risk: getters must be read directly (not destructured) to keep
 * reactivity:
 *
 *   const { mode } = useNavState()    // ❌ loses reactivity
 *   const nav = useNavState()          // ✅ reactive via getters
 */

import { appState } from '@lib/state/app.svelte'

export interface NavStateSnapshot {
    /** Current surface id (idle/search/focus-search/focus/etc.) */
    readonly surface: string
    /** Current navigation mode (overview/focus/inside/trail/etc.) */
    readonly mode: string
    /** Current view name (galaxy/map/etc.) */
    readonly view: string
    /** Currently focused point index, or null when nothing is focused */
    readonly focusedIndex: number | null
}

/**
 * Returns the current nav state snapshot. Each property is a getter that
 * re-fires when the underlying appState.navState field changes.
 *
 * The returned object is fresh per call. Each call site gets its own
 * dependency tracking, so updates fire once per consumer.
 */
export function useNavState(): NavStateSnapshot {
    return {
        get surface(): string {
            return appState.navState.surface ?? 'idle'
        },
        get mode(): string {
            return appState.navState.mode ?? 'overview'
        },
        get view(): string {
            return appState.navState.currentView ?? 'galaxy'
        },
        get focusedIndex(): number | null {
            return appState.navState.focusedIndex ?? null
        }
    }
}
