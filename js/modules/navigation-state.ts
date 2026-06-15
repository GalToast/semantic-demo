/**
 * navigation-state.ts — TypeScript shadow of navigation-state.js
 * Nav transition reducer and state mutation helpers.
 */
import { state, withStateMutation } from '../state.ts';
import { NAV_TRANSITION_ACTIONS, type NavTransitionAction } from '../../src/lib/navigation-actions.ts';

export { NAV_TRANSITION_ACTIONS };
export type { NavTransitionAction };

export interface NavTransitionResult {
    action: string;
    handled: boolean;
    mode: string | null;
    noOp: boolean;
    reason: string;
}

interface LifecycleDeps {
    resetExplorationFocus?: () => void;
    resetExperienceState?: () => void;
    setTrailDepth?: (depth: number, opts?: Record<string, unknown>) => void;
    setSemanticDiveMode?: (active: boolean) => void;
    [key: string]: unknown;
}

let lifecycleDeps: LifecycleDeps = {};

function copyFiniteIndexHistory(value: unknown): number[] {
    if (!value || typeof (value as { length?: unknown }).length !== 'number') return [];
    const length = Math.max(0, Number((value as { length: number }).length) || 0);
    const history: number[] = [];
    for (let i = 0; i < length; i += 1) {
        const index = Number((value as Record<number, unknown>)[i]);
        if (Number.isFinite(index)) history.push(index);
    }
    return history;
}

export function initNavigationState(deps: LifecycleDeps): void {
    lifecycleDeps = deps;
}

export function clearNavigationFocusState(): void {
    withStateMutation(() => {
        state.navState.focusedIndex = null;
        state.navState.trailSeedIndex = null;
        state.navState.trailNeighborIndices = [];
        state.navState.trailCursor = -1;
        (state.navState as any).explorationHistoryIndices = [];
        state.navState.lastTraversalReason = null;
    });
}

export function clearTrailThreadState(): void {
    withStateMutation(() => {
        state.navState.threadCandidates = [];
        state.navState.threadReasonByIndex = new Map();
        state.navState.threadSource = '';
        state.navState.trailNeighborIndices = [];
        state.navState.trailCursor = -1;
        state.navState.trailSeedIndex = null;
    });
}

export interface SetTrailNavStateOpts {
    candidates?: any[];
    source?: string | null;
    reasonByIndex?: Map<number, string>;
    neighborIndices?: number[];
    cursor?: number;
}

export function setTrailNavState(seedIndex: number | null, opts: SetTrailNavStateOpts = {}): void {
    const {
        candidates = [],
        source = null,
        reasonByIndex = new Map(),
        neighborIndices = [],
        cursor = 0
    } = opts;
    withStateMutation(() => {
        state.navState.trailSeedIndex = seedIndex;
        state.navState.threadCandidates = candidates;
        state.navState.threadReasonByIndex = reasonByIndex;
        state.navState.threadSource = source;
        state.navState.trailNeighborIndices = neighborIndices;
        state.navState.trailCursor = cursor;
    });
}

function navTransitionReducer(action: string, payload: Record<string, any> = {}): NavTransitionResult {
    switch (action) {
        case NAV_TRANSITION_ACTIONS.RESET_FOCUS: {
            if (typeof lifecycleDeps.resetExplorationFocus === 'function') {
                lifecycleDeps.resetExplorationFocus();
            }
            clearNavigationFocusState();
            return { action, handled: true, mode: state.navState.mode, noOp: false, reason: 'resetExplorationFocus called; focus nav fields cleared' };
        }
        case NAV_TRANSITION_ACTIONS.RESET_EXPERIENCE: {
            if (typeof lifecycleDeps.resetExperienceState === 'function') {
                lifecycleDeps.resetExperienceState();
            }
            return { action, handled: true, mode: state.navState.mode, noOp: false, reason: 'resetExperienceState called' };
        }
        case NAV_TRANSITION_ACTIONS.SET_DEPTH: {
            const { depth = 0, fromUserGesture = false, allowDiveExit = false, skipUrlSync = false } = payload;
            if (typeof lifecycleDeps.setTrailDepth === 'function') {
                lifecycleDeps.setTrailDepth(depth, { fromUserGesture, allowDiveExit, skipUrlSync });
            }
            return { action, handled: true, mode: state.navState.mode, noOp: false, reason: `setTrailDepth(${depth}) called` };
        }
        case NAV_TRANSITION_ACTIONS.ENTER_INSIDE: {
            if (typeof lifecycleDeps.setSemanticDiveMode === 'function') {
                lifecycleDeps.setSemanticDiveMode(true);
            }
            return { action, handled: true, mode: state.navState.mode, noOp: false, reason: 'setSemanticDiveMode(true) called' };
        }
        case NAV_TRANSITION_ACTIONS.EXIT_INSIDE: {
            if (typeof lifecycleDeps.setSemanticDiveMode === 'function') {
                lifecycleDeps.setSemanticDiveMode(false);
            }
            return { action, handled: true, mode: state.navState.mode, noOp: false, reason: 'setSemanticDiveMode(false) called' };
        }
        case NAV_TRANSITION_ACTIONS.FOCUS_NODE: {
            const { index, preserveMode, fromTraversal, fromCanvasNode, appendHistory, restoreHistory } = payload;
            let nextMode = 'focus';
            if (preserveMode && state.navState.mode) {
                nextMode = state.navState.mode;
            } else if (fromTraversal) {
                nextMode = 'trail';
            }
            withStateMutation(() => {
                state.navState.mode = nextMode;
                state.navState.focusedIndex = index;
                if (nextMode === 'trail' || fromCanvasNode) {
                    state.activeStoryPrompt = null;
                }
                if (restoreHistory) {
                    // preserve existing
                } else if (appendHistory) {
                    const history = copyFiniteIndexHistory((state.navState as any).explorationHistoryIndices);
                    if (history[history.length - 1] !== index) history.push(index);
                    (state.navState as any).explorationHistoryIndices = history;
                } else {
                    (state.navState as any).explorationHistoryIndices = [index];
                }
            });
            return { action, handled: true, mode: nextMode, noOp: false, reason: 'FOCUS_NODE reducer owns navState.mode, focusedIndex, explorationHistoryIndices' };
        }
        case NAV_TRANSITION_ACTIONS.WALK_TO: {
            const { index, fromIndex, appendHistory, restoreHistoryIndices } = payload;
            withStateMutation(() => {
                if (Array.isArray(restoreHistoryIndices)) {
                    state.navState.walkHistoryIndices = restoreHistoryIndices.filter((value: any) => Number.isFinite(value));
                } else if (appendHistory !== false) {
                    const history = copyFiniteIndexHistory(state.navState.walkHistoryIndices);
                    if (Number.isFinite(fromIndex) && history[history.length - 1] !== fromIndex) history.push(fromIndex);
                    if (history[history.length - 1] !== index) history.push(index);
                    state.navState.walkHistoryIndices = history;
                }
                state.navState.mode = 'trail';
            });
            return { action, handled: true, mode: state.navState.mode, noOp: false, reason: 'WALK_TO reducer owns walkHistoryIndices; delegates traversal to journey.walkThreadNeighbor' };
        }
        case NAV_TRANSITION_ACTIONS.BACKTRACK: {
            const { step, restoreHistory } = payload;
            withStateMutation(() => {
                if (step < 0 && restoreHistory) {
                    const history = copyFiniteIndexHistory(state.navState.walkHistoryIndices);
                    if (history.length > 0) history.pop();
                    state.navState.walkHistoryIndices = history;
                }
            });
            return { action, handled: true, mode: state.navState.mode, noOp: false, reason: 'BACKTRACK reducer owns walkHistoryIndices pop; delegates traversal to journey.traverseNeighbor' };
        }
        case NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY: {
            const { history } = payload;
            withStateMutation(() => {
                (state.navState as any).explorationHistoryIndices = Array.isArray(history) ? history : [];
            });
            return { action, handled: true, mode: state.navState.mode, noOp: false, reason: 'RESTORE_EXPLORATION_HISTORY reducer restores explorationHistoryIndices' };
        }
        default: {
            return { action, handled: false, mode: state.navState.mode, noOp: true, reason: `Unknown action: ${action}` };
        }
    }
}

export function dispatchNavTransition(action: string, payload: Record<string, any> = {}): NavTransitionResult {
    return navTransitionReducer(action, payload);
}
