/**
 * @lib/stores/navigation/transition-effects.ts — Transition side-effect registry
 *
 * Decouples the nav transition dispatcher (mode-transitions.svelte.ts) from the
 * sibling domain-store module graphs (search/focus/journey). The dispatcher
 * looks effects up here instead of importing those modules statically, which
 * keeps the shared mode-transitions chunk lean (qa-budget mode-transition rule:
 * a mode-transition chunk may not grow >16 KB over baseline).
 *
 * Each domain store self-registers at module evaluation (see the
 * `registerTransitionEffects` calls in search-core.ts, focus.svelte.ts,
 * journey.svelte.ts, search-panel-adapter.ts), so any normal import path that
 * loads a store also arms its transition effects. Dispatch sites treat an
 * unregistered effect as a no-op with a debugWarn — that window is only
 * reachable if a RETURN_OVERVIEW/SET_SURFACE-style dispatch fires before any
 * domain store has ever been imported, which the boot order makes unreachable
 * in practice (App/AppBoot import the stores before any UI can dispatch).
 *
 * This module must stay dependency-free (types only) — importing anything from
 * the stores here would re-couple the graphs this registry exists to sever.
 */

import { debugWarn } from '@lib/utils/debug'

export interface TransitionEffects {
    /** search-core: wipe query/results state (RETURN_OVERVIEW). */
    clearSearch: () => void
    /** search-panel-adapter: collapse the mobile search sheet (RETURN_OVERVIEW). */
    clearMobileSearchSheetState: () => void
    /** focus store: reset focused record/dive state (RETURN_OVERVIEW). */
    resetFocus: () => void
    /** focus store: leave semantic-dive presentation (SET_SURFACE leaving-dive). */
    setSemanticDiveMode: (active: boolean) => void
    /** journey store: reset trail/walk state (RETURN_OVERVIEW). */
    resetJourney: () => void
    /** journey store: pin trail depth (SET_SURFACE leaving-dive). */
    setTrailDepth: (depth: number) => void
}

type TransitionEffectName = keyof TransitionEffects

const registered: Partial<TransitionEffects> = {}

/** Register (or replace) transition side-effects. Stores call this at module eval. */
export function registerTransitionEffects(effects: Partial<TransitionEffects>): void {
    Object.assign(registered, effects)
}

/** Test/diagnostic escape hatch: drop all registrations. */
export function resetTransitionEffectsForTests(): void {
    for (const key of Object.keys(registered) as TransitionEffectName[]) {
        delete registered[key]
    }
}

/**
 * Look up a registered effect. Returns a no-op (with a one-time debugWarn)
 * when the owning store has not been evaluated yet — see the module docstring
 * for why this window is unreachable under normal boot.
 */
export function lookupTransitionEffect<K extends TransitionEffectName>(name: K): TransitionEffects[K] {
    const fn = registered[name]
    if (fn) return fn as TransitionEffects[K]
    return ((...args: unknown[]) => {
        debugWarn(
            `[nav-transitions] effect "${name}" dispatched before its store registered — ` +
                'no-op. If this fires outside unit tests, check boot import order.'
        )
        return undefined as ReturnType<TransitionEffects[K]>
    }) as TransitionEffects[K]
}
