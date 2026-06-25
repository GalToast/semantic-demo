/**
 * @lib/orchestration/navigation-state.ts — Canonical navigation state clearers.
 *
 * Provides `clearTrailThreadState`, `clearNavigationFocusState`, and
 * `setTrailNavState` so non-bridge src/ files don't import from deleted
 * These were originally state-mutation helpers
 * in the legacy kernel; they are now thin wrappers over appState.
 */

import { appState } from '@lib/state/app.svelte'
import type { ThreadCandidateLike } from '@lib/state/state-types'
import { navStore } from '@lib/stores/navigation.svelte'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SetTrailNavStateOpts {
    candidates?: ThreadCandidateLike[]
    source?: string
    reasonByIndex?: Map<number, string>
    neighborIndices?: number[]
    cursor?: number
}

// ── Navigation state clearers (replaces deleted ) ─

export function clearNavigationFocusState(): void {
    appState.withMutation(() => {
        appState.navState.focusedIndex = null
        appState.navState.trailSeedIndex = null
        appState.navState.trailNeighborIndices = []
        appState.navState.trailCursor = -1
        appState.navState.explorationHistoryIndices = []
        appState.navState.lastTraversalReason = null
    })
    navStore.update((s) => ({
        ...s,
        focusedIndex: null,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        explorationHistoryIndices: [],
        lastTraversalReason: null
    }))
}

export function clearTrailThreadState(): void {
    appState.withMutation(() => {
        appState.navState.threadCandidates = []
        appState.navState.threadReasonByIndex = new Map()
        appState.navState.threadSource = ''
        appState.navState.trailNeighborIndices = []
        appState.navState.trailCursor = -1
        appState.navState.trailSeedIndex = null
    })
    navStore.update((s) => ({
        ...s,
        threadCandidates: [],
        threadReasonByIndex: new Map(),
        threadSource: '',
        trailNeighborIndices: [],
        trailCursor: -1,
        trailSeedIndex: null
    }))
}

export function setTrailNavState(seedIndex: number | null, opts: SetTrailNavStateOpts = {}): void {
    const { candidates = [], source = '', reasonByIndex = new Map(), neighborIndices = [], cursor = 0 } = opts
    appState.withMutation(() => {
        appState.navState.trailSeedIndex = seedIndex
        appState.navState.threadCandidates = candidates
        appState.navState.threadReasonByIndex = reasonByIndex
        appState.navState.threadSource = source
        appState.navState.trailNeighborIndices = neighborIndices
        appState.navState.trailCursor = cursor
    })
    navStore.update((s) => ({
        ...s,
        trailSeedIndex: seedIndex,
        threadCandidates: candidates,
        threadReasonByIndex: reasonByIndex,
        threadSource: source,
        trailNeighborIndices: neighborIndices,
        trailCursor: cursor
    }))
}

// ── Re-exports from canonical stores ────────────────────────────────────────

export { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte'
export type { NavTransitionAction } from '@lib/navigation-actions'
export type { NavTransitionResult } from '@lib/stores/navigation.svelte'
