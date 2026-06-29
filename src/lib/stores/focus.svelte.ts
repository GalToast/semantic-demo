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
 *   selectedBusiness              → appState.selectedPoint  (narrowed via narrowToPoint)
 *   inspectedStrandIndex          → appState.inspectedThreadIndex
 *   pinnedThreadIndex             → appState.pinnedThreadIndex
 *   nodesAreSettling              → appState.nodesAreSettling
 *   pocketMotionByIndex           → appState.pocketMotionByIndex
 *   pocketTransitionStartedAt     → appState.pocketTransitionStartedAt
 *   infoPanelOpen                 → appState.infoPanelOpen
 *   pocketListVisible             → appState.pocketListVisible
 *   pocketRoleFilter              → appState.pocketRoleFilter
 *   transitionMode                → appState.focusTransitionMode
 *   transitionStartedAt           → appState.focusTransitionStartedAt
 *   threadInspector.active        → appState.inspectedStrandDiagnostics.active
 *   threadInspector.source        → appState.inspectedStrandDiagnostics.source
 *   threadInspector.segmentCount  → appState.inspectedStrandDiagnostics.segmentCount
 *   threadInspector.braidCount    → appState.inspectedStrandDiagnostics.braidCount
 *   threadInspector.endpointCount → appState.inspectedStrandDiagnostics.endpointCount
 *   threadInspector.pointerInside → appState.threadInspectorPointerInside
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
import type { BusinessRecord } from '@lib/types/business'
import type { Point } from '@lib/state/state-types'
import { type Readable, get } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { writeNavStateMirror } from '@lib/stores/navigation.svelte'
import { getBusinessRecords } from '@lib/data-store'
import { createStateMirror } from '@lib/state/create-state-mirror'

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
function _readFocusSnapshot(): FocusStoreState {
    const source = getFocusHydrationSource()
    const navState = source.navState ?? {}
    const indices = navState.focusPocketIndices || []
    const roles = navState.focusPocketRoleByIndex || new Map<number, string>()
    const targetPositions = source.targetPositions
    const nodePositions = source.nodePositions
    const originalPositions = source.originalPositions
    const records = getBusinessRecords()
    const anchorIndex = Number.isFinite(navState.focusedIndex as number) ? (navState.focusedIndex as number) : null
    const diagnostics = source.inspectedStrandDiagnostics ?? INITIAL_FOCUS.threadInspector
    const orbitSlack = source.focusOrbitSlackState ?? INITIAL_FOCUS.orbitSlack

    const nodes: FocusPocketNode[] = []
    for (const idx of indices) {
        if (!Number.isFinite(idx) || idx < 0) continue
        if (anchorIndex != null && idx === anchorIndex) continue
        const position = targetPositions?.[idx] ?? nodePositions?.[idx] ?? originalPositions?.[idx] ?? null
        if (!position) continue
        const legacyRole = (roles.get(idx) || 'support').toLowerCase()
        const role: FocusPocketNode['role'] =
            legacyRole === 'primary' || legacyRole === 'direct'
                ? 'direct'
                : legacyRole === 'civic'
                  ? 'civic'
                  : 'support'
        const record = records[idx]
        const label = record?.name ?? `Node ${idx}`
        nodes.push({
            index: idx,
            position: [position.x ?? 0, position.y ?? 0, position.z ?? 0],
            role,
            score: 0.62,
            label,
            rotationSeed: (idx * 7919) % 360,
            scaleSeed: ((idx * 104729) % 1000) / 1000
        })
    }

    return {
        ...INITIAL_FOCUS,
        pocketNodes: nodes,
        pocketMeta: navState.focusPocketMeta ?? null,
        pocketRoleByIndex: new Map(roles),
        selectedBusiness: source.selectedPoint ?? null,
        inspectedStrandIndex: source.inspectedThreadIndex ?? null,
        pinnedThreadIndex: source.pinnedThreadIndex ?? null,
        // Read these two from the focusMirror writable, not appState. The
        // createStateMirror migration turned them into user-driven fields on
        // the writable side; deriving `semanticDiveMode` from `trailDepth`
        // (the pre-migration shape) made parity's `transitioning` branch
        // unreachable. `strandContinuityPhase` was never wired into
        // FocusHydrationSource, so reading from the mirror is the only path
        // parity can see user updates. The mirror is hoisted-after-read for
        // the very first call (during createStateMirror initialization), so
        // fall back to INITIAL_FOCUS defaults when focusMirror isn't defined yet.
        semanticDiveMode: !_focusMirrorReady ? INITIAL_FOCUS.semanticDiveMode : (get(focusMirror).semanticDiveMode ?? INITIAL_FOCUS.semanticDiveMode),
        strandContinuityPhase: !_focusMirrorReady ? INITIAL_FOCUS.strandContinuityPhase : (get(focusMirror).strandContinuityPhase ?? INITIAL_FOCUS.strandContinuityPhase),
        nodesAreSettling: source.nodesAreSettling ?? false,
        pocketMotionByIndex: new Map(source.pocketMotionByIndex ?? []),
        pocketTransitionStartedAt: source.pocketTransitionStartedAt ?? 0,
        infoPanelOpen: source.infoPanelOpen ?? true,
        pocketListVisible: source.pocketListVisible ?? false,
        pocketRoleFilter: (source.pocketRoleFilter as PocketRoleFilter) ?? 'all',
        transitionMode: source.focusTransitionMode ?? 'idle',
        transitionStartedAt: source.focusTransitionStartedAt ?? 0,
        orbitSlack: { ...orbitSlack } as FocusOrbitSlackState,
        threadInspector: {
            active: diagnostics.active,
            source: diagnostics.source,
            inspectedIndex: source.inspectedThreadIndex ?? null,
            pinnedIndex: source.pinnedThreadIndex ?? null,
            pointerInside: source.threadInspectorPointerInside ?? false,
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
        selectedBusiness: null, // handled post-publish via narrowToPoint
        pocketRoleFilter: 'pocketRoleFilter',
        pinnedThreadIndex: 'pinnedThreadIndex',
        nodesAreSettling: 'nodesAreSettling',
        pocketMotionByIndex: 'pocketMotionByIndex',
        pocketTransitionStartedAt: 'pocketTransitionStartedAt',
        infoPanelOpen: 'infoPanelOpen',
        pocketListVisible: 'pocketListVisible',
        transitionMode: 'focusTransitionMode',
        transitionStartedAt: 'focusTransitionStartedAt',
        inspectedStrandIndex: 'inspectedThreadIndex',
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

    focusMirror.set(next)

    // Grouped/special-case mirrors that the flat bindings table can't express
    writeNavStateMirror({
        focusPocketIndices: next.pocketNodes.map((n) => n.index),
        focusPocketRoleByIndex: next.pocketRoleByIndex,
        focusPocketMeta: next.pocketMeta
    })
    appState.selectedPoint = narrowToPoint(next.selectedBusiness)

    // InspectedStrandIndex is mirrored again here because factory bindings
    // only handle the simple case — clearThreadInspector bumps both
    // inspectedStrandIndex AND threadInspector.inspectedIndex atomically.
    appState.inspectedThreadIndex = next.threadInspector.active
        ? next.threadInspector.inspectedIndex
        : next.inspectedStrandIndex
    appState.inspectedStrandDiagnostics.active = next.threadInspector.active
    appState.inspectedStrandDiagnostics.source = next.threadInspector.source
    appState.inspectedStrandDiagnostics.segmentCount = next.threadInspector.segmentCount
    appState.inspectedStrandDiagnostics.braidCount = next.threadInspector.braidCount
    appState.inspectedStrandDiagnostics.endpointCount = next.threadInspector.endpointCount
    appState.threadInspectorPointerInside = next.threadInspector.pointerInside

    // semanticDiveMode ↔ navState.trailDepth
    if (next.semanticDiveMode !== current.semanticDiveMode) {
        if (next.semanticDiveMode) writeNavStateMirror({ trailDepth: 2 })
        else if (appState.navState.trailDepth === 2) writeNavStateMirror({ trailDepth: 1 })
    }
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
    fn.set = (value: FocusStoreState) => {
        focusMirror.set(value)
        // Mirror bridge for focusStore.set (same as withFocusNotify bridge tail)
        writeNavStateMirror({
            focusPocketIndices: value.pocketNodes.map((n) => n.index),
            focusPocketRoleByIndex: value.pocketRoleByIndex,
            focusPocketMeta: value.pocketMeta
        })
        appState.selectedPoint = narrowToPoint(value.selectedBusiness)
        const inspectedThreadIndex = value.threadInspector.active
            ? value.threadInspector.inspectedIndex
            : value.inspectedStrandIndex
        appState.inspectedThreadIndex = inspectedThreadIndex
        appState.pinnedThreadIndex = value.pinnedThreadIndex
        appState.nodesAreSettling = value.nodesAreSettling
        appState.pocketMotionByIndex = value.pocketMotionByIndex
        appState.pocketTransitionStartedAt = value.pocketTransitionStartedAt
        appState.infoPanelOpen = value.infoPanelOpen
        appState.pocketListVisible = value.pocketListVisible
        appState.pocketRoleFilter = value.pocketRoleFilter
        appState.focusTransitionMode = value.transitionMode
        appState.focusTransitionStartedAt = value.transitionStartedAt
        appState.inspectedStrandDiagnostics.active = value.threadInspector.active
        appState.inspectedStrandDiagnostics.source = value.threadInspector.source
        appState.inspectedStrandDiagnostics.segmentCount = value.threadInspector.segmentCount
        appState.inspectedStrandDiagnostics.braidCount = value.threadInspector.braidCount
        appState.inspectedStrandDiagnostics.endpointCount = value.threadInspector.endpointCount
        appState.threadInspectorPointerInside = value.threadInspector.pointerInside
    }

    return fn
}

/** Single reactive instance of the focus state. */
export const focusStore: FocusStoreApi = _createFocusStore()

// ── Derived Getters ──────────────────────────────────────────────────────────

export const pocketNodes = () => appState.navState.focusPocketIndices
export const pocketMeta = () => appState.navState.focusPocketMeta
export const selectedBusiness = () => get(focusMirror).selectedBusiness
export const infoPanelOpen = () => appState.infoPanelOpen
export const pocketListVisible = () => appState.pocketListVisible
export const semanticDiveMode = () => appState.navState.trailDepth === 2
export const nodesAreSettling = () => appState.nodesAreSettling
export const inspectedStrandIndex = () => appState.inspectedThreadIndex
export const pinnedThreadIndex = () => appState.pinnedThreadIndex
export const threadInspector = () => focusStore().threadInspector
export const threadInspectorActive = () => appState.inspectedStrandDiagnostics.active

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
    withFocusNotify(() => ({ ...INITIAL_FOCUS }))
}

// ── Re-exports ───────────────────────────────────────────────────────────────
/** Constellation motifs defined in the engine config. */
export { FOCUS_CONSTELLATION_MOTIFS } from '@lib/engine/config'
export type { ConstellationMotif } from '@lib/engine/config'

// ── Test-only escape hatch ──────────────────────────────────────────────────

/**
 * Test-only escape hatch — drops the window-keyed writable so the next
 * import / read returns the current appState-derived initial value.
 */
export const resetFocusForTests = focusMirror.resetForTests
