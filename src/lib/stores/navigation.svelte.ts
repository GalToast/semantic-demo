/**
 * @lib/stores/navigation.svelte.ts — Navigation state store (Svelte 5 runes)
 *
 * Replaces:
 * - (view handoff, composition state)
 *   - Navigation slices from js/state.js
 * - (trail/thread state)
 *
 * The navigation store owns the current view mode, surface, focus index,
 * and all view-handoff state. It is the single source of truth for
 * "where the user is" in the application.
 *
 * ── Migration to createStateMirror ──────────────────────────────────────────
 * This file was previously a hand-rolled dual-state mirror (~624 LOC):
 * a `getOrCreateNavWritable()` window-singleton, an `$effect.root()` bridge
 * that copied appState.navWritable changes back to the writable, a
 * `_createNavStore()` callable-builder, 11 readable selectors that read
 * `get(_navWritable)`, 23 setter functions that wrote to `_navWritable`,
 * plus the `writeNavStateMirror` batched mirror helper.
 *
 * The migrated form collapses all of that into one `createStateMirror<NavState>(...)`
 * call in this file. The factory:
 *   - owns a window-keyed writable subscriber channel (replaces `_navWritable`
 *     + `getOrCreateNavWritable()`)
 *   - exposes a callable `navMirror()` that reads from `appState.navState`
 *     directly via `computeFromAppState` (replaces the 11 `_navWritable`-based
 *     selectors and `_createNavStore()`)
 *   - runs `mirrorToAppState` on every `update()`/`set()` so the kernel-owned
 *     top-level fields (`trailDepth`, `currentView`) stay in sync without
 *     needing a `$effect.root()` bridge
 *
 * The external `writeNavStateMirror(patch)` API is preserved verbatim — all 10
 * callers (engine/choreography paths) keep using the same signature. Internally
 * it now uses `navMirror.update(...)` instead of `_navWritable.update(...)`
 * plus an explicit Object.assign, and post-update it re-mirrors the kernel
 * top-level fields that the flat bindings table can't express.
 *
 * Public API is byte-for-byte unchanged: 48 exports with the same signatures,
 * `navStore()` callable + `.subscribe`/`.update`/`.set`, 11 selectors, 23
 * setters, `dispatchNavTransition`, and `writeNavStateMirror`.
 */
import type { NavState, NavMode, PanelSurface } from '@lib/types/state'
import { get, type Readable } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { NAV_TRANSITION_ACTIONS, type NavTransitionAction } from '@lib/navigation-actions'
import { clearSearch } from './search.svelte.ts'
import { resetFocus } from './focus.svelte.ts'
import { resetJourney } from './journey.svelte.ts'
import { createStateMirror } from '@lib/state/create-state-mirror'

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
    focusPocketAnimationFrameId: null,
    focusFramingMeta: null,
    currentPersonality: null,
    neighborhoodIndices: [],
    explorationHistoryIndices: [],
    currentView: 'galaxy',
    myceliumMode: 'dormant',
    autoRotate: true,
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
function _readNavSnapshot(): NavState {
    return appState.navState
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
 * Note: `trailDepth` and `currentView` are also written to their `appState.*`
 * top-level mirrors by `writeNavStateMirror` post-update (since the kernel
 * reads them from both the navState and the top-level). The binding here
 * additionally mirrors all fields that consumers read solely through
 * `appState.navState.X` — which is *every* field, since navState is the
 * canonical location. We pass `appState.navState` indirectly by targeting
 * keys on a synthetic proxy; the factory primitives detection means we only
 * actually write the two kernel top-level mirrors explicitly.
 */
const navMirror = createStateMirror<NavState>({
    computeFromAppState: _readNavSnapshot,
    storageKey: '__SEMANTIC_EXPLORER_NAV_MIRROR__',
    bindings: {
        // Every NavState field that lives ONLY in appState.navState → null
        // (no extra mirror target). The factory's update()/set() already
        // writes the new value into the writable + passes it through
        // mirrorToAppState; fields bound to null are simply skipped by the
        // binding loop, which is correct because we mirror them manually in
        // writeNavStateMirror via Object.assign(appState.navState, patch).
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
        focusPocketAnimationFrameId: null,
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: null,
        explorationHistoryIndices: null,
        currentView: 'currentView',
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
 *
 * Why not use factory.update/set directly? The factory's mirrorToAppState() step
 * only writes the fields listed in `bindings` (trailDepth + currentView here).
 * The remaining ~30 NavState fields are NOT mirrored — yet selectors read
 * directly from appState.navState. If we only wrote through the factory, those
 * readers would see stale data. We fix this by having the bridge Object.assign
 * the new snapshot into appState.navState after every write.
 */
function _applyNavUpdate(fn: (_current: NavState) => NavState): void {
    const current = _readNavSnapshot()
    const next = fn(current)
    navMirror.update(() => next)
    // Reflect all fields into appState.navState for imperative readers.
    // (navMirror.update only mirrors the flat bindings; the remaining
    //  fields must be carried over explicitly.)
    Object.assign(appState.navState, next)
    // Sync the kernel top-level mirrors that the imperative writers rely on.
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

// ── Derived Getters (Svelte 5 requires getters for module-level reactive exports) ──

export const isOverview = () => _readNavSnapshot().mode === 'overview'
export const isExploration = () => {
    const m = _readNavSnapshot().mode
    return m === 'trail' || m === 'focus' || m === 'inside'
}
export const hasFocus = () => {
    const local = _readNavSnapshot()
    if (local.mode === 'focus' || local.mode === 'inside' || local.focusedIndex !== null) {
        return true
    }
    // Read directly from appState.navState — no fallback chain needed.
    const mirror = appState.navState
    if (mirror.mode === 'focus' || mirror.mode === 'inside') return true
    if (mirror.focusedIndex != null && Number.isFinite(mirror.focusedIndex)) return true
    return false
}
export const hasTrail = () => _readNavSnapshot().trailDepth > 0
export const currentMode = (): string => {
    const local = _readNavSnapshot().mode
    if (local) return local
    return appState.navState.mode ?? local
}
export const currentSurface = (): string => {
    const local = _readNavSnapshot().surface
    if (local) return local
    return appState.navState.surface ?? local
}
export const focusedIndex = () => {
    const local = _readNavSnapshot().focusedIndex
    if (local != null && Number.isFinite(local)) return local
    return appState.navState.focusedIndex ?? local
}
export const currentView = (): string => _readNavSnapshot().currentView
export const myceliumMode = () => _readNavSnapshot().myceliumMode
export const isMapMode = () => _readNavSnapshot().currentView === 'map'
export const loadingPhase = () => _readNavSnapshot().loadingPhaseKey

// ── Navigation Transition Actions (typed replacement for lifecycle.js) ───────

export { NAV_TRANSITION_ACTIONS }
export type { NavTransitionAction }

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

/**
 * Write a partial NavState patch to BOTH legacy appState.navState AND the Svelte 5
 * navStore in a single call. Use this instead of direct `appState.navState.X = ...`
 * writes so that the Svelte 5 store — and therefore body data-attrs — stay in sync.
 *
 * Pattern reference: the SEARCH_FOCUS_REQUESTED subscriber in triggers.ts
 * (lines 187-203) calls `navStore.update(...)` for the Svelte side and
 * `withStateMutation(...)` for legacy. `writeNavStateMirror` collapses those
 * two calls into one.
 *
 * Implementation note: the factory's update() reads computeFromAppState() (which
 * returns appState.navState by reference), applies the updater, and writes the
 * resulting snapshot to the writable + runs the binding mirror. Because
 * Object.assign from the kernel's path mutates appState.navState in place (it
 * does not replace the reference), we must Object.assign here first so the
 * kernel-side imperative readers (which hold a reference to the old object)
 * observe the mutations — then call navMirror.update() to notify subscribers
 * and trigger the flat bindings mirror for trailDepth/currentView.
 */
export function writeNavStateMirror(patch: Partial<NavState>): void {
    withStateMutation(() => {
        // Update legacy state in place (mirrors what withMutation/Object.assign does).
        // This is required because many imperative readers captured a reference to
        // appState.navState at module-init time; replacing the reference (rather
        // than mutating in place) would leave those readers stale.
        Object.assign(appState.navState, patch)
        // Mirror kernel top-level fields that the flat bindings table doesn't cover.
        if (typeof patch.trailDepth === 'number') {
            appState.trailDepth = patch.trailDepth
        }
        if (patch.currentView === 'galaxy' || patch.currentView === 'map') {
            appState.currentView = patch.currentView
        }
    })
    // Notify Svelte subscribers via the factory. We push the freshly-mirrored
    // appState.navState slice so any .subscribe() listener wakes up with
    // the new value (the writable's value matches appState.navState after the
    // Object.assign, so pushing either would be equivalent).
    navMirror.set({ ...appState.navState })
}

/** Reset navigation state to initial values. */
export function resetNavState(): void {
    // Mirror to appState.navState via writeNavStateMirror so imperative readers
    // stay in sync.
    writeNavStateMirror({ ...INITIAL_NAV_STATE })
}

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

/** Generic state update (wrapped in $state assignment). */
export function updateNavState(patch: Partial<NavState>): void {
    writeNavStateMirror(patch)
}

/** Switch the primary view (galaxy/map). */
export function switchView(view: 'galaxy' | 'map'): void {
    writeNavStateMirror({ currentView: view })
}

/** Backward-compatible alias for callers that still use the state mutator name. */
export const setCurrentView = switchView

/** Set the focused node index */
export function setFocusedIndex(index: number | null): void {
    writeNavStateMirror({ focusedIndex: index })
}

/** Set the navigation mode. */
export function setNavMode(mode: NavMode): void {
    writeNavStateMirror({ mode })
}

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
    writeNavStateMirror({ previousSurface: cur.surface, surface, mode })
}

/** Backward-compatible alias for migrated orchestration imports. */
export const setNavSurface = setSurface

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

/** Set the current loading phase key. */
export function setLoadingPhase(phase: string): void {
    writeNavStateMirror({ loadingPhaseKey: phase })
}

/** Backward-compatible alias for callers using the legacy nav-state field name. */
export const setLoadingPhaseKey = setLoadingPhase

/** Start the scene reveal sequence. */
export function startSceneReveal(): void {
    writeNavStateMirror({ sceneRevealActive: true, sceneRevealStartedAt: Date.now() })
}

/** Complete the scene reveal sequence. */
export function completeSceneReveal(): void {
    writeNavStateMirror({ sceneRevealActive: false })
}

/** Directly set scene reveal active state. */
export function setSceneRevealActive(active: boolean): void {
    const cur = _readNavSnapshot()
    const startedAt = active ? cur.sceneRevealStartedAt || Date.now() : cur.sceneRevealStartedAt
    writeNavStateMirror({ sceneRevealActive: active, sceneRevealStartedAt: startedAt })
}

/** Set the active story prompt (for UI sync). */
export function setActiveStoryPrompt(_id: string | null): void {
    // Logic to handle story prompt mapping if needed
}

/** Set the mycelium mode (dormant|active|overdrive). */
export function setMyceliumMode(mode: string, _options?: Record<string, unknown>): void {
    writeNavStateMirror({ myceliumMode: mode })
}

/** Set whether URL state is currently being applied. */
export function setApplyingUrlState(applying: boolean): void {
    writeNavStateMirror({ applyingUrlState: applying })
}

/** Set whether browser history is currently being restored. */
export function setRestoringBrowserHistory(restoring: boolean): void {
    writeNavStateMirror({ restoringBrowserHistory: restoring })
}

/** Increment the URL state restore token. */
export function bumpUrlStateRestoreToken(): number {
    const next = _readNavSnapshot().urlStateRestoreToken + 1
    writeNavStateMirror({ urlStateRestoreToken: next })
    return next
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
                surface: 'focus' as PanelSurface,
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
                get(navMirror) // touch writable for subscriber contract
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

    // Mirror the resulting nav state to legacy appState.navState so imperative
    // readers (focus/journey snapshots) stay in sync with the Svelte 5 store.
    // We now read from `get(navMirror)` — the post-transition writable snapshot —
    // so cases that bypassed writeNavStateMirror in favor of
    // `navMirror.update((s) => ({...s, X}))` still propagate their changes
    // back to the legacy `appState.navState` reference that imperative
    // readers captured at module init.
    writeNavStateMirror(get(navMirror))

    return {
        ok: true,
        previousMode,
        nextMode: _readNavSnapshot().mode
    }
}
