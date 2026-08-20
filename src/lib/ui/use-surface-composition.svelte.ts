/**
 * @lib/ui/use-surface-composition.svelte.ts — composable for surface predicates
 *
 * App.svelte owned 13 $derived surface predicates composing parity attrs +
 * nav state + viewport + scene-ready into render gates for the template.
 * Each was a leaky abstraction: template-local logic was scattered across
 * 60+ lines of App.svelte, and the focusActive lockstep with
 * JourneyChrome.svelte's chromeHasFocus required grep-level discipline to
 * keep both in sync (W53: asymmetric widening → silent 30s e2e timeouts).
 *
 * Extracted into a single reactive bundle so:
 *   - App.svelte delegates surface composition instead of owning the predicate block
 *   - JourneyChrome.svelte (and future consumers) can read the same
 *     derived predicates without duplicating logic
 *   - The focusActive lockstep gate stays single-sourced via isFocusSurfaceActive
 *
 * Usage:
 *   const surface = useSurfaceComposition({ getSceneReady: () => s3dSceneReady })
 *   {#if surface.headerVisible} ... {/if}
 *   $effect(() => mapViewLazy.ensure(surface.mapModeActive))
 *
 * Reactivity: $derived values are tied to the caller's component context.
 * The returned object uses getters so template / $effect consumers register
 * dependencies on the underlying Derived instances automatically.
 *
 * Decomp risk: destructuring loses reactivity — read properties via the
 * returned object directly:
 *
 *   const { mapModeActive } = useSurfaceComposition(...)  // ❌ loses reactivity
 *   const surface = useSurfaceComposition(...)            // ✅ reactive via getters
 *
 * Note: $viewport auto-subscription (Svelte 5 store rune) only works in
 * .svelte components; this composable reads appState.viewportState directly
 * (same pattern as useNavState reading appState.navState) to stay
 * .svelte.ts-compatible.
 */

import { appState } from '@lib/state/app.svelte'
import { useNavState } from '@lib/ui/use-nav-state.svelte'
import { useParityAttrs, isFocusSurfaceActive } from '@lib/ui/use-parity-attrs.svelte'

export interface SurfaceComposition {
    renderKind: string
    mapModeActive: boolean
    searchSurfaceActive: boolean
    searchFamilySurfaceActive: boolean
    mapTrailSearchLaneActive: boolean
    idleSurfaceActive: boolean
    focusActive: boolean
    focusStageActive: boolean
    headerVisible: boolean
    controlsVisible: boolean
    infoPanelOpen: boolean
    legacyCompassSurfaceActive: boolean
}

export function useSurfaceComposition(opts: { getSceneReady: () => boolean }): SurfaceComposition {
    const parity = useParityAttrs()
    const nav = useNavState()

    const renderKind = $derived(parity.renderKind)
    const mapModeActive = $derived(nav.view === 'map')
    const searchSurfaceActive = $derived(
        (nav.surface === 'search' || parity.panelSurface === 'search') && !parity.focusSearchForced
    )
    const searchFamilySurfaceActive = $derived(searchSurfaceActive || parity.focusSearchForced)
    const mapTrailSearchLaneActive = $derived(
        mapModeActive &&
            parity.journeyNavigationOwner === 'map-trail-strip' &&
            parity.panelSurface.startsWith('map-') &&
            parity.panelSurface !== 'map-idle' &&
            parity.panelSurface !== 'map'
    )
    const idleSurfaceActive = $derived(nav.surface === 'idle' && !searchSurfaceActive)
    const focusActive = $derived(isFocusSurfaceActive(nav.mode, nav.focusedIndex ?? null, parity))
    const focusStageActive = $derived(focusActive && !mapModeActive)
    const headerVisible = $derived(!mapModeActive && (idleSurfaceActive || searchFamilySurfaceActive || focusActive))
    const controlsVisible = $derived(
        opts.getSceneReady() &&
            !(nav.surface === 'focus-search') &&
            !parity.focusSearchForced &&
            !(appState.viewportState.viewportIsCompact && (parity.panelSurface === 'idle' || nav.surface === 'idle')) &&
            !(
                appState.viewportState.viewportIsCompact &&
                (parity.panelSurface === 'search' || nav.surface === 'search')
            )
    )
    const infoPanelOpen = $derived(
        (idleSurfaceActive ||
            searchSurfaceActive ||
            (focusActive && (appState.viewportState.viewportIsCompact || parity.compact))) &&
            !mapModeActive
    )
    const legacyCompassSurfaceActive = $derived(
        searchFamilySurfaceActive ||
        focusActive ||
        mapModeActive ||
        parity.panelSurface.startsWith('map-') ||
        nav.surface.startsWith('map-')
    )

    return {
        get renderKind() {
            return renderKind
        },
        get mapModeActive() {
            return mapModeActive
        },
        get searchSurfaceActive() {
            return searchSurfaceActive
        },
        get searchFamilySurfaceActive() {
            return searchFamilySurfaceActive
        },
        get mapTrailSearchLaneActive() {
            return mapTrailSearchLaneActive
        },
        get idleSurfaceActive() {
            return idleSurfaceActive
        },
        get focusActive() {
            return focusActive
        },
        get focusStageActive() {
            return focusStageActive
        },
        get headerVisible() {
            return headerVisible
        },
        get controlsVisible() {
            return controlsVisible
        },
        get infoPanelOpen() {
            return infoPanelOpen
        },
        get legacyCompassSurfaceActive() {
            return legacyCompassSurfaceActive
        }
    }
}
