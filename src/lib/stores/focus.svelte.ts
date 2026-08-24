/**
 * @lib/stores/focus.svelte.ts — Focus pocket, thread inspector, and selected card store
 *
 * Single source of truth for focus state. Reads from appState (the kernel) and
 * publishes to a `Writable<FocusStoreState>` for Svelte subscriber notification
 * (both runtime render_effect and jsdom/vitest environments).
 *
 * ── Migration to createStateMirror ──────────────────────────────────────────
 * Before this commit, this file shipped the dual-state-mirror pattern by hand:
 * a `writable<FocusStoreState>`, a `withFocusNotify(updater)` helper with ~30
 * lines of field-by-field appState mirroring, plus a `_createFocusStore()`
 * callable-builder. That's the pattern the factory in
 * src/lib/state/create-state-mirror.ts was extracted to replace.
 *
 * The migrated form replaces ~200 LOC of pattern with one createStateMirror call
 * plus a `_readFocusSnapshot()` reader over appState. The public API is unchanged:
 * `focusStore` is still a callable that returns a FocusStoreState snapshot that
 * _reads from appState_, and consumers still call `focusStore.update(fn)` /
 * `focusStore.set(value)` / `focusStore.subscribe(cb)`. Every field that the old
 * `withFocusNotify` mirrored back to appState is still mirrored via the
 * `bindings` map (`null` for fields with no direct appState slot).
 *
 * Bindings table (stateKey → appStateKey | null):
 *   pocketNodes, pocketRoleByIndex, pocketMeta → mirrored via writeNavStateMirror
 *     (the factory doesn't know about the batched mirror call, so we go through
 *     `withFocusNotify` which is kept as a thin action helper that runs the
 *     user's updater, publishes the resulting snapshot to the factory-writable,
 *     and then writes each appState-bound field via the mirrors below).
 *   selectedBusiness              → appState.focusState.selectedPoint  (narrowed via narrowToPoint)
 *   inspectedStrandIndex          → appState.focusState.inspectedThreadIndex
 *   pinnedThreadIndex             → appState.focusState.pinnedThreadIndex
 *   nodesAreSettling              → appState.focusState.nodesAreSettling
 *   pocketMotionByIndex           → appState.focusState.pocketMotionByIndex
 *   pocketTransitionStartedAt     → appState.focusState.pocketTransitionStartedAt
 *   infoPanelOpen                 → appState.focusState.infoPanelOpen
 *   pocketListVisible             → appState.focusState.pocketListVisible
 *   pocketRoleFilter              → appState.focusState.pocketRoleFilter
 *   transitionMode                → appState.focusState.focusTransitionMode
 *   transitionStartedAt           → appState.focusState.focusTransitionStartedAt
 *   threadInspector.active        → appState.focusState.inspectedStrandDiagnostics.active
 *   threadInspector.source        → appState.focusState.inspectedStrandDiagnostics.source
 *   threadInspector.segmentCount  → appState.focusState.inspectedStrandDiagnostics.segmentCount
 *   threadInspector.braidCount    → appState.focusState.inspectedStrandDiagnostics.braidCount
 *   threadInspector.endpointCount → appState.focusState.inspectedStrandDiagnostics.endpointCount
 *   threadInspector.pointerInside → appState.focusState.threadInspectorPointerInside
 *   semanticDiveMode              → navState.trailDepth (via writeNavStateMirror)
 *   All other fields (orbitSlack, settling, strandContinuityPhase, etc.) → null —
 *     read locally from the MEMORY-mirrored snapshot only; no separate appState slot.
 */
import type {
    FocusState,
    FocusPocketNode,
    FocusTransitionMode,
    FocusOrbitSlackState,
    ThreadInspectorState,
    PocketMotionWithFrame
} from '@lib/types/state'
import type { NodePosition } from '@lib/state/types/core-types'
import type { BusinessRecord } from '@lib/types/business'
import type { Point } from '@lib/state/state-types'
import { type Readable, get } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { writeNavStateMirror } from '@lib/stores/navigation.svelte'
import { getBusinessRecords } from '@lib/data-store'
import { createStateMirror } from '@lib/state/create-state-mirror'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { formatBusinessName } from '@lib/utils/dom-formatters'

// ── Initial State ────────────────────────────────────────────────────────────

/** Internal store state interface. */
export interface FocusStoreState extends FocusState {
    pocketMotionByIndex: Map<number, PocketMotionWithFrame>
    pocketTransitionStartedAt: number
    infoPanelOpen: boolean
    pocketListVisible: boolean
    strandContinuityPhase: 'idle' | 'exploring' | 'arrived' | 'departing'
}

export type PocketRoleFilter = 'all' | 'direct' | 'support' | 'civic'

const INITIAL_FOCUS: FocusStoreState = {
    pocketNodes: [],
    pocketMeta: null,
    pocketRoleByIndex: new Map(),
    pocketMotionByIndex: new Map(),
    pocketTransitionStartedAt: 0,
    nodesAreSettling: false,
    semanticDiveMode: false,
    strandContinuityPhase: 'idle',
    inspectedStrandIndex: null,
    pinnedThreadIndex: null,
    threadInspectorPointerInside: false,
    canvasThreadInspectionClearTimer: null,
    selectedBusiness: null,
    infoPanelOpen: true,
    pocketListVisible: false,
    pocketRoleFilter: 'all' as PocketRoleFilter,
    settling: false,
    transitionMode: 'idle',
    transitionStartedAt: 0,
    orbitSlack: {
        phase: 'idle',
        reason: '',
        startedAt: 0,
        targetShift: 0,
        cameraShift: 0,
        distanceBefore: 0,
        distanceAfter: 0,
        maxDistance: 5.5,
        rotateSpeed: 0.6,
        panSpeed: 0.5
    },
    threadInspector: {
        active: false,
        source: 'none',
        inspectedIndex: null,
        pinnedIndex: null,
        pointerInside: false,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    }
}

// ── Hydration source ─────────────────────────────────────────────────────────

/**
 * Hydration source shape for focus store initialization.
 * Mirrors the structure expected from appState.
 */
interface FocusHydrationSource {
    navState?: {
        focusPocketIndices?: number[]
        focusPocketRoleByIndex?: Map<number, string>
        focusPocketMeta?: FocusStoreState['pocketMeta']
        focusedIndex?: number | null
        trailDepth?: number
    }
    targetPositions?: Array<{ x: number; y: number; z: number }>
    nodePositions?: Array<{ x: number; y: number; z: number }>
    originalPositions?: Array<{ x: number; y: number; z: number }>
    selectedPoint?: BusinessRecord | null
    inspectedThreadIndex?: number | null
    pinnedThreadIndex?: number | null
    nodesAreSettling?: boolean
    pocketMotionByIndex?: Map<number, PocketMotionWithFrame>
    pocketTransitionStartedAt?: number
    infoPanelOpen?: boolean
    pocketListVisible?: boolean
    focusTransitionMode?: FocusTransitionMode
    focusTransitionStartedAt?: number
    focusOrbitSlackState?: FocusOrbitSlackState
    inspectedStrandDiagnostics?: ThreadInspectorState
    threadInspectorPointerInside?: boolean
    pocketRoleFilter?: PocketRoleFilter
    // Phase 6c: focus sub-aggregate — supersedes the flat fields above
    // for the canonical source-of-truth. The flat fields above are
    // retained for backward compat with FocusHydrationSource callers
    // that pre-date the partition.
    focusState?: {
        selectedPoint?: BusinessRecord | null
        inspectedThreadIndex?: number | null
        pinnedThreadIndex?: number | null
        nodesAreSettling?: boolean
        pocketMotionByIndex?: Map<number, PocketMotionWithFrame>
        pocketTransitionStartedAt?: number
        infoPanelOpen?: boolean
        pocketListVisible?: boolean
        focusTransitionMode?: FocusTransitionMode
        focusTransitionStartedAt?: number
        inspectedStrandDiagnostics?: ThreadInspectorState
        threadInspectorPointerInside?: boolean
        pocketRoleFilter?: PocketRoleFilter
    }
}

function getFocusHydrationSource(): FocusHydrationSource {
    return appState as unknown as FocusHydrationSource
}

function narrowToPoint(business: BusinessRecord | null): Point | null {
    if (!business) return null
    return {
        ...business,
        name: business.name ?? null,
        what: business.what ?? null,
        trivia: business.trivia ?? null,
        public_note: business.public_note ?? null,
        public_detail: business.public_detail ?? null,
        city: business.city ?? null,
        cluster: business.cluster ?? null,
        status: business.status ?? null,
        phone: business.phone ?? null,
        email: business.email ?? null,
        website: business.website ?? null,
        lat: business.lat ?? null,
        lng: business.lng ?? null,
        lead_id: business.lead_id ?? null
    }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Read a fresh snapshot from the state kernel (appState).
 *
 * The migration note: snapshots returned by `focusStore()` must match what
 * consumers would have seen from the legacy `_focusWritable`. The factory's
 * `computeFromAppState` calls this on every invocation (including the
 * `readable.on.subscribe` callback path that the `viewport.svelte.ts` migration
 * audit verified).
 */
function _buildPocketNode(
    idx: number,
    anchorIndex: number | null,
    targetPositions: NodePosition[] | undefined,
    nodePositions: NodePosition[] | undefined,
    originalPositions: NodePosition[] | undefined,
    roles: Map<number, string>,
    records: readonly BusinessRecord[]
): FocusPocketNode | null {
    if (!Number.isFinite(idx) || idx < 0) return null
    if (anchorIndex != null && idx === anchorIndex) return null
    const position = targetPositions?.[idx] ?? nodePositions?.[idx] ?? originalPositions?.[idx] ?? null
    if (!position) return null
    const legacyRole = (roles.get(idx) || 'support').toLowerCase()
    const role: FocusPocketNode['role'] =
        legacyRole === 'primary' || legacyRole === 'direct' ? 'direct' : legacyRole === 'civic' ? 'civic' : 'support'
    const record = records[idx]
    const label = record?.name ? formatBusinessName(record.name as string) : `Node ${idx}`
    return {
        index: idx,
        position: [position.x ?? 0, position.y ?? 0, position.z ?? 0],
        role,
        score: 0.62,
        label,
        rotationSeed: (idx * 7919) % 360,
        scaleSeed: ((idx * 104729) % 1000) / 1000
    }
}

// Re-entrancy guard (2026-08-24, fixes CI RangeError from 6ee4a246):
// state-mirrors are now LAZY — the first resolveWritable() runs this function
// while focusMirror itself is mid-initialization. _focusMirrorReady is
// already true by then, so the mirror reads below recursed into their own
// getOrCreateWritable forever (Maximum call stack size exceeded — broke
// focus-camera-animation + cursor contracts in CI). While a read is in
// flight, re-entry returns INITIAL_FOCUS defaults immediately; the outer
// read completes and caches the writable.
let _readingSnapshot = false

function _readFocusSnapshot(): FocusStoreState {
    if (_readingSnapshot) return { ...INITIAL_FOCUS }
    _readingSnapshot = true
    try {
        return _readFocusSnapshotInner()
    } finally {
        _readingSnapshot = false
    }
}

function _readFocusSnapshotInner(): FocusStoreState {
    const source = getFocusHydrationSource()
    const navState = source.navState ?? {}
    const indices = navState.focusPocketIndices || []
    const roles = navState.focusPocketRoleByIndex || new Map<number, string>()
    const targetPositions = source.targetPositions
    const nodePositions = source.nodePositions
    const originalPositions = source.originalPositions
    const records = getBusinessRecords()
    const anchorIndex = Number.isFinite(navState.focusedIndex as number) ? (navState.focusedIndex as number) : null
    const diagnostics = source.focusState?.inspectedStrandDiagnostics ?? INITIAL_FOCUS.threadInspector
    const orbitSlack = source.focusOrbitSlackState ?? INITIAL_FOCUS.orbitSlack

    const nodes: FocusPocketNode[] = []
    for (const idx of indices) {
        const node = _buildPocketNode(
            idx,
            anchorIndex,
            targetPositions,
            nodePositions,
            originalPositions,
            roles,
            records
        )
        if (node) nodes.push(node)
    }

    return {
        ...INITIAL_FOCUS,
        pocketNodes: nodes,
        pocketMeta: navState.focusPocketMeta ?? null,
        pocketRoleByIndex: new Map(roles),
        selectedBusiness: source.focusState?.selectedPoint ?? null,
        inspectedStrandIndex: source.focusState?.inspectedThreadIndex ?? null,
        pinnedThreadIndex: source.focusState?.pinnedThreadIndex ?? null,
        // Read these two from the focusMirror writable, not appState. The
        // createStateMirror migration turned them into user-driven fields on
        // the writable side; deriving `semanticDiveMode` from `trailDepth`
        // (the pre-migration shape) made parity's `transitioning` branch
        // unreachable. `strandContinuityPhase` was never wired into
        // FocusHydrationSource, so reading from the mirror is the only path
        // parity can see user updates.
        // Guards (both required):
        //   - !_focusMirrorReady → module-init TDZ order (focusMirror const not
        //     yet assigned when this runs during boot imports).
        //   - !isMaterialized() → lazy-holder first-use re-entrancy: the writable
        //     is created on first get()/subscribe(); computeFromAppState runs
        //     DURING that creation, so reading the mirror here recurses into
        //     getOrCreateWritable() until the stack dies (2026-08-24 boot crash,
        //     RangeError: Maximum call stack size exceeded). Fall back to
        //     INITIAL_FOCUS defaults until materialization completes.
        semanticDiveMode:
            !_focusMirrorReady || !focusMirror.isMaterialized()
                ? INITIAL_FOCUS.semanticDiveMode
                : (get(focusMirror).semanticDiveMode ?? INITIAL_FOCUS.semanticDiveMode),
        strandContinuityPhase:
            !_focusMirrorReady || !focusMirror.isMaterialized()
                ? INITIAL_FOCUS.strandContinuityPhase
                : (get(focusMirror).strandContinuityPhase ?? INITIAL_FOCUS.strandContinuityPhase),
        nodesAreSettling: source.focusState?.nodesAreSettling ?? false,
        pocketMotionByIndex: new Map(source.focusState?.pocketMotionByIndex ?? []),
        pocketTransitionStartedAt: source.focusState?.pocketTransitionStartedAt ?? 0,
        infoPanelOpen: source.focusState?.infoPanelOpen ?? true,
        pocketListVisible: source.focusState?.pocketListVisible ?? false,
        pocketRoleFilter: (source.focusState?.pocketRoleFilter as PocketRoleFilter) ?? 'all',
        transitionMode: source.focusState?.focusTransitionMode ?? 'idle',
        transitionStartedAt: source.focusState?.focusTransitionStartedAt ?? 0,
        orbitSlack: { ...orbitSlack } as FocusOrbitSlackState,
        threadInspector: {
            active: diagnostics.active,
            source: diagnostics.source,
            inspectedIndex: source.focusState?.inspectedThreadIndex ?? null,
            pinnedIndex: source.focusState?.pinnedThreadIndex ?? null,
            pointerInside: source.focusState?.threadInspectorPointerInside ?? false,
            segmentCount: diagnostics.segmentCount,
            braidCount: diagnostics.braidCount,
            endpointCount: diagnostics.endpointCount
        }
    }
}

/**
 * The focus mirror.
 *
 * The factory's `mirrorToAppState` step maps bound fields back to `appState`.
 * To keep the `_readFocusSnapshot()` reader pure (read-only), we intentionally
 * split the mirror duties:
 *   - Bound fields writeable flatly: `selectedBusiness`, `pocketRoleFilter`,
 *     `pinnedThreadIndex`, `nodesAreSettling`, `pocketMotionByIndex`,
 *     `pocketTransitionStartedAt`, `infoPanelOpen`, `pocketListVisible`,
 *     `transitionMode`, `transitionStartedAt` — all go straight into
 *     `appState` via the bindings table.
 *   - Nested/grouped fields: `pocketNodes/pocketRoleByIndex/pocketMeta`
 *     (grouped navStateMirror write), `semanticDiveMode` (trailDepth),
 *     threadInspector.* / inspectedStrandIndex (grouped thread-inspector write),
 *     `selectedBusiness` (narrowed Point). These are NOT mirrored by the
 * factory — `withFocusNotify` takes over for that duty. We set them to `null`
 * in the bindings map so the factory skips them.
 */

// Forward-declared so `_readFocusSnapshot()` can read user-driven mirror
// values for `semanticDiveMode` and `strandContinuityPhase`. The TDZ is
// detected at runtime via `_focusMirrorReady`.
let _focusMirrorReady = false

const focusMirror = createStateMirror<FocusStoreState>({
    computeFromAppState: _readFocusSnapshot,
    storageKey: '__SEMANTIC_EXPLORER_FOCUS_MIRROR__',
    bindings: {
        // Phase 6c: focus fields moved into appState.focusState sub-aggregate.
        // The factory's bindings expect flat appState keys, so all bindings
        // are null. Data flows appState.focusState.X via withFocusNotify's
        // explicit bridge writes (search.svelte.ts's same pattern).
        selectedBusiness: null, // handled post-publish via narrowToPoint
        pocketRoleFilter: null,
        pinnedThreadIndex: null,
        nodesAreSettling: null,
        pocketMotionByIndex: null,
        pocketTransitionStartedAt: null,
        infoPanelOpen: null,
        pocketListVisible: null,
        transitionMode: null,
        transitionStartedAt: null,
        inspectedStrandIndex: null,
        pocketNodes: null,
        pocketMeta: null,
        pocketRoleByIndex: null,
        semanticDiveMode: null,
        threadInspector: null,
        orbitSlack: null,
        strandContinuityPhase: null,
        settling: null,
        canvasThreadInspectionClearTimer: null,
        threadInspectorPointerInside: null
    }
})

// Mirror is now constructed — flip the flag so `_readFocusSnapshot()` can
// safely read from it. Until this line, `_readFocusSnapshot()` falls back to
// INITIAL_FOCUS defaults for `semanticDiveMode` and `strandContinuityPhase`.
_focusMirrorReady = true

// ── Legacy notification layer ────────────────────────────────────────────────
//
// `withFocusNotify` exists for consumers (and tests) that expect a single call
// that: applies the user's updater, publishes to the factory-writable, and then
// bridges the semanticDiveMode / threadInspector / selectedBusiness triple-grouped
// fields back to appState. It's a thin plugin over the factory; `focusStore.update`
// and `focusStore.set` both call it.

/**
 * Apply an updater, publish to the factory-writable, and bridge grouped fields.
 * Re-uses the factory's `update()` method to get both the writable notification
 * and the bindings-mirror pass, then handles the grouped fields that can't live
 * in the bindings table.
 */
function withFocusNotify(updater: (_s: FocusStoreState) => FocusStoreState): void {
    const current = _readFocusSnapshot()
    const next = updater(current)

    // Sync derived threadInspector.pinnedIndex with bound pinnedThreadIndex.
    // `next` was built from `current`'s stale appState read, so subscribers
    // would otherwise see threadInspector.pinnedIndex unchanged on pin/unpin.
    // T2: the factory's bindings map is all-null for focusStore, so the
    // factory's mirror step doesn't bridge these two slots — do it here.
    if (next.threadInspector.pinnedIndex !== next.pinnedThreadIndex) {
        next.threadInspector = {
            ...next.threadInspector,
            pinnedIndex: next.pinnedThreadIndex
        }
    }

    // Bridge grouped/special-case appState fields BEFORE notifying subscribers.
    // This prevents a lost-update race where subscribers read from `appState`
    // after `focusMirror.set()` but before the bridge writes land.
    writeNavStateMirror({
        focusPocketIndices: next.pocketNodes.map((n) => n.index),
        focusPocketRoleByIndex: next.pocketRoleByIndex,
        focusPocketMeta: next.pocketMeta
    })
    appState.focusState.selectedPoint = narrowToPoint(next.selectedBusiness)

    // InspectedStrandIndex is mirrored again here because factory bindings
    // only handle the simple case — clearThreadInspector bumps both
    // inspectedStrandIndex AND threadInspector.inspectedIndex atomically.
    appState.focusState.inspectedThreadIndex = next.threadInspector.active
        ? next.threadInspector.inspectedIndex
        : next.inspectedStrandIndex
    appState.focusState.inspectedStrandDiagnostics.active = next.threadInspector.active
    appState.focusState.inspectedStrandDiagnostics.source = next.threadInspector.source
    appState.focusState.inspectedStrandDiagnostics.segmentCount = next.threadInspector.segmentCount
    appState.focusState.inspectedStrandDiagnostics.braidCount = next.threadInspector.braidCount
    appState.focusState.inspectedStrandDiagnostics.endpointCount = next.threadInspector.endpointCount
    appState.focusState.threadInspectorPointerInside = next.threadInspector.pointerInside

    // Phase 6c: factory bindings are all null (nested path support not in
    // factory contract). Mirror every persistent focus field explicitly
    // so `_readFocusSnapshot` returns the new value on next call.
    appState.focusState.pinnedThreadIndex = next.pinnedThreadIndex
    appState.focusState.nodesAreSettling = next.nodesAreSettling
    appState.focusState.pocketMotionByIndex = next.pocketMotionByIndex
    appState.focusState.pocketTransitionStartedAt = next.pocketTransitionStartedAt
    appState.focusState.infoPanelOpen = next.infoPanelOpen
    appState.focusState.pocketListVisible = next.pocketListVisible
    appState.focusState.pocketRoleFilter = next.pocketRoleFilter
    appState.focusState.focusTransitionMode = next.transitionMode
    appState.focusState.focusTransitionStartedAt = next.transitionStartedAt

    // semanticDiveMode ↔ navState.trailDepth
    if (next.semanticDiveMode !== current.semanticDiveMode) {
        if (next.semanticDiveMode) writeNavStateMirror({ trailDepth: 2 })
        else if (appState.navState.trailDepth === 2) writeNavStateMirror({ trailDepth: 1 })
    }

    // Notify subscribers after appState is consistent.
    focusMirror.set(next)
}

// ── Public Store API (preserved verbatim from previous implementation) ────────

/** FocusStore type: callable function + Readable + actions. */
export type FocusStoreApi = (() => FocusStoreState) &
    Readable<FocusStoreState> & {
        update(_fn: (_s: FocusStoreState) => FocusStoreState): void
        set(_value: FocusStoreState): void
    }

/**
 * Build the FocusStoreApi over the factory mirror.
 *
 * The callable body reads from appState on every call (factory behaviour),
 * and update/set wire to `withFocusNotify` so callers get both the
 * synchronous subscriber bridge AND the grouped appState writes.
 */
function _createFocusStore(): FocusStoreApi {
    const fn = (() => _readFocusSnapshot()) as FocusStoreApi

    fn.subscribe = focusMirror.subscribe
    fn.update = (updater: (_s: FocusStoreState) => FocusStoreState) => withFocusNotify(updater)
    fn.set = (value: FocusStoreState) => withFocusNotify(() => value)

    return fn
}

/** Single reactive instance of the focus state. */
export const focusStore: FocusStoreApi = _createFocusStore()

// ── Derived Getters ──────────────────────────────────────────────────────────

export const pocketNodes = () => appState.navState.focusPocketIndices
export const pocketMeta = () => appState.navState.focusPocketMeta
export const selectedBusiness = () => get(focusMirror).selectedBusiness
export const infoPanelOpen = () => appState.focusState.infoPanelOpen
export const pocketListVisible = () => appState.focusState.pocketListVisible
export const semanticDiveMode = () => appState.navState.trailDepth === 2
export const nodesAreSettling = () => appState.focusState.nodesAreSettling
export const inspectedStrandIndex = () => appState.focusState.inspectedThreadIndex
export const pinnedThreadIndex = () => appState.focusState.pinnedThreadIndex
export const threadInspector = () => focusStore().threadInspector
export const threadInspectorActive = () => appState.focusState.inspectedStrandDiagnostics.active

// ── Actions ──────────────────────────────────────────────────────────────────

export function setPocketNodes(nodes: readonly FocusPocketNode[]): void {
    withFocusNotify((s) => ({ ...s, pocketNodes: [...nodes] }))
}

export function clearPocketNodes(): void {
    withFocusNotify((s) => ({ ...s, pocketNodes: [] }))
}

export function writeFocusPocketMirror(
    patch: Partial<Pick<FocusStoreState, 'pocketNodes' | 'pocketMeta' | 'pocketRoleByIndex'>>
): void {
    withFocusNotify((s) => ({ ...s, ...patch }))
}

export function setPocketListVisible(visible: boolean): void {
    withFocusNotify((s) => ({ ...s, pocketListVisible: visible }))
}

export function setPocketRoleFilter(filter: PocketRoleFilter): void {
    withFocusNotify((s) => ({ ...s, pocketRoleFilter: filter }))
}

export function pinThread(index: number): void {
    withFocusNotify((s) => ({ ...s, pinnedThreadIndex: index }))
    // W49-E: opening the thread inspector overlays the canvas. The
    // cursor-driven hover preview belongs to the galaxy view and would
    // otherwise remain visible behind the inspector card. Publish the
    // event the tooltip bridge subscribes to so it calls
    // hideCanvasHoverPreview() atomically with the inspector open.
    publish(EVENTS.TOOLTIP_HIDE_REQUESTED)
}

export function unpinThread(): void {
    withFocusNotify((s) => ({ ...s, pinnedThreadIndex: null }))
}

export function clearThreadInspector(): void {
    withFocusNotify((s) => ({
        ...s,
        inspectedStrandIndex: null,
        threadInspector: { ...s.threadInspector, active: false, inspectedIndex: null }
    }))
}

export function updateThreadInspector(patch: Partial<ThreadInspectorState>): void {
    withFocusNotify((s) => ({
        ...s,
        inspectedStrandIndex: patch.inspectedIndex === undefined ? s.inspectedStrandIndex : patch.inspectedIndex,
        threadInspector: { ...s.threadInspector, ...patch }
    }))
}

export function setSemanticDiveMode(active: boolean): void {
    withFocusNotify((s) => ({ ...s, semanticDiveMode: active }))
}

type BusinessRecordWithIndex = Partial<BusinessRecord> & { index?: number }
export function setSelectedBusiness(business: BusinessRecordWithIndex | null): void {
    withFocusNotify((s) => ({ ...s, selectedBusiness: business as BusinessRecord | null }))
}

export function setInfoPanelOpen(open: boolean): void {
    withFocusNotify((s) => ({ ...s, infoPanelOpen: open }))
}

export function resetFocus(): void {
    withFocusNotify(() => ({
        ...INITIAL_FOCUS,
        // Fresh Maps, not the shared INITIAL instances — in-place .set() by
        // pocket-role writers would otherwise pollute the reset baseline
        // (P2-3, stores2 sweep 2026-08-07).
        pocketRoleByIndex: new Map(),
        pocketMotionByIndex: new Map()
    }))
}

// ── Re-exports ───────────────────────────────────────────────────────────────
/** Constellation motifs defined in the engine config. */
export { FOCUS_CONSTELLATION_MOTIFS } from '@lib/engine/config'
export type { ConstellationMotif } from '@lib/engine/config'
// Arm nav-transition effects (see navigation/transition-effects.ts). Registry
// import is dependency-free — no dispatcher cycle.
import { registerTransitionEffects } from './navigation/transition-effects'
registerTransitionEffects({ resetFocus, setSemanticDiveMode })
