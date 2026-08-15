/**
 * @lib/ui/use-parity-attrs.svelte.ts — composable for parity attribute reads
 *
 * App.svelte was reading 8-9 separate reactive parity attributes via
 * `let bodyPanelSurface = $derived(parityMap.panelSurface || '')` lines.
 * Each was a leaky abstraction — every parity consumer had to know about
 * the parityMap shape, the bypass attribute MutationObserver, and the
 * `focusSearchForced` DOM-fallback chain.
 *
 * This composable:
 *   - Wraps the parity attribute reads in a single reactive bundle
 *   - Each property is a getter that registers reactive deps when called
 *     from a tracking context (template, $derived, $effect)
 *   - The composed `focusSearchForced` flag stays local to consumers
 *     (it composes the DOM dataset fallback that doesn't belong in the
 *     parity module itself)
 *
 * Usage:
 *   const parity = useParityAttrs()
 *   $effect(() => console.log(parity.panelSurface))
 *   <div class:surface-focus-search={parity.panelSurface === 'focus-search'} />
 *
 * Decomp risk: the getter-on-plain-object pattern reads dependencies at
 * call site, so destructuring loses reactivity:
 *
 *   const { panelSurface } = useParityAttrs()  // ❌ loses reactivity
 *   const parity = useParityAttrs()             // ✅ reactive via getters
 */

import { parityMap, getBypassAttr } from '@lib/orchestration/parity-attrs.svelte'

export interface ParityAttrs {
    /** Body data-focus-panel-mode, written by focus-panel-mode.ts */
    readonly focusPanelMode: string
    /** Body data-inside-walk-state, written by semantic-dive.ts */
    readonly insideWalkState: string
    /** Body data-panel-surface (primary surface id) */
    readonly panelSurface: string
    /** Body data-graph-context (semantic-graph vs map-trail) */
    readonly graphContext: string
    /** Body data-compact (true/false string) */
    readonly compact: boolean
    /** Body data-journey-navigation-owner (who owns nav: trail-strip etc.) */
    readonly journeyNavigationOwner: string
    /** Body data-trail-state (active/inactive) */
    readonly trailState: string
    /** Body data-strand-journey (semantic-dive trail phase) */
    readonly strandJourney: string
    /**
     * Composed: panelSurface or graphContext equals 'focus-search', OR
     * body.dataset.focusSearchForced === 'true'. Callers that need the
     * gate (Controls, InfoPanel, surface predicates) read this instead of
     * recomputing the OR.
     */
    readonly focusSearchForced: boolean
    /**
     * Body data-render-kind (webgl | placeholder2d). Read via the bypass
     * attribute snapshot so it tracks both the parityMap mirror and the
     * raw DOM dataset — App.svelte's {#if renderKind !== 'placeholder2d'}
     * gate depends on this reflecting the live body attribute.
     */
    readonly renderKind: string
}

/**
 * Returns the current parity attribute bundle. Each property is a getter
 * that re-runs when the underlying parityMap or bypass attribute changes.
 *
 * The returned object is fresh per call (no memoization), which matches
 * App.svelte's expectation that the bundle is component-scoped. If two
 * components call this, they get two independent bundles — each with its
 * own dependency tracking, so updates don't double-fire.
 */
/**
 * Shared focus-surface-active predicate — single source of truth for the
 * `focusActive` (App.svelte) / `chromeHasFocus` (JourneyChrome.svelte) lockstep
 * gate. W53 foot-gun: these two `$derived`s must stay identical or JourneyChrome
 * mounts while `chromeHasFocus` is false → `#btn-focus-path` never renders →
 * 30s e2e timeout on the map-trail surface contract. Route both through this so
 * widening the predicate is a one-line change.
 */
export function isFocusSurfaceActive(
    navMode: string,
    focusedIndex: number | null,
    parity: ParityAttrs
): boolean {
    return (
        navMode === 'focus' ||
        navMode === 'inside' ||
        navMode === 'trail' ||
        focusedIndex != null ||
        parity.focusPanelMode === 'field-node' ||
        parity.panelSurface === 'focus' ||
        parity.panelSurface === 'inside' ||
        parity.panelSurface === 'trail' ||
        parity.panelSurface === 'focus-search' ||
        parity.panelSurface === 'map-trail' ||
        parity.focusSearchForced ||
        parity.panelSurface === 'semantic-dive'
    )
}

export function useParityAttrs(): ParityAttrs {
    return {
        get focusPanelMode(): string {
            return getBypassAttr('focusPanelMode') ?? ''
        },
        get insideWalkState(): string {
            return getBypassAttr('insideWalkState') ?? 'idle'
        },
        get panelSurface(): string {
            return parityMap.panelSurface || ''
        },
        get graphContext(): string {
            return parityMap.graphContext || ''
        },
        get compact(): boolean {
            return parityMap.compact === 'true'
        },
        get journeyNavigationOwner(): string {
            return parityMap.journeyNavigationOwner || ''
        },
        get trailState(): string {
            return parityMap.trailState || 'inactive'
        },
        get strandJourney(): string {
            return parityMap.strandJourney || 'idle'
        },
        get focusSearchForced(): boolean {
            // W-audit-T5-5: read parityMap directly instead of via `this.*`
            // getters, so the flag no longer depends on `this` binding (avoids
            // a latent crash if the getter is ever detached as a callback).
            // Dependency tracking still propagates through the parityMap reads.
            // The body.dataset fallback is a contract-test escape hatch, not
            // a normal-state path.
            return (
                (parityMap.panelSurface || '') === 'focus-search' ||
                (parityMap.graphContext || '') === 'focus-search' ||
                document.body?.dataset.focusSearchForced === 'true'
            )
        },
        get renderKind(): string {
            // Read via the bypass snapshot first (covers body dataset flips
            // driven by setRenderKind and the auto-signal from App.svelte),
            // then fall back to the live DOM dataset for tests/edge cases.
            return getBypassAttr('renderKind') ?? document.body?.dataset.renderKind ?? ''
        }
    }
}
