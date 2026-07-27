/**
 * @lib/stores/navigation/mode-transitions.svelte.ts — Mode/view transitions
 *
 * Handles navigation transitions between modes (overview, focus, trail, inside,
 * search) and views (galaxy, map). Contains the dispatchNavTransition orchestrator
 * and all mode/view setter functions.
 */
import type { NavState, NavMode, PanelSurface } from '@lib/types/state'
import { NAV_TRANSITION_ACTIONS, type NavTransitionAction } from '@lib/navigation-actions'
import { clearSearch } from '../search.svelte.ts'
import { resetFocus } from '../focus.svelte.ts'
import { resetJourney } from '../journey.svelte.ts'
import { _readNavSnapshot, readNavMirrorValue, writeNavStateMirror, resetNavState } from './navigation-state.svelte.ts'

// ── Re-exports ───────────────────────────────────────────────────────────────

export { NAV_TRANSITION_ACTIONS }
export type { NavTransitionAction }

// ── Types ────────────────────────────────────────────────────────────────────

export interface NavTransitionPayload {
    index?: number | null
    mode?: NavMode
    surface?: PanelSurface
    view?: 'galaxy' | 'map'
    reason?: string | null
    fromTraversal?: boolean
    fromCanvasNode?: boolean
    appendHistory?: boolean
    restoreHistory?: boolean
    preserveMode?: boolean
    depth?: number
    fromUserGesture?: boolean
    allowDiveExit?: boolean
    skipUrlSync?: boolean
    step?: number
    fromIndex?: number
    targetIndex?: number
    restoreHistoryIndices?: number[]
    history?: number[]
}

/** Result of a navigation transition (for async orchestration). */
export interface NavTransitionResult {
    ok: boolean
    previousMode: NavMode
    nextMode: NavMode
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function returnToOverviewState(): void {
    clearSearch()
    resetFocus()
    resetJourney()
    writeNavStateMirror({
        focusedIndex: null,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        trailDepth: 0,
        walkHistoryIndices: [],
        lastTraversalReason: null,
        threadCandidates: [],
        threadReasonByIndex: new Map(),
        threadSource: '',
        neighborhoodIndices: [],
        mode: 'overview' as NavMode,
        surface: 'idle' as PanelSurface,
        previousSurface: 'idle' as PanelSurface,
        currentView: 'galaxy'
    })
}

// ── Mode/View Setters ────────────────────────────────────────────────────────

/** Switch the primary view (galaxy/map). */
export function switchView(view: 'galaxy' | 'map'): void {
    writeNavStateMirror({ currentView: view })
}

/** Backward-compatible alias for callers that still use the state mutator name. */
export const setCurrentView = switchView

/** Set the active panel surface. */
export function setSurface(surface: PanelSurface): void {
    const cur = _readNavSnapshot()
    const mode: NavMode =
        surface === 'search'
            ? 'search'
            : surface === 'focus'
              ? 'focus'
              : surface === 'inside'
                ? 'inside'
                : (surface as string) === 'trail'
                  ? 'trail'
                  : surface === 'idle'
                    ? 'overview'
                    : cur.mode
    writeNavStateMirror({
        previousSurface: cur.surface,
        surface,
        mode,
        currentView: surface === 'map' ? 'map' : 'galaxy'
    })
}

/** Backward-compatible alias for migrated orchestration imports. */
export const setNavSurface = setSurface

// ── Navigation Transition Dispatcher ─────────────────────────────────────────

/**
 * Dispatch a navigation transition (the core orchestrator).
 */
export function dispatchNavTransition(
    action: NavTransitionAction,
    payload: NavTransitionPayload = {}
): NavTransitionResult {
    const previousMode = _readNavSnapshot().mode

    switch (action) {
        case NAV_TRANSITION_ACTIONS.FOCUS_NODE: {
            const _indexDefined = Number.isFinite(payload.index)
            const _modeRaw = payload.mode
            const _surfaceRaw = payload.surface
            const _fromTraversal = payload.fromTraversal
            const _fromCanvasNode = payload.fromCanvasNode
            const _finalMode: NavMode =
                _modeRaw && (_modeRaw as string).length ? (_modeRaw as NavMode) : ('focus' as NavMode)
            const _finalSurface: PanelSurface =
                _surfaceRaw && (_surfaceRaw as string).length
                    ? (_surfaceRaw as PanelSurface)
                    : ('focus' as PanelSurface)
            writeNavStateMirror(
                (() => {
                    const patch: Partial<NavState> = {}
                    if (_indexDefined) patch.focusedIndex = payload.index as number
                    patch.mode = _finalMode
                    patch.surface = _finalSurface
                    if (_fromTraversal === true || _fromCanvasNode === true) {
                        patch.activeStoryPrompt = null
                    }
                    return patch
                })()
            )
            break
        }
        case NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW:
            returnToOverviewState()
            break
        case NAV_TRANSITION_ACTIONS.SET_VIEW:
            if (payload.view) {
                const view: 'galaxy' | 'map' = payload.view
                writeNavStateMirror({ currentView: view })
            }
            break
        case NAV_TRANSITION_ACTIONS.SET_SURFACE: {
            const surface = payload.surface ?? 'idle'
            const current = _readNavSnapshot()
            const newMode: NavMode =
                surface === 'search'
                    ? 'search'
                    : surface === 'focus'
                      ? 'focus'
                      : surface === 'inside'
                        ? 'inside'
                        : (surface as string) === 'trail'
                          ? 'trail'
                          : surface === 'idle'
                            ? 'overview'
                            : (current.mode as NavMode)
            writeNavStateMirror({
                previousSurface: current.surface,
                surface: surface as PanelSurface,
                mode: newMode
            })
            break
        }
        case NAV_TRANSITION_ACTIONS.TRAVERSE_NEIGHBOR:
            writeNavStateMirror({
                focusedIndex: payload.index ?? _readNavSnapshot().focusedIndex,
                mode: 'trail' as NavMode,
                surface: 'trail'
            })
            break
        case NAV_TRANSITION_ACTIONS.WALK_THREAD:
        case NAV_TRANSITION_ACTIONS.WALK_TO: {
            const current = _readNavSnapshot()
            const nextIndex = payload.index ?? current.focusedIndex
            const walkHistoryIndices =
                payload.appendHistory !== false && nextIndex != null
                    ? current.walkHistoryIndices[current.walkHistoryIndices.length - 1] === nextIndex
                        ? current.walkHistoryIndices
                        : [...current.walkHistoryIndices, nextIndex]
                    : current.walkHistoryIndices
            writeNavStateMirror({
                focusedIndex: nextIndex,
                mode: 'trail' as NavMode,
                surface: (current.surface === 'focus-search' ? 'focus-search' : 'focus') as PanelSurface,
                walkHistoryIndices
            })
            break
        }
        case NAV_TRANSITION_ACTIONS.BACKTRACK: {
            const current = _readNavSnapshot()
            if (payload.step != null && payload.step < 0) {
                const history = [...current.walkHistoryIndices]
                if (history.length > 0) history.pop()
                writeNavStateMirror({ walkHistoryIndices: history })
            } else {
                // step === 0 or unset: no-op (state stays)
                readNavMirrorValue() // touch writable for subscriber contract
            }
            break
        }
        case NAV_TRANSITION_ACTIONS.SET_DEPTH:
            writeNavStateMirror({ trailDepth: payload.depth ?? 0 })
            break
        case NAV_TRANSITION_ACTIONS.ENTER_INSIDE:
            writeNavStateMirror({
                mode: 'inside' as NavMode,
                surface: 'inside' as PanelSurface
            })
            break
        case NAV_TRANSITION_ACTIONS.EXIT_INSIDE: {
            const current = _readNavSnapshot()
            const focused = current.focusedIndex != null
            writeNavStateMirror({
                mode: focused ? ('focus' as NavMode) : ('overview' as NavMode),
                surface: focused ? ('focus' as PanelSurface) : ('idle' as PanelSurface)
            })
            break
        }
        case NAV_TRANSITION_ACTIONS.RESET_FOCUS:
            writeNavStateMirror({
                focusedIndex: null,
                trailSeedIndex: null,
                trailNeighborIndices: [],
                trailCursor: -1,
                walkHistoryIndices: [],
                lastTraversalReason: null
            })
            break
        case NAV_TRANSITION_ACTIONS.RESET_EXPERIENCE:
            resetNavState()
            break
        case NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY:
            writeNavStateMirror({
                explorationHistoryIndices: Array.isArray(payload.restoreHistoryIndices)
                    ? payload.restoreHistoryIndices.filter((value: unknown) => Number.isFinite(value))
                    : []
            })
            break
        case NAV_TRANSITION_ACTIONS.RESET:
            resetNavState()
            break
    }

    return {
        ok: true,
        previousMode,
        nextMode: _readNavSnapshot().mode
    }
}
