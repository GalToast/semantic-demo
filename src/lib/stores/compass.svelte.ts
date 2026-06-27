/**
 * @lib/stores/compass.svelte.ts — Journey compass state machine store (Svelte 5 runes)
 *
 * Compass phase state machine (from AGENTS.md):
 *   idle → checking → synthesizing → active
 *                    ↘ interrupted → idle
 *
 * Compass steps are the 5 journey milestones in the rail:
 *   overview → search → focus → inside → map
 */
import { appState } from '@lib/state/app.svelte.ts'
import type { CompassPhase as CompassPhaseType } from '@lib/types/state'
import { JOURNEY_COMPASS_PHASE_ORDER } from '@lib/stores/journey.svelte.ts'

// ── Re-export type ───────────────────────────────────────────────────────────

export type CompassPhase = CompassPhaseType

// ── Step Types ───────────────────────────────────────────────────────────────

export interface CompassStep {
    /** Phase name: overview | search | focus | inside | map */
    phase: string
    /** Progress state relative to the current journey phase */
    state: 'done' | 'current' | 'upcoming'
}

// ── Journey Compass Action Types ───────────────────────────────────────────
// Canonical source: @lib/journey/compass-state.ts

import { JOURNEY_ACTIONS } from '@lib/journey/compass-state'
export { JOURNEY_ACTIONS }
import type { CompassAction } from '@lib/journey/compass-state'
export type { CompassAction }
export type JourneyAction = (typeof JOURNEY_ACTIONS)[keyof typeof JOURNEY_ACTIONS]

/** The full compass status output for a given state. */
export interface CompassStatus {
    readonly phase: string
    readonly kicker: string
    readonly title: string
    readonly note: string
    readonly primaryAction: CompassAction
    readonly secondaryAction: CompassAction | null
    readonly tertiaryAction: CompassAction | null
}

/**
 * Derived rune computing the 5 compass step states.
 */
export function compassSteps(): CompassStep[] {
    const activePhase = appState.navState.mode
    const activeIndex = JOURNEY_COMPASS_PHASE_ORDER.indexOf(activePhase)

    return JOURNEY_COMPASS_PHASE_ORDER.map((phase) => {
        const idx = JOURNEY_COMPASS_PHASE_ORDER.indexOf(phase)
        let state: 'done' | 'current' | 'upcoming'

        if (phase === activePhase) {
            state = 'current'
        } else if (activeIndex >= 0 && idx >= 0 && idx < activeIndex) {
            state = 'done'
        } else {
            state = 'upcoming'
        }

        return { phase, state }
    })
}
