/**
 * @lib/stores/journey.svelte.ts — Journey orchestration, trail, and thread walker store
 *
 * Architecture (Phase 3c, 2026-06-25):
 *
 * The journeyStore is a deliberate dual-state mirror between a Svelte
 * `writable` (the runtime/source-of-truth for component subscribers) and
 * `appState.navState` (the global Svelte 5 rune state consumed by the
 * kernel, the URL state mirror, and the window.__APP_STATE__ legacy
 * compatibility layer).
 *
 *   ┌──────────────────────┐                ┌────────────────────────┐
 *   │ journeyStore (writable) ──── subscribers ──── Svelte components   │
 *   └────────┬─────────────┘                └────────────────────────┘
 *            │
 *            │ withJourneyNotify() pushes 6 fields:
 *            │   mode, trailCursor, trailDepth,
 *            │   walkHistoryIndices, threadSource, lastTraversalReason
 *            │
 *   ┌────────▼────────────┐                ┌────────────────────────┐
 *   │ appState.navState (rune state) ─────── kernel, URL state, wndow │
 *   └─────────────────────┘                └────────────────────────┘
 *
 * Unlike `navStore` (which has a W11-T4 readLegacyNavField fallback chain),
 * the journeyStore is a forward-only mirror — there is no legacy reader.
 * Mutations go writable → appState; the writable is read by components
 * that subscribe, and by the callable getter `journeyStore()`.
 *
 * Direct appState-only mutations (no journeyStore mirror) exist for fields
 * that the kernel owns outright: focusedIndex, trailSeedIndex,
 * trailNeighborIndices, threadCandidates. These are written directly.
 *
 * Invariant tests:
 *   - tests/unit-active/state-class-migration-6-journey.test.ts — broad
 *     migration contract (17 tests).
 *   - tests/unit-active/journey-store-mirror-contract.test.ts — focused
 *     mirror invariant (13 tests).
 */
import type {
    JourneyState,
    NavMode,
    CompassPhase,
    CompassAction,
    TrailStop,
    WalkHistoryEntry,
    ThreadCandidateRef
} from '@lib/types/state'
import { get, type Readable, writable } from 'svelte/store'
// debugWarn removed — was unused in this store
import { appState } from '@lib/state/app.svelte.ts'
import { writeNavStateMirror } from './navigation.svelte.ts'
import { withNotify } from '@lib/stores/notify'

// ── Configuration Constants (from state.js) ──────────────────────────────────

export const JOURNEY_CONFIG = {
    /** Handoff prelude duration (ms). */
    MAP_HANDOFF_PRELUDE_MS: 430,
    /** Settle duration for terrain landing (ms). */
    TERRAIN_LANDING_SETTLE_MS: 1200,
    /** Long settle duration for deep focus transitions (ms). */
    TERRAIN_LANDING_SETTLE_LONG_MS: 1800,
    /** Delay before late trail refresh on map transition (ms). */
    MAP_TRAIL_REFRESH_LATE_DELAY_MS: 100
} as const

/** Journey milestones in sequence. */
export const JOURNEY_COMPASS_PHASE_ORDER = ['overview', 'search', 'focus', 'inside', 'map']

function valueArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value
    if (value instanceof Map) return [...value.values()]
    if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
        return [...(value as Iterable<unknown>)]
    }
    if (value && typeof value === 'object') return Object.values(value)
    return []
}

function finiteIndexList(value: unknown): number[] {
    return valueArray(value)
        .map((index) => Number(index))
        .filter((index) => Number.isFinite(index))
}

function candidateIndex(candidate: unknown): number | null {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
    if (!candidate || typeof candidate !== 'object') return null
    const index = Number((candidate as { index?: unknown }).index)
    return Number.isFinite(index) ? index : null
}

function candidateIndexList(value: unknown): number[] {
    return valueArray(value)
        .map(candidateIndex)
        .filter((index): index is number => index !== null)
}

// ── Initial State ────────────────────────────────────────────────────────────

/** Internal store state interface. */
export interface JourneyStoreState extends JourneyState {
    terrainHandoffPhase: 'idle' | 'prelude' | 'transition' | 'settle'
    routeExplorationPhase: 'idle' | 'free' | 'searching' | 'focusing'
    routeChoreographyPhase: 'overview' | 'trail' | 'focus' | 'inside' | 'map'
    /** Direct trail depth accessor (mirrors navState.trailDepth). */
    trailDepth: number
    /** Walk history indices (mirrors navState.walkHistoryIndices). */
    walkHistoryIndices: number[]
    /** Trail seed index (mirrors navState.trailSeedIndex). */
    trailSeedIndex: number | null
}

const INITIAL_JOURNEY: JourneyStoreState = {
    phase: 'overview',
    trail: [],
    cursor: -1,
    depth: 0,
    threadCandidates: [],
    threadReasonByIndex: new Map(),
    threadSource: 'geometric-fallback',
    lastTraversalReason: null,
    terrainHandoffPhase: 'idle',
    routeExplorationPhase: 'idle',
    routeChoreographyPhase: 'overview',
    selectedId: null,
    selectedStopIndex: null,
    neighbors: [],
    compass: {
        phase: 'idle' as CompassPhase,
        currentAction: 'none' as CompassAction,
        previousAction: 'none' as CompassAction,
        lastTransitionAt: 0
    },
    walkHistory: [],
    trailDepth: 0,
    walkHistoryIndices: [],
    trailSeedIndex: null
}

// ── Store ────────────────────────────────────────────────────────────────────

/**
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` creates a render_effect that only fires in the Svelte runtime
 *   (browser). In jsdom/vitest there is no render_effect, so store.update()
 *   writes to appState but subscribers never wake up — get(store) returns
 *   stale values. A plain `writable` + `withJourneyNotify()` fixes both:
 *   runtime subscribers are notified by the writable's own .set(), and test
 *   environments get synchronous notification too.
 */

/** Read the current journey state from appState (shared by initial value and callable getter). */
function _readJourneyFromAppState(): JourneyStoreState {
    const navState = appState?.navState ?? {}
    const walkIndices = finiteIndexList(navState.walkHistoryIndices)
    return {
        ...INITIAL_JOURNEY,
        ...$state.snapshot(navState),
        phase: navState.mode,
        trail: walkIndices.map((index) => ({ index }) as TrailStop),
        cursor: navState.trailCursor,
        depth: navState.trailDepth,
        trailDepth: navState.trailDepth,
        walkHistoryIndices: walkIndices,
        trailSeedIndex: navState.trailSeedIndex ?? null,
        threadCandidates: valueArray(navState.threadCandidates) as ThreadCandidateRef[],
        threadReasonByIndex: new Map(navState.threadReasonByIndex),
        threadSource: navState.threadSource,
        lastTraversalReason: navState.lastTraversalReason,
        terrainHandoffPhase: 'idle',
        routeExplorationPhase: 'idle',
        routeChoreographyPhase: 'overview'
    }
}

const _journeyWritable = writable<JourneyStoreState>(_readJourneyFromAppState())

/**
 * Push journey mutations to both `_journeyWritable` and `appState`.
 * The writable notifies subscribers; the appState mutation keeps the kernel
 * in sync. The 6 bridged properties are: mode, trailCursor, trailDepth,
 * walkHistoryIndices, threadSource, lastTraversalReason.
 *
 * Contract: every field that `journeyStore()` exposes must round-trip
 * through `appState.navState` so the dual-state-mirror invariant holds.
 * See `tests/unit-active/journey-store-mirror-contract.test.ts` for the
 * invariant tests, and `tests/unit-active/state-class-migration-6-journey.test.ts`
 * for the broader migration contract.
 */
function withJourneyNotify(updater: (_s: JourneyStoreState) => JourneyStoreState): void {
    const next = withNotify(_journeyWritable, updater)
    // depth and trailDepth are aliases in the journey state. The W11-T4
    // migration kept them as separate fields to preserve the legacy
    // contract (some callers set only one), but the parity layer reads
    // `journey.depth` while tests tend to set `trailDepth`. Normalize
    // here so the writable stays internally consistent regardless of
    // which alias the caller mutated. `trailDepth` is treated as the
    // canonical value (matches the appState sync below) — any user-set
    // `depth` that disagrees with `trailDepth` is overridden.
    const normalized = {
        ...next,
        depth: next.trailDepth,
        trailDepth: next.trailDepth
    }
    _journeyWritable.set(normalized)
    writeNavStateMirror({
        mode: normalized.phase,
        trailCursor: normalized.cursor,
        trailDepth: normalized.trailDepth,
        walkHistoryIndices: [...normalized.walkHistoryIndices],
        threadSource: normalized.threadSource,
        lastTraversalReason: normalized.lastTraversalReason
    })
}

/** JourneyStore type: callable function + Readable + actions. */
export type JourneyStoreApi = (() => JourneyStoreState) &
    Readable<JourneyStoreState> & {
        update(_fn: (_s: JourneyStoreState) => JourneyStoreState): void
        set(_value: JourneyStoreState): void
    }

function _createJourneyStore(): JourneyStoreApi {
    // Function call: returns fresh snapshot from the writable (kept in sync
    // by withJourneyNotify for every appState bridge mutation). Matches the
    // focus store pattern: the writable is the Svelte-side source of truth,
    // so consumers see the latest user-provided state including fields like
    // `compass` that withJourneyNotify does not mirror back to appState.
    const fn = (() => get(_journeyWritable)) as unknown as JourneyStoreApi

    fn.subscribe = _journeyWritable.subscribe
    // Wrap update/set to also sync appState via withJourneyNotify, so the
    // callable getter (which reads appState) returns fresh values immediately.
    fn.update = (updater: (_s: JourneyStoreState) => JourneyStoreState) => {
        withJourneyNotify(updater)
    }
    fn.set = (value: JourneyStoreState) => {
        withJourneyNotify(() => value)
    }

    return fn
}

/** Single reactive instance of the journey state. */
export const journeyStore: JourneyStoreApi = _createJourneyStore()
/** Backwards-compatible alias. */
export const journeyState: JourneyStoreApi = journeyStore

// ── Derived Getters ──────────────────────────────────────────────────────────

export const journeyPhase = () => appState.navState.mode
export const journeyTrail = () =>
    finiteIndexList(appState.navState.walkHistoryIndices).map((index) => ({ index }) as TrailStop)
export const compassPhase = () => 'idle'
export const journeyNeighbors = () => finiteIndexList(appState.navState.trailNeighborIndices)
export const journeySelectedId = () => {
    const focused = appState.navState.focusedIndex
    return focused === null ? null : String(focused)
}
export const walkHistory = () =>
    finiteIndexList(appState.navState.walkHistoryIndices).map<WalkHistoryEntry>((index) => ({
        fromIndex: -1,
        toIndex: index,
        reason: '',
        timestamp: Date.now()
    }))
export const trailDepth = () => appState.navState.trailDepth
export const trailSeedIndex = () => appState.navState.trailSeedIndex
export const trailNeighborIndices = () => finiteIndexList(appState.navState.trailNeighborIndices)
export const threadCandidates = (): ReadonlyArray<number> => candidateIndexList(appState.navState.threadCandidates)
export const threadSource = () => appState.navState.threadSource
export const walkHistoryIndices = () => finiteIndexList(appState.navState.walkHistoryIndices)

/** Returns the current point index at the journey cursor. */
export function currentJourneyIndex(): number | null {
    const s = journeyStore()
    if (s.cursor < 0 || s.cursor >= s.trail.length) return null
    return s.trail[s.cursor]?.index ?? null
}

// ── Actions ──────────────────────────────────────────────────────────────────

export function setJourneyPhase(phase: NavMode): void {
    withJourneyNotify((s) => ({ ...s, phase }))
}

export function setTrailDepth(depth: number): void {
    withJourneyNotify((s) => ({ ...s, depth, trailDepth: depth }))
}

export function addWalkHistoryIndex(index: number): void {
    withJourneyNotify((s) => {
        if (s.walkHistoryIndices.includes(index)) return s
        const walkHistoryIndices = [...s.walkHistoryIndices, index]
        return {
            ...s,
            walkHistoryIndices,
            trail: walkHistoryIndices.map((i) => ({ index: i }) as TrailStop),
            cursor: walkHistoryIndices.length - 1
        }
    })
}

export function transitionCompass(phase: string): void {
    // Compass phase is typically tied to nav mode or a sub-state.
    // For now, we'll map it to nav mode if it matches a milestone.
    if ((JOURNEY_COMPASS_PHASE_ORDER as readonly string[]).includes(phase)) {
        withJourneyNotify((s) => ({ ...s, phase: phase as NavMode }))
    }
}

export function addTrailStop(stop: TrailStop | number): void {
    const index = typeof stop === 'number' ? stop : stop.index
    withJourneyNotify((s) => {
        const walkHistoryIndices = [...s.walkHistoryIndices, index]
        return {
            ...s,
            walkHistoryIndices,
            trail: walkHistoryIndices.map((i) => ({ index: i }) as TrailStop),
            cursor: walkHistoryIndices.length - 1
        }
    })
}

export function removeTrailStop(index: number): void {
    withJourneyNotify((s) => {
        const walkHistoryIndices = s.walkHistoryIndices.filter((i) => i !== index)
        return {
            ...s,
            walkHistoryIndices,
            trail: walkHistoryIndices.map((i) => ({ index: i }) as TrailStop),
            cursor: Math.min(s.cursor, walkHistoryIndices.length - 1)
        }
    })
}

export function clearTrail(): void {
    withJourneyNotify((s) => ({
        ...s,
        walkHistoryIndices: [],
        trail: [],
        cursor: -1
    }))
}

export function setSelectedStop(index: number | null): void {
    writeNavStateMirror({ focusedIndex: index })
}

export function setTrailSeedIndex(index: number | null): void {
    writeNavStateMirror({ trailSeedIndex: index })
}

export function setTrailNeighborIndices(indices: readonly number[]): void {
    writeNavStateMirror({ trailNeighborIndices: [...indices] })
}

export function advanceTrailCursor(delta = 1): void {
    withJourneyNotify((s) => {
        const max = s.walkHistoryIndices.length - 1
        return { ...s, cursor: Math.max(-1, Math.min(max, s.cursor + delta)) }
    })
}

export function setNeighbors(indices: readonly number[]): void {
    setTrailNeighborIndices(indices)
}

export function addWalkHistory(entry: WalkHistoryEntry | number): void {
    addTrailStop(typeof entry === 'number' ? entry : entry.toIndex)
}

export function clearWalkHistory(): void {
    clearTrail()
}

export function setThreadCandidates(candidates: readonly number[]): void {
    const refs = candidates.map((idx) => ({ index: idx, source: '', reason: '' }))
    _journeyWritable.update((s) => ({ ...s, threadCandidates: [...refs] }))
    writeNavStateMirror({ threadCandidates: [...refs] })
}

export function clearThreadCandidates(): void {
    _journeyWritable.update((s) => ({ ...s, threadCandidates: [] }))
    writeNavStateMirror({ threadCandidates: [] })
}

export function setTerrainHandoffPhase(phase: JourneyStoreState['terrainHandoffPhase']): void {
    _journeyWritable.update((s) => ({ ...s, terrainHandoffPhase: phase }))
}

export function setRouteExplorationPhase(phase: JourneyStoreState['routeExplorationPhase']): void {
    _journeyWritable.update((s) => ({ ...s, routeExplorationPhase: phase }))
}

export function setSelectedId(id: string | null): void {
    const index = id === null ? null : Number(id)
    setSelectedStop(Number.isFinite(index) ? index : null)
}

export function resetJourney(): void {
    _journeyWritable.set({ ...INITIAL_JOURNEY })
    writeNavStateMirror({
        mode: 'overview',
        walkHistoryIndices: [],
        trailCursor: -1,
        trailDepth: 0
    })
}
