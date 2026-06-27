/**
 * @lib/stores/focus.svelte.ts — Focus pocket, thread inspector, and selected card store
 *
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` replaces the writable's notifying `set` with the user's custom
 *   setter. In Svelte runtime this works because the render_effect re-reads the
 *   getter after mutations and calls the underlying writable's `set`. But in
 *   jsdom/vitest there is no render_effect, so `store.update()` writes to
 *   appState but subscribers never wake up — `get(store)` returns stale values.
 *
 *   A plain `writable` + `withFocusNotify()` wrapper fixes both: runtime
 *   subscribers are notified by the writable's own `.set()`, and test
 *   environments get synchronous notification too. (A3-1 fix pattern, canonical
 *   in search.svelte.ts and camera.svelte.ts.)
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
import { get, writable, type Readable } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { getBusinessRecords } from '@lib/data-store'

// ── Initial State ────────────────────────────────────────────────────────────

/** Internal store state interface. */
export interface FocusStoreState extends FocusState {
    pocketMotionByIndex: Map<number, PocketMotionWithFrame>
    pocketTransitionStartedAt: number
    infoPanelOpen: boolean
    pocketListVisible: boolean
    strandContinuityPhase: 'idle' | 'exploring' | 'arrived' | 'departing'
}

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

// ── Store ────────────────────────────────────────────────────────────────────

/** Read a fresh snapshot from the state kernel (appState). */
function _readFocusSnapshot(): FocusStoreState {
    const source = appState as unknown as {
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
    }
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
        semanticDiveMode: navState.trailDepth === 2,
        nodesAreSettling: source.nodesAreSettling ?? false,
        pocketMotionByIndex: new Map(source.pocketMotionByIndex ?? []),
        pocketTransitionStartedAt: source.pocketTransitionStartedAt ?? 0,
        infoPanelOpen: source.infoPanelOpen ?? true,
        pocketListVisible: source.pocketListVisible ?? false,
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

/** Reactive binding to the Svelte 5 state kernel. */
const _focusWritable = writable<FocusStoreState>(_readFocusSnapshot())

/**
 * Push mutations to both `_focusWritable` and `appState`.
 * The writable notifies subscribers; the appState sync keeps the kernel
 * in sync for legacy readers and the engine bridge.
 */
function withFocusNotify(updater: (_s: FocusStoreState) => FocusStoreState): void {
    const current = get(_focusWritable)
    const next = updater(current)
    _focusWritable.set(next)
    // Sync all bridged properties back to appState
    const inspectedThreadIndex = next.threadInspector.active
        ? next.threadInspector.inspectedIndex
        : next.inspectedStrandIndex
    appState.navState.focusPocketIndices = next.pocketNodes.map((n) => n.index)
    appState.navState.focusPocketRoleByIndex = next.pocketRoleByIndex
    appState.navState.focusPocketMeta = next.pocketMeta
    appState.selectedPoint = next.selectedBusiness as unknown as Point | null
    appState.inspectedThreadIndex = inspectedThreadIndex
    appState.pinnedThreadIndex = next.pinnedThreadIndex
    appState.nodesAreSettling = next.nodesAreSettling
    appState.pocketMotionByIndex = next.pocketMotionByIndex
    appState.pocketTransitionStartedAt = next.pocketTransitionStartedAt
    appState.infoPanelOpen = next.infoPanelOpen
    appState.pocketListVisible = next.pocketListVisible
    appState.focusTransitionMode = next.transitionMode
    appState.focusTransitionStartedAt = next.transitionStartedAt
    // Reverse-map semanticDiveMode → navState.trailDepth
    if (next.semanticDiveMode !== current.semanticDiveMode) {
        if (next.semanticDiveMode) appState.navState.trailDepth = 2
        else if (appState.navState.trailDepth === 2) appState.navState.trailDepth = 1
    }
    // Sync thread inspector diagnostics
    appState.inspectedStrandDiagnostics.active = next.threadInspector.active
    appState.inspectedStrandDiagnostics.source = next.threadInspector.source
    appState.inspectedStrandDiagnostics.segmentCount = next.threadInspector.segmentCount
    appState.inspectedStrandDiagnostics.braidCount = next.threadInspector.braidCount
    appState.inspectedStrandDiagnostics.endpointCount = next.threadInspector.endpointCount
    appState.threadInspectorPointerInside = next.threadInspector.pointerInside
}

/**
 * Write focus-pocket fields to both the focus writable and appState in one call.
 *
 * Mirrors the discipline of `writeNavStateMirror`: callers must never mutate
 * `appState.navState.focusPocket*` directly — instead pass a patch here so the
 * writable + appState stay in sync and subscribers are notified.
 *
 * Uses `withFocusNotify` which bumps `_focusWritable`, syncs all bridged fields
 * (including pocketNodes/pocketRoleByIndex/pocketMeta) back to appState, and
 * triggers Svelte subscriber notifications.
 */
export function writeFocusPocketMirror(
    patch: Partial<Pick<FocusStoreState, 'pocketNodes' | 'pocketMeta' | 'pocketRoleByIndex'>>
): void {
    withFocusNotify((s) => ({ ...s, ...patch }))
}

/** FocusStore type: callable function + Readable + actions. */
export type FocusStoreApi = (() => FocusStoreState) &
    Readable<FocusStoreState> & {
        update(_fn: (_s: FocusStoreState) => FocusStoreState): void
        set(_value: FocusStoreState): void
    }

function _createFocusStore(): FocusStoreApi {
    // Function call: returns fresh snapshot from the writable (kept in sync
    // by withFocusNotify for every appState bridge mutation).
    const fn = (() => get(_focusWritable)) as unknown as FocusStoreApi

    fn.subscribe = _focusWritable.subscribe
    fn.update = (updater: (_s: FocusStoreState) => FocusStoreState) => withFocusNotify(updater)
    fn.set = (value: FocusStoreState) => {
        _focusWritable.set(value)
        // Sync all bridged properties back to appState (same as withFocusNotify)
        const inspectedThreadIndex = value.threadInspector.active
            ? value.threadInspector.inspectedIndex
            : value.inspectedStrandIndex
        appState.navState.focusPocketIndices = value.pocketNodes.map((n) => n.index)
        appState.navState.focusPocketRoleByIndex = value.pocketRoleByIndex
        appState.navState.focusPocketMeta = value.pocketMeta
        appState.selectedPoint = value.selectedBusiness as unknown as Point | null
        appState.inspectedThreadIndex = inspectedThreadIndex
        appState.pinnedThreadIndex = value.pinnedThreadIndex
        appState.nodesAreSettling = value.nodesAreSettling
        appState.pocketMotionByIndex = value.pocketMotionByIndex
        appState.pocketTransitionStartedAt = value.pocketTransitionStartedAt
        appState.infoPanelOpen = value.infoPanelOpen
        appState.pocketListVisible = value.pocketListVisible
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
export const selectedBusiness = () => appState.selectedPoint
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
    withFocusNotify((s) => ({ ...s, pocketNodes: nodes }))
}

export function clearPocketNodes(): void {
    withFocusNotify((s) => ({ ...s, pocketNodes: [] }))
}

export function setPocketListVisible(visible: boolean): void {
    withFocusNotify((s) => ({ ...s, pocketListVisible: visible }))
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
