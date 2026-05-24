import { state } from '../state.js';

export const NAV_TRANSITION_ACTIONS = Object.freeze({
    FOCUS_NODE: 'FOCUS_NODE',
    SET_DEPTH: 'SET_DEPTH',
    WALK_TO: 'WALK_TO',
    BACKTRACK: 'BACKTRACK',
    RESET_FOCUS: 'RESET_FOCUS',
    RESET_EXPERIENCE: 'RESET_EXPERIENCE',
    ENTER_INSIDE: 'ENTER_INSIDE',
    EXIT_INSIDE: 'EXIT_INSIDE',
    RESTORE_EXPLORATION_HISTORY: 'RESTORE_EXPLORATION_HISTORY',
});

let lifecycleDeps = {};

/**
 * Bootstraps the lifecycle dependencies to prevent circular imports.
 * @param {object} deps
 */
export function initNavigationState(deps) {
    lifecycleDeps = deps;
}

/**
 * Clears focus-related nav fields without invoking lifecycle reset delegates.
 * Use this from lifecycle reset helpers when dispatching RESET_FOCUS would recurse.
 */
export function clearNavigationFocusState() {
    state.navState.focusedIndex = null;
    state.navState.trailSeedIndex = null;
    state.navState.trailNeighborIndices = [];
    state.navState.trailCursor = -1;
    state.navState.explorationHistoryIndices = [];
    state.navState.lastTraversalReason = null;
}

/**
 * Clears thread/trail nav fields that are populated by setTrailFromSeed.
 * Call this from lifecycle reset helpers instead of directly assigning
 * state.navState.threadCandidates = [] and related fields.
 */
export function clearTrailThreadState() {
    state.navState.threadCandidates = [];
    state.navState.threadReasonByIndex = new Map();
    state.navState.threadSource = null;
    state.navState.trailNeighborIndices = [];
    state.navState.trailCursor = -1;
    state.navState.trailSeedIndex = null;
}

/**
 * Canonical setter for trail/thread nav state fields that are derived from
 * a seed index. Journey.js MUST use this instead of directly assigning
 * state.navState.trailSeedIndex, threadCandidates, threadReasonByIndex,
 * threadSource, trailNeighborIndices, and trailCursor.
 *
 * All other modules (lifecycle, search-state, micro-demo) MUST use
 * clearTrailThreadState() to clear these fields, not direct assignment.
 *
 * @param {number|null} seedIndex
 * @param {Array}  opts.candidates     - thread candidate array
 * @param {string}  opts.source        - 'semantic' | 'geometric-fallback'
 * @param {Map}    opts.reasonByIndex  - Map of index → reason string
 * @param {Array}  opts.neighborIndices - array of neighbor indices
 * @param {number} opts.cursor        - trail cursor position
 */
export function setTrailNavState(seedIndex, opts = {}) {
    const {
        candidates = [],
        source = null,
        reasonByIndex = new Map(),
        neighborIndices = [],
        cursor = 0
    } = opts;
    state.navState.trailSeedIndex = seedIndex;
    state.navState.threadCandidates = candidates;
    state.navState.threadReasonByIndex = reasonByIndex;
    state.navState.threadSource = source;
    state.navState.trailNeighborIndices = neighborIndices;
    state.navState.trailCursor = cursor;
}

/**
 * Internal reducer for nav transition state machine.
 *
 * @param {string} action - One of NAV_TRANSITION_ACTIONS
 * @param {object} [payload={}] - Action-specific payload
 * @returns {{ action: string, handled: boolean, mode: string|null, noOp: boolean, reason: string }}
 */
function navTransitionReducer(action, payload = {}) {
    switch (action) {
        case NAV_TRANSITION_ACTIONS.RESET_FOCUS: {
            if (typeof lifecycleDeps.resetExplorationFocus === 'function') {
                lifecycleDeps.resetExplorationFocus();
            }
            // explorationHistoryIndices is owned by FOCUS_NODE reducer; clear it here
            // so the reset is explicit and auditable in the reducer, not just in the
            // delegate chain. This makes the ownership contract visible at the
            // dispatch level and ensures the field is cleared even if the delegate
            // is not yet wired.
            clearNavigationFocusState();
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'resetExplorationFocus called; focus nav fields cleared',
            };
        }

        case NAV_TRANSITION_ACTIONS.RESET_EXPERIENCE: {
            if (typeof lifecycleDeps.resetExperienceState === 'function') {
                lifecycleDeps.resetExperienceState();
            }
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'resetExperienceState called',
            };
        }

        case NAV_TRANSITION_ACTIONS.SET_DEPTH: {
            const { depth = 0, fromUserGesture = false, allowDiveExit = false, skipUrlSync = false } = payload;
            if (typeof lifecycleDeps.setTrailDepth === 'function') {
                lifecycleDeps.setTrailDepth(depth, { fromUserGesture, allowDiveExit, skipUrlSync });
            }
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: `setTrailDepth(${depth}) called`,
            };
        }

        case NAV_TRANSITION_ACTIONS.ENTER_INSIDE: {
            if (typeof lifecycleDeps.setSemanticDiveMode === 'function') {
                lifecycleDeps.setSemanticDiveMode(true);
            }
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'setSemanticDiveMode(true) called',
            };
        }

        case NAV_TRANSITION_ACTIONS.EXIT_INSIDE: {
            if (typeof lifecycleDeps.setSemanticDiveMode === 'function') {
                lifecycleDeps.setSemanticDiveMode(false);
            }
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'setSemanticDiveMode(false) called',
            };
        }

        case NAV_TRANSITION_ACTIONS.FOCUS_NODE: {
            const {
                index,
                preserveMode,
                fromTraversal,
                fromCanvasNode,
                appendHistory,
                restoreHistory
            } = payload;

            // Compute resulting mode
            let nextMode = 'focus';
            if (preserveMode && state.navState.mode) {
                nextMode = state.navState.mode;
            } else if (fromTraversal) {
                nextMode = 'trail';
            }

            state.navState.mode = nextMode;
            state.navState.focusedIndex = index;

            // activeStoryPrompt clearing: mirrors focusOnNode behavior
            if (nextMode === 'trail' || fromCanvasNode) {
                state.activeStoryPrompt = null;
            }

            // explorationHistoryIndices: owned by FOCUS_NODE reducer
            if (restoreHistory) {
                // preserve existing
            } else if (appendHistory) {
                const history = [...(state.navState.explorationHistoryIndices || [])];
                if (history[history.length - 1] !== index) history.push(index);
                state.navState.explorationHistoryIndices = history;
            } else {
                state.navState.explorationHistoryIndices = [index];
            }

            return {
                action,
                handled: true,
                mode: nextMode,
                noOp: false,
                reason: 'FOCUS_NODE reducer owns navState.mode, focusedIndex, explorationHistoryIndices',
            };
        }

        case NAV_TRANSITION_ACTIONS.WALK_TO: {
            const { index, fromIndex, appendHistory, restoreHistoryIndices } = payload;
            if (Array.isArray(restoreHistoryIndices)) {
                state.navState.walkHistoryIndices = restoreHistoryIndices
                    .filter((value) => Number.isFinite(value));
            } else if (appendHistory !== false) {
                // Owner of walkHistoryIndices — canonical push
                const history = [...(state.navState.walkHistoryIndices || [])];
                if (Number.isFinite(fromIndex) && history[history.length - 1] !== fromIndex) history.push(fromIndex);
                if (history[history.length - 1] !== index) history.push(index);
                state.navState.walkHistoryIndices = history;
            }
            state.navState.mode = 'trail';
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'WALK_TO reducer owns walkHistoryIndices; delegates traversal to journey.walkThreadNeighbor',
            };
        }

        case NAV_TRANSITION_ACTIONS.BACKTRACK: {
            const { step, restoreHistory } = payload;
            if (step < 0 && restoreHistory) {
                // Owner of walkHistoryIndices — canonical pop
                const history = [...(state.navState.walkHistoryIndices || [])];
                if (history.length > 0) {
                    history.pop(); // remove the current position, leaving prior position
                }
                state.navState.walkHistoryIndices = history;
            }
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'BACKTRACK reducer owns walkHistoryIndices pop; delegates traversal to journey.traverseNeighbor',
            };
        }

        case NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY: {
            const { history } = payload;
            state.navState.explorationHistoryIndices = Array.isArray(history) ? history : [];
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'RESTORE_EXPLORATION_HISTORY reducer restores explorationHistoryIndices',
            };
        }

        default: {
            return {
                action,
                handled: false,
                mode: state.navState.mode,
                noOp: true,
                reason: `Unknown action: ${action}`,
            };
        }
    }
}

/**
 * Central dispatch for nav transition actions.
 *
 * @param {string} action - One of NAV_TRANSITION_ACTIONS
 * @param {object} [payload={}] - Action-specific payload
 * @returns {{ action: string, handled: boolean, mode: (string|null), noOp: boolean, reason: string }}
 */
export function dispatchNavTransition(action, payload = {}) {
    return navTransitionReducer(action, payload);
}
