/**
 * @lib/stores/compass.ts — Standalone compass state machine store
 *
 * Compass phase state machine (from AGENTS.md):
 *   idle → checking → synthesizing → active
 *                    ↘ interrupted → idle
 *
 * Compass steps are the 5 journey milestones in the rail:
 *   overview → search → focus → inside → map
 *
 * Separated from journey.ts so the compass SM can evolve independently
 * during the Svelte migration.
 */
import { writable, derived, get } from 'svelte/store';
import { journeyPhase } from './journey';
import { currentSurface } from './navigation';
import type { CompassPhase as CompassPhaseType } from '@lib/types/state';

// ── Re-export type ─────────────────────────────────────────────────────────────

export type CompassPhase = CompassPhaseType;

// ── Step types ─────────────────────────────────────────────────────────────────

export interface CompassStep {
  /** Phase name: overview | search | focus | inside | map */
  phase: string;
  /** Progress state relative to the current journey phase */
  state: 'done' | 'current' | 'upcoming';
}

// ── Writable compass phase store ───────────────────────────────────────────────

/** Standalone compass phase store. Replaces the embedded compass in journey.ts. */
export const compassPhase = writable<CompassPhase>('idle');

// ── State machine transitions ──────────────────────────────────────────────────
// Valid paths (from AGENTS.md):
//   idle -> checking -> synthesizing -> active
//                     -> interrupted -> idle
//   active -> checking | interrupted | idle
//   interrupted -> idle | checking

const VALID_TRANSITIONS: Record<CompassPhase, readonly CompassPhase[]> = {
  idle: ['checking'],
  checking: ['synthesizing', 'interrupted'],
  synthesizing: ['active', 'interrupted'],
  active: ['checking', 'interrupted', 'idle'],
  interrupted: ['idle', 'checking']
};

function canTransition(from: CompassPhase, to: CompassPhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Transition the compass state machine.
 * Returns true if the transition was valid and applied.
 */
export function transitionCompass(to: CompassPhase): boolean {
  const from = get(compassPhase);

  if (!canTransition(from, to)) {
    console.warn(`[Compass] Invalid transition: ${from} → ${to}`);
    return false;
  }

  compassPhase.set(to);

  // Sync body data attribute for CSS coexistence during migration
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.journeyCompass = to;
  }

  return true;
}

// ── Compass step order (5 milestones) ──────────────────────────────────────────

const STEP_ORDER: readonly string[] = ['overview', 'search', 'focus', 'inside', 'map'];

/**
 * Derived store computing the 5 compass step states from journeyPhase,
 * currentSurface, and compassPhase. Each step gets a done/current/upcoming
 * state based on the current journey phase position in the step order.
 */
export const compassSteps = derived(
  [journeyPhase, currentSurface, compassPhase],
  ([$journeyPhase]): CompassStep[] => {
    const activeIndex = STEP_ORDER.indexOf($journeyPhase);

    return STEP_ORDER.map((phase) => {
      const idx = STEP_ORDER.indexOf(phase);
      let state: 'done' | 'current' | 'upcoming';

      if (phase === $journeyPhase) {
        state = 'current';
      } else if (activeIndex >= 0 && idx >= 0 && idx < activeIndex) {
        state = 'done';
      } else {
        state = 'upcoming';
      }

      return { phase, state };
    });
  }
);
