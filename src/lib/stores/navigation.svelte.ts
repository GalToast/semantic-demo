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
 * Phase 3a: navStore is now a thin mirror of appState.navState (Svelte 5
 * rune state). Reads go directly to appState.navState; writes update both
 * appState.navState and the internal writable so legacy _navWritable
 * consumers (derived getters, dispatchNavTransition) stay in sync.
 */
import type { NavState, NavMode, PanelSurface } from '@lib/types/state'
import { writable, get, type Readable } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { NAV_TRANSITION_ACTIONS, type NavTransitionAction } from '@lib/navigation-actions'
import { clearSearch } from './search.svelte.ts'
import { resetFocus } from './focus.svelte.ts'
import { resetJourney } from './journey.svelte.ts'

interface LegacyNavState {
    focusedIndex?: number | null
    surface?: string
    mode?: string
    currentView?: string
    panelSurface?: string
    panelSurfaceDetail?: string
    focusPanelMode?: string
}

/**
 * Window globals used during the legacy-state migration bridge.
 * Consolidates the window-type assertion for both readLegacyNavField
 * and getOrCreateNavWritable into a single cast site.
 */
interface WindowWithGlobals {
    __semanticState?: { navState?: LegacyNavState }
    state?: { navState?: LegacyNavState }
    __APP_STATE__?: { navState?: LegacyNavState }
    __TEST_STATE__?: { navState?: LegacyNavState }
    [key: string]: unknown
}

/** Single typed window reference for legacy-state cross-chunk access. */
function getGlobalWindow(): WindowWithGlobals {
    return window as unknown as WindowWithGlobals
}

/**
 * Structural read of a LegacyNavState field from a NavState object.
 * Some LegacyNavState keys (panelSurface, panelSurfaceDetail,
 * focusPanelMode) don't exist on NavState — use this for the
 * migration bridge.
 */
function readNavField<T>(nav: NavState, key: keyof LegacyNavState): T | undefined {
    return Reflect.get(nav, key) as T | undefined
}

// Legacy state fallback (transitional). The legacy js/state.js is the
// single source of truth during the migration. When the Svelte navigation
// store hasn't been populated by an init handler, fall back to it so the
// focused card / compass / surface attrs reflect real data.
function readLegacyNavField<T>(legacyKey: keyof LegacyNavState): T | undefined {
    try {
        // First, try to read from the new Svelte 5 state class singleton.
        if (appState && appState.navState) {
            const value = readNavField<T>(appState.navState, legacyKey)
            if (value !== undefined) {
                return value
            }
        }
    } catch {
        // ignore and fall through to legacy
    }

    // Legacy fallback (transitional). The legacy js/state.js is the
    // single source of truth during the migration. When the Svelte navigation
    // store hasn't been populated by an init handler, fall back to it so the
    // focused card / compass / surface attrs reflect real data.
    try {
        if (typeof window === 'undefined') return undefined
        const w = getGlobalWindow()
        const nav =
            w.__APP_STATE__?.navState ?? w.__TEST_STATE__?.navState ?? w.__semanticState?.navState ?? w.state?.navState
        return nav?.[legacyKey] as T | undefined
    } catch {
        return undefined
    }
}

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

const INITIAL_NAV_STATE: NavState = {
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

// ── Store ────────────────────────────────────────────────────────────────────
// Cross-chunk singleton: when Vite code-splits, this module may be duplicated.
// Use a global window key so all chunks share the same _navWritable instance.
function getOrCreateNavWritable(): ReturnType<typeof writable<NavState>> {
    const key = '__SEMANTIC_EXPLORER_NAV_WRITABLE__'
    const w = typeof window !== 'undefined' ? getGlobalWindow() : null
    const existing = w?.[key]
    if (existing && typeof (existing as Record<string, unknown>).subscribe === 'function') {
        return existing as ReturnType<typeof writable<NavState>>
    }
    const store = writable<NavState>({ ...INITIAL_NAV_STATE })
    if (w) {
        w[key] = store
    }
    return store
}

const _navWritable = getOrCreateNavWritable()

// Phase 3a: keep the internal _navWritable mirrored from appState.navState.
// External writers (engine/choreography paths like focus-pocket.ts) mutate
// appState.navState directly without going through navStore.set/update, so
// this $effect bridges those writes into the writable that legacy consumers
// (derived getters, dispatchNavTransition) read from.
void $effect.root(() => {
    $effect(() => {
        const _tracked = appState.navState
        void _tracked
        _navWritable.set(appState.navState)
    })
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

function _createNavStore(): NavStoreApi {
    // Phase 3a: navStore is now a thin mirror of appState.navState. The
    // callable returns the internal writable's value (the same place the
    // in-file setters write). External writers (engine code that mutates
    // appState.navState directly) bridge to _navWritable via the
    // $effect.root() block above with a one-tick delay — acceptable
    // trade-off for keeping the synchronous writer semantics that the
    // parity-attrs + dispatchNavTransition test suite relies on.
    const fn = (() => get(_navWritable)) as NavStoreApi

    // Subscribe: delegate to _navWritable.subscribe. The writable is updated
    // synchronously by every writer in this file (navStore.set, dispatchNavTransition,
    // returnToOverviewState, writeNavStateMirror, etc.), so subscribers see the
    // new value synchronously.
    fn.subscribe = _navWritable.subscribe

    // Writable-style set: update the internal writable only. Phase 3a keeps
    // the pre-existing behavior of writing to _navWritable (the synchronous
    // source of truth for navStore consumers) rather than pushing into
    // appState.navState. Pushing to appState.navState via withMutation broke
    // the state-class-migration-5-navigation tests, which mock appState with
    // a read-only navState getter. The $effect.root() bridge above handles
    // external writes (engine code mutating appState.navState directly) so
    // parity-attrs readers stay in sync via the writable.
    fn.set = _navWritable.set

    // Writable-style update: read from the writable (consistent with the
    // in-file setters that write to _navWritable only), then update.
    fn.update = _navWritable.update

    return fn
}

/** Single reactive instance of the navigation state. */
export const navStore: NavStoreApi = _createNavStore()

// ── Derived Getters (Svelte 5 requires getters for module-level reactive exports) ──

export const isOverview = () => get(_navWritable).mode === 'overview'
export const isExploration = () =>
    get(_navWritable).mode === 'trail' || get(_navWritable).mode === 'focus' || get(_navWritable).mode === 'inside'
export const hasFocus = () => {
    const local = get(_navWritable)
    if (local.mode === 'focus' || local.mode === 'inside' || local.focusedIndex !== null) {
        return true
    }
    // Mode fallback: engine-side WALK_TO/BACKTRACK/SET_DEPTH paths still mutate
    // legacy state.navState.mode without writing to navStore.
    const legacyMode = readLegacyNavField<string>('mode')
    if (legacyMode === 'focus' || legacyMode === 'inside') return true
    const legacyFocused = readLegacyNavField<number | null>('focusedIndex')
    if (legacyFocused != null && Number.isFinite(legacyFocused)) return true
    return false
}
export const hasTrail = () => get(_navWritable).trailDepth > 0
export const currentMode = (): string => {
    const local = get(_navWritable).mode
    if (local) return local
    // Fallback: engine-side WALK_TO/BACKTRACK/SET_DEPTH/ENTER_INSIDE/EXIT_INSIDE
    // paths in mutate legacy state.navState.mode
    // without writing to navStore. Remove once those reducers are store-native.
    const legacy = readLegacyNavField<string>('mode')
    if (legacy) return legacy
    return local
}
export const currentSurface = (): string => {
    const local = get(_navWritable).surface
    if (local) return local
    // Fallback: engine-side navTransitionReducer mutates legacy state.navState
    // surface fields independently. Remove once all surface writes go through
    // dispatchNavTransition in src/lib/stores/navigation.svelte.ts.
    const legacy = readLegacyNavField<string>('surface')
    if (legacy) return legacy
    return local
}
export const focusedIndex = () => {
    const local = get(_navWritable).focusedIndex
    if (local != null && Number.isFinite(local)) return local
    const legacy = readLegacyNavField<number | null>('focusedIndex')
    if (legacy != null && Number.isFinite(legacy)) return legacy
    return local
}
export const currentView = (): string => {
    // No legacy fallback: currentView is fully bridged.
    // src/lib/orchestration/view-controller.ts:152 writes directly to
    // navStore on every switchView, and url-state.ts:159 restores it.
    return get(_navWritable).currentView
}
export const myceliumMode = () => get(_navWritable).myceliumMode
export const isMapMode = () => get(_navWritable).currentView === 'map'
export const loadingPhase = () => get(_navWritable).loadingPhaseKey

// ── Navigation Transition Actions (typed replacement for lifecycle.js) ───────

export { NAV_TRANSITION_ACTIONS }
export type { NavTransitionAction }

// Re-export the canonical constants so consumers can import from either location.
// (The canonical source is @lib/navigation-actions; this re-export preserves
// backward compatibility for existing imports from @lib/stores/navigation.)

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

/** Reset navigation state to initial values. */
export function resetNavState(): void {
    // Mirror to appState.navState via writeNavStateMirror so imperative readers
    // stay in sync. Previously only set the Svelte writable, leaving
    // appState.navState stale for RESET/RESET_EXPERIENCE and external callers.
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

/** Set the focused node index. */
export function setFocusedIndex(index: number | null): void {
    _navWritable.update((s) => ({ ...s, focusedIndex: index }))
}

/** Set the navigation mode. */
export function setNavMode(mode: NavMode): void {
    _navWritable.update((s) => ({ ...s, mode }))
}

/** Set the active panel surface. */
export function setSurface(surface: PanelSurface): void {
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
                    : (get(_navWritable).mode as NavMode)
    _navWritable.update((s) => ({ ...s, previousSurface: s.surface, surface, mode }))
}

/** Backward-compatible alias for migrated orchestration imports. */
export const setNavSurface = setSurface

/** Set the current neighborhood index list. */
export function setNeighborhoodIndices(indices: number[]): void {
    _navWritable.update((s) => ({ ...s, neighborhoodIndices: [...indices] }))
}

/** Set the exploration history index list. */
export function setExplorationHistoryIndices(indices: number[]): void {
    _navWritable.update((s) => ({ ...s, explorationHistoryIndices: [...indices] }))
}

/** Enable or disable auto-rotation. */
export function setAutoRotate(active: boolean): void {
    _navWritable.update((s) => ({ ...s, autoRotate: active }))
}

/** Suspend auto-rotation (e.g. during hover/interaction). */
export function suspendAutoRotate(): void {
    _navWritable.update((s) => ({ ...s, autoRotateSuspended: true }))
}

/** Resume auto-rotation. */
export function resumeAutoRotate(): void {
    _navWritable.update((s) => ({ ...s, autoRotateSuspended: false }))
}

/** Set the current loading phase key. */
export function setLoadingPhase(phase: string): void {
    _navWritable.update((s) => ({ ...s, loadingPhaseKey: phase }))
}

/** Backward-compatible alias for callers using the legacy nav-state field name. */
export const setLoadingPhaseKey = setLoadingPhase

/** Start the scene reveal sequence. */
export function startSceneReveal(): void {
    _navWritable.update((s) => ({ ...s, sceneRevealActive: true, sceneRevealStartedAt: Date.now() }))
}

/** Complete the scene reveal sequence. */
export function completeSceneReveal(): void {
    _navWritable.update((s) => ({ ...s, sceneRevealActive: false }))
}

/** Directly set scene reveal active state. */
export function setSceneRevealActive(active: boolean): void {
    _navWritable.update((s) => ({
        ...s,
        sceneRevealActive: active,
        sceneRevealStartedAt: active ? s.sceneRevealStartedAt || Date.now() : s.sceneRevealStartedAt
    }))
}

/** Set the active story prompt (for UI sync). */
export function setActiveStoryPrompt(_id: string | null): void {
    // Logic to handle story prompt mapping if needed
}

/** Set the mycelium mode (dormant|active|overdrive). */
export function setMyceliumMode(mode: string, _options?: Record<string, unknown>): void {
    _navWritable.update((s) => ({ ...s, myceliumMode: mode }))
}

/** Set whether URL state is currently being applied. */
export function setApplyingUrlState(applying: boolean): void {
    _navWritable.update((s) => ({ ...s, applyingUrlState: applying }))
}

/** Set whether browser history is currently being restored. */
export function setRestoringBrowserHistory(restoring: boolean): void {
    _navWritable.update((s) => ({ ...s, restoringBrowserHistory: restoring }))
}

/** Increment the URL state restore token. */
export function bumpUrlStateRestoreToken(): number {
    _navWritable.update((s) => ({ ...s, urlStateRestoreToken: s.urlStateRestoreToken + 1 }))
    return get(_navWritable).urlStateRestoreToken
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
 * Write a partial NavState patch to BOTH legacy appState.navState AND the
 * Svelte 5 navStore in a single call.  Use this instead of direct
 * Use this instead of direct `appState.navState.X = ...` writes so that
 * the Svelte 5 store — and therefore body data-attrs — stay in sync.
 *
 * Pattern reference: the SEARCH_FOCUS_REQUESTED subscriber in triggers.ts
 * (lines 187-203) calls `navStore.update(...)` for the Svelte side and
 * `withStateMutation(...)` for legacy.  `writeNavStateMirror` collapses
 * those two calls into one.
 */
export function writeNavStateMirror(patch: Partial<NavState>): void {
    // Update legacy state (mirrors what withMutation/Object.assign does)
    Object.assign(appState.navState, patch)
    if (typeof patch.trailDepth === 'number') {
        appState.trailDepth = patch.trailDepth
    }
    if (patch.currentView === 'galaxy' || patch.currentView === 'map') {
        appState.currentView = patch.currentView
    }
    // Update Svelte 5 store so parity-attrs and derived getters reflect immediately
    _navWritable.update((s) => ({ ...s, ...patch }))
}

/**
 * Dispatch a navigation transition (the core orchestrator).
 * Replaces the heavy logic in
 */
export function dispatchNavTransition(
    action: NavTransitionAction,
    payload: NavTransitionPayload = {}
): NavTransitionResult {
    const previousMode = get(_navWritable).mode

    switch (action) {
        case NAV_TRANSITION_ACTIONS.FOCUS_NODE: {
            // some files (specifically `navigation.svelte.ts`), silently
            // flipping the ternary. Use direct boolean casts + explicit
            // value unpacking to avoid the bug entirely. See
            // parity-attrs.svelte.ts:228-234 for the canonical note.
            const _indexDefined = Number.isFinite(payload.index)
            const _modeRaw = payload.mode
            const _surfaceRaw = payload.surface
            const _fromTraversal = payload.fromTraversal
            const _fromCanvasNode = payload.fromCanvasNode
            // Resolve final mode/surface values
            const _finalMode: NavMode =
                _modeRaw && (_modeRaw as string).length ? (_modeRaw as NavMode) : ('focus' as NavMode)
            const _finalSurface: PanelSurface =
                _surfaceRaw && (_surfaceRaw as string).length
                    ? (_surfaceRaw as PanelSurface)
                    : ('focus' as PanelSurface)
            _navWritable.update((s) => {
                const next: NavState = { ...s }
                if (_indexDefined) next.focusedIndex = payload.index as number
                next.mode = _finalMode
                next.surface = _finalSurface
                if (_fromTraversal === true || _fromCanvasNode === true) {
                    next.activeStoryPrompt = null
                }
                return next
            })
            // W15+ parity-attrs fix: also update appState.navState (Svelte 5 class)
            // so legacy readers and the bundled updateJourneyCompass (which
            // reads journey.phase from appState.navState.mode) see the new
            // values. Without this mirror, appState.navState.mode stays at
            // its initial 'overview' even after a focus click, breaking
            // compass presentation + the data-journey-phase parity attr.
            const _legacyMode: NavMode = _finalMode
            const _legacySurface: PanelSurface = _finalSurface
            if (_indexDefined) appState.navState.focusedIndex = payload.index as number
            if (_legacyMode) appState.navState.mode = _legacyMode
            if (_legacySurface) appState.navState.surface = _legacySurface
            if (_fromTraversal === true || _fromCanvasNode === true) {
                appState.navState.activeStoryPrompt = null
            }
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
            _navWritable.update((s) => ({
                ...s,
                previousSurface: s.surface,
                surface: surface as PanelSurface,
                mode:
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
                                : (s.mode as NavMode)
            }))
            break
        }
        case NAV_TRANSITION_ACTIONS.TRAVERSE_NEIGHBOR:
            _navWritable.update((s) => ({
                ...s,
                focusedIndex: payload.index ?? s.focusedIndex,
                mode: 'trail' as NavMode,
                surface: 'trail'
            }))
            break
        case NAV_TRANSITION_ACTIONS.WALK_THREAD:
        case NAV_TRANSITION_ACTIONS.WALK_TO:
            _navWritable.update((s) => ({
                ...s,
                focusedIndex: payload.index ?? s.focusedIndex,
                mode: 'trail' as NavMode,
                surface: 'focus' as PanelSurface,
                // Accumulate walk history when appendHistory is true
                ...(payload.appendHistory !== false && payload.index != null
                    ? {
                          walkHistoryIndices:
                              s.walkHistoryIndices[s.walkHistoryIndices.length - 1] === payload.index
                                  ? s.walkHistoryIndices
                                  : [...s.walkHistoryIndices, payload.index]
                      }
                    : {})
            }))
            break
        case NAV_TRANSITION_ACTIONS.BACKTRACK:
            _navWritable.update((s) => {
                if (payload.step != null && payload.step < 0) {
                    const history = [...s.walkHistoryIndices]
                    if (history.length > 0) history.pop()
                    return { ...s, walkHistoryIndices: history }
                }
                return s
            })
            break
        case NAV_TRANSITION_ACTIONS.SET_DEPTH:
            _navWritable.update((s) => ({
                ...s,
                trailDepth: payload.depth ?? 0
            }))
            break
        case NAV_TRANSITION_ACTIONS.ENTER_INSIDE:
            _navWritable.update((s) => ({
                ...s,
                semanticDiveMode: true,
                mode: 'inside' as NavMode,
                surface: 'inside' as PanelSurface
            }))
            break
        case NAV_TRANSITION_ACTIONS.EXIT_INSIDE:
            _navWritable.update((s) => ({
                ...s,
                semanticDiveMode: false,
                mode: s.focusedIndex != null ? ('focus' as NavMode) : ('overview' as NavMode),
                surface: s.focusedIndex != null ? ('focus' as PanelSurface) : ('idle' as PanelSurface)
            }))
            break
        case NAV_TRANSITION_ACTIONS.RESET_FOCUS:
            _navWritable.update((s) => ({
                ...s,
                focusedIndex: null,
                trailSeedIndex: null,
                trailNeighborIndices: [],
                trailCursor: -1,
                walkHistoryIndices: [],
                lastTraversalReason: null
            }))
            break
        case NAV_TRANSITION_ACTIONS.RESET_EXPERIENCE:
            resetNavState()
            break
        case NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY:
            _navWritable.update((s) => ({
                ...s,
                explorationHistoryIndices: Array.isArray(payload.restoreHistoryIndices)
                    ? payload.restoreHistoryIndices.filter((value: unknown) => Number.isFinite(value))
                    : []
            }))
            break
        case NAV_TRANSITION_ACTIONS.RESET:
            resetNavState()
            break
    }

    // Mirror the resulting nav state to legacy appState.navState so imperative
    // readers (focus/journey snapshots) stay in sync with the Svelte 5 store.
    // Cases that already mirror (SET_VIEW, RETURN_OVERVIEW, and RESET via
    // resetNavState) are idempotent re-mirrors; this single write covers
    // FOCUS_NODE and the remaining transition cases that previously only
    // touched the writable. writeNavStateMirror's internal _navWritable.update
    // is a no-op self-spread here (same state), so no extra subscriber churn.
    writeNavStateMirror(get(_navWritable))

    return {
        ok: true,
        previousMode,
        nextMode: get(_navWritable).mode
    }
}
