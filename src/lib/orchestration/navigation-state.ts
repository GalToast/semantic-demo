/**
 * @lib/orchestration/navigation-state.ts — Canonical navigation state clearers.
 *
 * Provides `clearTrailThreadState`, `clearNavigationFocusState`, and
 * `setTrailNavState` so non-bridge src/ files don't import from deleted
 * js/modules/navigation-state. These were originally state-mutation helpers
 * in the legacy kernel; they are now thin wrappers over appState.
 */

import { appState } from '@lib/state/app.svelte';
import { navStore } from '@lib/stores/navigation.svelte';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SetTrailNavStateOpts {
    candidates?: any[];
    source?: string;
    reasonByIndex?: Map<number, string>;
    neighborIndices?: number[];
    cursor?: number;
}

// ── Navigation state clearers (replaces deleted js/modules/navigation-state) ─

export function clearNavigationFocusState(): void {
    appState.withMutation(() => {
        appState.navState.focusedIndex = null;
        appState.navState.trailSeedIndex = null;
        (appState.navState as any).trailNeighborIndices = [];
        (appState.navState as any).trailCursor = -1;
        (appState.navState as any).explorationHistoryIndices = [];
        (appState.navState as any).lastTraversalReason = null;
    });
    navStore.update(s => ({
        ...s,
        focusedIndex: null,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        explorationHistoryIndices: [],
        lastTraversalReason: null,
    }));
}

export function clearTrailThreadState(): void {
    appState.withMutation(() => {
        (appState.navState as any).threadCandidates = [];
        (appState.navState as any).threadReasonByIndex = new Map();
        (appState.navState as any).threadSource = '';
        (appState.navState as any).trailNeighborIndices = [];
        (appState.navState as any).trailCursor = -1;
        (appState.navState as any).trailSeedIndex = null;
    });
    navStore.update(s => ({
        ...s,
        threadCandidates: [],
        threadReasonByIndex: new Map(),
        threadSource: '',
        trailNeighborIndices: [],
        trailCursor: -1,
        trailSeedIndex: null,
    }));
}

export function setTrailNavState(seedIndex: number | null, opts: SetTrailNavStateOpts = {}): void {
    const {
        candidates = [],
        source = '',
        reasonByIndex = new Map(),
        neighborIndices = [],
        cursor = 0,
    } = opts;
    appState.withMutation(() => {
        (appState.navState as any).trailSeedIndex = seedIndex;
        (appState.navState as any).threadCandidates = candidates;
        (appState.navState as any).threadReasonByIndex = reasonByIndex;
        (appState.navState as any).threadSource = source;
        (appState.navState as any).trailNeighborIndices = neighborIndices;
        (appState.navState as any).trailCursor = cursor;
    });
    navStore.update(s => ({
        ...s,
        trailSeedIndex: seedIndex,
        threadCandidates: candidates,
        threadReasonByIndex: reasonByIndex,
        threadSource: source,
        trailNeighborIndices: neighborIndices,
        trailCursor: cursor,
    }));
}

// ── Re-exports from canonical stores ────────────────────────────────────────

export { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte';
export type { NavTransitionAction } from '@lib/navigation-actions';
export type { NavTransitionResult } from '@lib/stores/navigation.svelte';
