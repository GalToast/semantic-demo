/**
 * @lib/stores/navigation/navigation-state.svelte.ts — Core navigation state
 *
 * Manages the navigation state mirror, store factory, derived getters,
 * and state mutation helpers. This is the single source of truth for
 * "where the user is" in the application.
 */
import type { NavState, NavMode } from '@lib/types/state'
import { get, type Readable } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { createStateMirror } from '@lib/state/create-state-mirror'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { SELECTION_DEPENDENT_MODES } from '@lib/navigation/mode-affordances'

// ── Configuration Constants (from state.js) ──────────────────────────────────

export const NAVIGATION_CONFIG = {
    /** Scene reveal duration (ms). */
    SCENE_REVEAL_DURATION_MS: 1650,
    /** Loading minimum visible duration (ms). */
    LOADING_MIN_VISIBLE_MS: 1320,
    /** Base auto-rotate speed. */
    AUTO_ROTATE_BASE_SPEED: 0.34,
    /** Delay before auto-rotate resumes after idle (ms). */
    AUTO_ROTATE_IDLE_MS: 3600,
    /** Delay before auto-rotate resumes after manual interaction (ms). */
    AUTO_ROTATE_MANUAL_IDLE_MS: 5200,
    /** Duration of the soft resume ramp (ms). */
    AUTO_ROTATE_SOFT_RESUME_MS: 1800,
    /** Mycelium mode descriptions. */
    MODE_DESCRIPTIONS: {} as Record<string, string>,
    /** Story prompt descriptions. */
    STORY_DESCRIPTIONS: {} as Record<string, string>
} as const

// ── Initial State ────────────────────────────────────────────────────────────

export const INITIAL_NAV_STATE: NavState = {
    mode: 'overview',
    surface: 'idle',
    previousSurface: 'idle',
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
    focusPocketIndices: [],
    focusPocketMeta: null,
    focusPocketRoleByIndex: new Map(),
    focusFramingMeta: null,
    currentPersonality: null,
    neighborhoodIndices: [],
    explorationHistoryIndices: [],
    currentView: 'galaxy',
    myceliumMode: 'dormant',
    autoRotate: false,
    autoRotateSuspended: false,
    trailDepthFromExploration: 0,
    sceneRevealActive: false,
    sceneRevealStartedAt: 0,
    loadingPhaseKey: 'records',
    applyingUrlState: false,
    restoringBrowserHistory: false,
    urlStateRestoreToken: 0,
    activeStoryPrompt: null
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Read the current NavState from the kernel.
 *
 * The callable `navMirror()` returns this on every invocation — so parity-attrs
 * readers (which call `navStore()`) get a value that reflects the latest
 * appState.navState at call time, not a stale snapshot from a writable.
 */
export function _readNavSnapshot(): NavState {
    return appState.navState
}

// W-view-commit: last view committed through the canonical mirror API
// (see writeNavStateMirror). Used by the SEARCH_FOCUS_TRANSITION_SETTLED
// re-assert in triggers.ts.
let _lastCommittedView: 'galaxy' | 'map' = 'galaxy'
export function getLastCommittedView(): 'galaxy' | 'map' {
    return _lastCommittedView
}

/**
 * The navigation mirror.
 *
 * The `storageKey` MUST be the deterministic string below — tests using
 * `delete window['__SEMANTIC_EXPLORER_NAV_MIRROR__']` rely on a predictable
 * key to reset the cross-chunk singleton between cases. Do NOT replace with a
 * random suffix.
 *
 * Bindings table: every field that has a matching kernel top-level slot that
 * the UI imperative readers (body.data-attrs, URL state restore) read from.
 * Fields with `null` are navState-local only — they don't need to be mirrored
 * back after a factory update because they only live in appState.navState.
 *
 * `trailDepth` still mirrors its legacy top-level slot. `currentView` is a
 * direct alias over `navState.currentView`, so it intentionally has no flat
 * binding: replaying it from a partial snapshot can overwrite a newer view.
 */
const navMirror = createStateMirror<NavState>({
    computeFromAppState: _readNavSnapshot,
    storageKey: '__SEMANTIC_EXPLORER_NAV_MIRROR__',
    bindings: {
        mode: null,
        surface: null,
        previousSurface: null,
        focusedIndex: null,
        trailSeedIndex: null,
        trailNeighborIndices: null,
        trailCursor: null,
        trailDepth: 'trailDepth',
        walkHistoryIndices: null,
        lastTraversalReason: null,
        threadCandidates: null,
        threadReasonByIndex: null,
        threadSource: null,
        focusPocketIndices: null,
        focusPocketMeta: null,
        focusPocketRoleByIndex: null,
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: null,
        explorationHistoryIndices: null,
        // `currentView` is already a direct alias over `appState.navState.currentView`.
        // Do not mirror it back as a flat field on every partial nav update:
        // focus/map teardown writes (for example FocusPocket cleanup) can carry
        // a stale full snapshot and otherwise replay `galaxy` over a just-committed
        // map switch. Explicit currentView patches already mutate navState below.
        currentView: null,
        myceliumMode: null,
        autoRotate: null,
        autoRotateSuspended: null,
        trailDepthFromExploration: null,
        sceneRevealActive: null,
        sceneRevealStartedAt: null,
        loadingPhaseKey: null,
        applyingUrlState: null,
        restoringBrowserHistory: null,
        urlStateRestoreToken: null,
        activeStoryPrompt: null
    }
})

// ── NavStore API ─────────────────────────────────────────────────────────────
// navStore is a hybrid: callable as navStore() for Svelte 5 rune consumers,
// and satisfies Readable<NavState> + .update()/.set() for .ts orchestration consumers.

/** NavStore type: callable function that also satisfies Readable + Writable-ish. */
export type NavStoreApi = (() => NavState) &
    Readable<NavState> & {
        update(_fn: (_s: NavState) => NavState): void
        set(_value: NavState): void
    }

/** Backward-compat alias used by barrel exports. */
export type NavStoreState = NavStoreApi

/**
 * Build the NavStoreApi over the factory mirror.
 *
 * The callable body reads from appState.navState on every call (factory behaviour
 * via _readNavSnapshot). update/set delegate to bridge helpers that:
 *   1. apply the mutation to the factory (which writes to the writable and runs
 *      the binding mirror for kernel top-level fields), and
 *   2. Object.assign the result into appState.navState so that readers which
 *      captured a reference to that object (selectors, imperative engine code)
 *      observe the change immediately.
 */
function _applyNavUpdate(fn: (_current: NavState) => NavState): void {
    const current = _readNavSnapshot()
    const next = fn(current)
    navMirror.update(() => next)
    Object.assign(appState.navState, next)
    if (typeof next.trailDepth === 'number') appState.trailDepth = next.trailDepth
    if (next.currentView === 'galaxy' || next.currentView === 'map') {
        appState.currentView = next.currentView
    }
}

function _createNavStore(): NavStoreApi {
    const fn = (() => _readNavSnapshot()) as NavStoreApi
    fn.subscribe = navMirror.subscribe
    fn.update = _applyNavUpdate
    fn.set = (value: NavState) => {
        navMirror.set(value)
        Object.assign(appState.navState, value)
        if (typeof value.trailDepth === 'number') appState.trailDepth = value.trailDepth
        if (value.currentView === 'galaxy' || value.currentView === 'map') {
            appState.currentView = value.currentView
        }
    }
    return fn
}

/** Single reactive instance of the navigation state. */
export const navStore: NavStoreApi = _createNavStore()

/**
 * Read the current value from the nav mirror writable (subscriber contract touch).
 * Used by mode-transitions dispatchNavTransition BACKTRACK case.
 */
export function readNavMirrorValue(): NavState {
    return get(navMirror)
}

// ── Derived Getters (Svelte 5 requires getters for module-level reactive exports) ──

export const isOverview = () => _readNavSnapshot().mode === 'overview'
export const isExploration = () => {
    const m = _readNavSnapshot().mode
    return SELECTION_DEPENDENT_MODES.has(m)
}
export const hasFocus = () => {
    const local = _readNavSnapshot()
    return SELECTION_DEPENDENT_MODES.has(local.mode) || local.focusedIndex !== null
}
export const hasTrail = () => _readNavSnapshot().trailDepth > 0
export const currentMode = (): string => _readNavSnapshot().mode ?? 'overview'
export const currentSurface = (): string => _readNavSnapshot().surface ?? 'overview'
export const focusedIndex = () => {
    const local = _readNavSnapshot().focusedIndex
    return local != null && Number.isFinite(local) ? local : null
}
export const currentView = (): string => _readNavSnapshot().currentView
export const myceliumMode = () => _readNavSnapshot().myceliumMode
export const isMapMode = () => _readNavSnapshot().currentView === 'map'
export const loadingPhase = () => _readNavSnapshot().loadingPhaseKey

// ── State Mutation Helpers ───────────────────────────────────────────────────

/**
 * Write a partial NavState patch to BOTH legacy appState.navState AND the Svelte 5
 * navStore in a single call. Use this instead of direct `appState.navState.X = ...`
 * writes so that the Svelte 5 store — and therefore body data-attrs — stay in sync.
 */
export function writeNavStateMirror(patch: Partial<NavState>): void {
    const current = _readNavSnapshot()

    // W-view-commit: record the last view committed through the canonical
    // mirror API (user switches, engine SET_VIEW mirrors, resets). The
    // focus-settle reconciliation can clobber currentView through a raw
    // Svelte-$state write that bypasses this API entirely; the
    // SEARCH_FOCUS_TRANSITION_SETTLED subscriber re-asserts this committed
    // value after the settle (see triggers.ts).
    if (patch.currentView === 'galaxy' || patch.currentView === 'map') {
        _lastCommittedView = patch.currentView
    }

    let noop = true
    for (const key in patch) {
        if (
            (patch as unknown as Record<string, unknown>)[key] !== (current as unknown as Record<string, unknown>)[key]
        ) {
            noop = false
            break
        }
    }
    if (noop) return

    const previousView = current.currentView

    navMirror.update((current) => {
        {
            Object.assign(appState.navState, patch)
            if (typeof patch.trailDepth === 'number') {
                appState.trailDepth = patch.trailDepth
            }
            if (patch.currentView === 'galaxy' || patch.currentView === 'map') {
                appState.currentView = patch.currentView
            }
        }
        return { ...current, ...patch }
    })

    if (typeof patch.currentView === 'string') {
        if (patch.currentView !== previousView) {
            publish(EVENTS.VIEW_CHANGED, {
                view: patch.currentView,
                previousView,
                myceliumMode: appState.myceliumMode || undefined
            })
        }
    }
}

/** Reset navigation state to initial values. */
export function resetNavState(): void {
    writeNavStateMirror({ ...INITIAL_NAV_STATE })
}

/** Generic state update (wrapped in $state assignment). */
export function updateNavState(patch: Partial<NavState>): void {
    writeNavStateMirror(patch)
}

/** Set the focused node index */
export function setFocusedIndex(index: number | null): void {
    writeNavStateMirror({ focusedIndex: index })
}

/** Set the navigation mode. */
export function setNavMode(mode: NavMode): void {
    writeNavStateMirror({ mode })
}

/** Set the current neighborhood index list. */
export function setNeighborhoodIndices(indices: number[]): void {
    writeNavStateMirror({ neighborhoodIndices: [...indices] })
}

/** Set the exploration history index list. */
export function setExplorationHistoryIndices(indices: number[]): void {
    writeNavStateMirror({ explorationHistoryIndices: [...indices] })
}

/** Enable or disable auto-rotation. */
export function setAutoRotate(active: boolean): void {
    writeNavStateMirror({ autoRotate: active })
}

/** Suspend auto-rotation (e.g. during hover/interaction). */
export function suspendAutoRotate(): void {
    writeNavStateMirror({ autoRotateSuspended: true })
}

/** Resume auto-rotation. */
export function resumeAutoRotate(): void {
    writeNavStateMirror({ autoRotateSuspended: false })
}

/** Set the mycelium mode (dormant|active|overdrive). */
export function setMyceliumMode(mode: string, _options?: Record<string, unknown>): void {
    writeNavStateMirror({ myceliumMode: mode })
}

/** Set focus pocket specific indices. */
export function setFocusPocketIndices(_indices: number[]): void {
    // Implementation for focus pocket state
}

/** Clear focus pocket indices. */
export function clearFocusPocketIndices(): void {
    // Implementation for focus pocket state
}

/** Set focus pocket metadata. */
export function setFocusPocketMeta(_meta: unknown): void {
    // Implementation for focus pocket state
}

/** Clear focus pocket metadata. */
export function clearFocusPocketMeta(): void {
    // Implementation for focus pocket state
}
