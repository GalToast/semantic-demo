/**
 * @lib/data-store.ts — Data stores for business records and semantic threads
 *
 * Replaces the data slices from js/state.js with Svelte stores.
 * Required business records are populated by initData(); large optional
 * enrichment and semantic thread artifacts hydrate after launch.
 *
 * Migration (data-store seam, 2026-08-08): the module's writables/derived
 * are now rune-backed state with store-compatible shims (SEAM-1 pattern —
 * see filter.svelte.ts). Public surface is byte-identical: 40 exports, same
 * names/types/semantics; consumers keep `$store`, .subscribe/.set/.update
 * and get() from svelte/store unchanged. The filename must stay data-store.ts
 * (33 consumers import the @lib/data-store alias), and plain .ts files are
 * not runes-compiled by vite-plugin-svelte (DEFAULT_SVELTE_EXT = ['.svelte']),
 * so the shims use the exact runtime primitives the Svelte 5.56 compiler
 * emits for `$state`/`$derived` in .svelte.ts modules (state/get/set/derived
 * from svelte/internal/client), wrapped in a small typed facade.
 */

import { appState } from '@lib/state/app.svelte'
import type { Readable } from 'svelte/store'
// @ts-expect-error — svelte/internal/client is a runtime-only entry without published
// type declarations (verified: exports map has no "types" entry). The shapes
// used below are exactly what compileModule() emits for `$state`/`$derived`
// in this Svelte version (5.56); the facade re-types them for this module.
import * as runtime from 'svelte/internal/client'
import type {
    BusinessRecord,
    BusinessDataResult,
    LeadEnrichment,
    SemanticThreadBundle,
    SemanticThreadDataResult,
    SemanticNeighborEntry,
    LayoutManifest,
    PositionBufferDescriptor
} from '@lib/types/business'
import type { LoadingPhase } from '@lib/types/state'
import { loadBusinessData, loadLeadEnrichmentData } from '@lib/data-loader'
import { debugInfo, debugWarn } from '@lib/utils/debug'
import { debugError } from '@lib/utils/debug'

// ── Rune-backed store shim ───────────────────────────────────────────────────
// SEAM-1 pattern: state lives in class instances on rune sources; subscribe()
// runs the subscriber synchronously (which is also what makes get() from
// svelte/store work), set()/update() write the source and notify manually.

/** Opaque view of the rune source object returned by the runtime state/derived factories. */
interface RuneSource<T> {
    readonly v: T
}

/** Create a rune source holding `initial` (compiled `$state` equivalent). */
const createState = <T>(initial: T): RuneSource<T> => runtime.state(initial) as RuneSource<T>

/** Synchronous snapshot read of a rune source (shim-internal get() replacement). */
const readState = <T>(source: RuneSource<T>): T => runtime.get(source) as T

/**
 * Write a rune source (compiled `$state` assignment equivalent).
 * Deliberately without the runtime's `should_proxy` flag: writable semantics
 * store the value as-is (reference identity preserved for consumers), and
 * reactivity is delivered through the shim's own subscriber notification —
 * identical observable behavior to the previous svelte/store writable.
 */
const writeState = <T>(source: RuneSource<T>, value: T): void => {
    runtime.set(source, value)
}

/** Create a lazily-evaluated, dependency-tracked rune derived (compiled `$derived` equivalent). */
const deriveState = <T>(fn: () => T): RuneSource<T> => runtime.derived(fn) as RuneSource<T>

/**
 * Store-compatible shim over a single rune-backed value.
 * Implements the svelte/store Writable interface structurally (subscribe /
 * set / update) plus a synchronous getSnapshot() used in place of get()
 * inside this module. NOT a true svelte store: get() from svelte/store works
 * because subscribe() invokes the subscriber synchronously (SEAM-1).
 */
class RuneStore<T> {
    #source: RuneSource<T>
    #subscribers = new Set<(value: T) => void>()

    constructor(initial: T) {
        this.#source = createState(initial)
    }

    /** Synchronous snapshot read — shim-internal replacement for get(). */
    getSnapshot(): T {
        return readState(this.#source)
    }

    subscribe(run: (value: T) => void): () => void {
        this.#subscribers.add(run)
        // Synchronous first emission (SEAM-1): get() from svelte/store and
        // $store auto-subscription both rely on this running immediately.
        run(this.getSnapshot())
        return () => {
            this.#subscribers.delete(run)
        }
    }

    set(value: T): void {
        writeState(this.#source, value)
        const snapshot = this.getSnapshot()
        for (const run of this.#subscribers) {
            run(snapshot)
        }
    }

    update(fn: (value: T) => T): void {
        this.set(fn(this.getSnapshot()))
    }
}

/**
 * Readable-compatible derived shim (SEAM-1 DerivedFilterStore pattern):
 * computes on demand and pushes updates by subscribing to the base rune
 * store. The compute closure reads base snapshots, and the derived value is
 * backed by a runtime `derived` source so recomputation is lazily cached and
 * dependency-tracked like a compiled `$derived`.
 */
class DerivedRuneStore<T> {
    #derivedSource: RuneSource<T>
    #subscribers = new Set<(value: T) => void>()
    // Explicit-field form (2026-08-10): the parameter-property shorthand
    // (constructor(private compute)) is a TS-only construct that
    // --experimental-transform-types (strip-only) CANNOT strip ("parameter
    // property not supported in strip-only mode"), which broke Node
    // contract runs importing this store (lifecycle.ts → data-store.ts).
    // Semantically identical to the parameter-property form.
    private compute: () => T

    constructor(compute: () => T, base: { subscribe(run: () => void): () => void }) {
        this.compute = compute
        this.#derivedSource = deriveState(() => this.compute())
        // Permanent base subscription: the base shim pushes on every change,
        // which re-evaluates the dependency-tracked derived source and
        // re-emits to our subscribers. Kept for the shim's lifetime — a
        // refcounted lazy unsubscribe would sever the push after any get()
        // cycle (subscribe + immediate unsubscribe) and leave the derived
        // cache stale for later subscribers (SEAM-1's DerivedFilterStore has
        // that latent gap; runtime-derived caching makes it observable).
        base.subscribe(() => this.notify())
    }

    /** Synchronous snapshot read of the computed derived value. */
    getSnapshot(): T {
        return readState(this.#derivedSource)
    }

    subscribe(run: (value: T) => void): () => void {
        this.#subscribers.add(run)
        run(this.getSnapshot())
        return () => {
            this.#subscribers.delete(run)
        }
    }

    private notify(): void {
        const value = this.getSnapshot()
        for (const run of this.#subscribers) {
            run(value)
        }
    }
}

// ── Cross-chunk singleton helpers ────────────────────────────────────────────
// When Vite code-splits, this module can be duplicated into multiple chunks.
// Each duplicate would create its own store instances, so consumers
// in different chunks would see different (empty) stores.  We use a plain
// *window* data property to share the canonical instances — the shim objects
// themselves are the window payloads (a duplicated module eval finds the
// existing shim in the slot and reuses it, so no second rune source is ever
// created).

/**
 * Typed view of the window object carrying semantic-explorer cross-chunk
 * singletons and legacy __APP_STATE__. The properties here are injected at
 * runtime by this module and by the pre-TS legacy bootstrap, so they are
 * not declared on the DOM Window type — but they ARE statically known to
 * this codebase.
 */
interface SemanticExplorerWindow {
    /**
     * Cross-chunk singleton slots. Each key holds a rune-backed store shim;
     * Vite code-splitting may duplicate this module, so we read/write the
     * canonical instance via window rather than module scope.
     */
    [key: `__SEMANTIC_EXPLORER_${string}`]: unknown
    /** Legacy bootstrap state injected by the pre-TS js/state.js. */
    __APP_STATE__?: SemanticExplorerAppState
}

/** Narrow `window` to the typed namespace we inject safely at runtime. */
function asSemanticExplorerWindow(): SemanticExplorerWindow {
    return window as unknown as SemanticExplorerWindow
}

/** Shape of the legacy __APP_STATE__ global (subset this module reads). */
interface SemanticExplorerAppState {
    points?: readonly BusinessRecord[]
    semanticNeighborMapByLeadId?: Map<string, SemanticNeighborEntry>
    semanticThreadBundle?: SemanticThreadBundle | null
    semanticThreadArtifactName?: string | null
    semanticThreadsStatus?: string
    semanticSpaceLayoutManifest?: LayoutManifest | null
    threadCandidates?: readonly number[]
    threadSource?: string
}

/**
 * Read a cross-chunk singleton slot from the window namespace.
 * Returns undefined when SSR (no window) or when the slot is unset.
 * The cast to `SemanticExplorerWindow` is honest: the keys are injected
 * by this module's own getOrCreateRuneStore and by the legacy bootstrap,
 * not by the DOM library.
 */
function getWindowSlot(key: `__SEMANTIC_EXPLORER_${string}`): unknown {
    if (typeof window === 'undefined') return undefined
    return asSemanticExplorerWindow()[key]
}

function setWindowSlot(key: `__SEMANTIC_EXPLORER_${string}`, value: unknown): void {
    if (typeof window === 'undefined') return
    asSemanticExplorerWindow()[key] = value
}

function getOrCreateRuneStore<T>(windowKey: `__SEMANTIC_EXPLORER_${string}`, initial: T): RuneStore<T> {
    const existing = getWindowSlot(windowKey)
    if (existing && typeof (existing as { subscribe?: unknown }).subscribe === 'function') {
        return existing as RuneStore<T>
    }
    const store = new RuneStore<T>(initial)
    setWindowSlot(windowKey, store)
    return store
}

// ── Status Types ──────────────────────────────────────────────────────────────

export type DataLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface DataLoadState {
    /** Overall loading status */
    status: DataLoadStatus
    /** Business records loaded successfully */
    businessLoaded: boolean
    /** Semantic threads loaded successfully */
    threadsLoaded: boolean
    /** Error message if status is 'error' */
    error: string | null
}

// ── Stores ────────────────────────────────────────────────────────────────────

/** Raw business records loaded from data.dat */
export const businessRecords = getOrCreateRuneStore<readonly BusinessRecord[]>(
    '__SEMANTIC_EXPLORER_DATA_BUSINESS_RECORDS__',
    []
)

/**
 * Hydrate the Svelte stores from the legacy state.
 * The Svelte build is layered on top of the legacy code; during the
 * migration the legacy init path still loads records into __APP_STATE__.points
 * and the Svelte stores need to be populated from that source so reactive
 * components can read the data.
 */
export function hydrateFromLegacyState(): boolean {
    if (typeof window === 'undefined') return false
    const w = asSemanticExplorerWindow()
    const windowAppState = w.__APP_STATE__
    if (!windowAppState) return false
    let didHydrate = false
    if (Array.isArray(windowAppState.points) && windowAppState.points.length > 0) {
        businessRecords.set(windowAppState.points)
        didHydrate = true
    }
    // appState initializes this field to an empty Map, so emptiness is not a
    // readiness signal. An empty artifact is finalized as failed, and treating
    // the default Map as hydrated would stop main.ts's retry loop too early.
    if (
        windowAppState.semanticNeighborMapByLeadId instanceof Map &&
        windowAppState.semanticNeighborMapByLeadId.size > 0
    ) {
        semanticNeighborMap.set(windowAppState.semanticNeighborMapByLeadId)
        didHydrate = true
    }

    // Null optional fields are terminal only after thread loading settles.
    const status = windowAppState.semanticThreadsStatus
    const threadsSettled = status === 'ready' || status === 'failed'

    if (windowAppState.semanticThreadBundle !== undefined) {
        // Preserve meaningful payloads during loading; defer null defaults.
        if (windowAppState.semanticThreadBundle !== null || threadsSettled) {
            semanticThreadBundle.set(windowAppState.semanticThreadBundle)
            didHydrate = true
        }
    }
    if (windowAppState.semanticThreadArtifactName !== undefined) {
        if (windowAppState.semanticThreadArtifactName !== null || threadsSettled) {
            semanticThreadArtifactName.set(windowAppState.semanticThreadArtifactName)
            didHydrate = true
        }
    }
    if (windowAppState.semanticSpaceLayoutManifest !== undefined) {
        if (windowAppState.semanticSpaceLayoutManifest !== null || threadsSettled) {
            layoutManifest.set(windowAppState.semanticSpaceLayoutManifest)
            didHydrate = true
        }
    }
    return didHydrate
}

/** Synchronous snapshot of business records. */
export function getBusinessRecords(): readonly BusinessRecord[] {
    const result = businessRecords.getSnapshot()
    if (result.length > 0) return result
    // Fallback: read from the legacy state when the Svelte store is empty.
    // (Hydration may not have run yet for components created before main.ts calls
    // hydrateFromLegacyState.)
    if (typeof window !== 'undefined') {
        const w = asSemanticExplorerWindow()
        const points = w.__APP_STATE__?.points
        if (Array.isArray(points) && points.length > 0) {
            return points
        }
    }
    return result
}

/** Float32Array of interleaved [x,y,z] positions in [0,1] unit cube */
export const positionBuffer = new RuneStore<Float32Array | null>(null)

/** Uint16Array of cluster assignments per point (parallel to positions) */
export const clustersBuffer = new RuneStore<Uint16Array | null>(null)

/** Map from lead_id to point index for O(1) lookup */
export const pointIndexByLeadId = new RuneStore<Map<string, number>>(new Map())

/** Enrichment data keyed by lead_id */
export const leadEnrichment = new RuneStore<Record<string, import('@lib/types/business').LeadEnrichment> | null>(null)

/** Raw semantic thread bundle */
export const semanticThreadBundle = new RuneStore<SemanticThreadBundle | null>(null)

/** Name of the loaded thread artifact file */
export const semanticThreadArtifactName = new RuneStore<string | null>(null)

/** Normalized neighbor map keyed by lead_id */
export const semanticNeighborMap = new RuneStore<Map<string, SemanticNeighborEntry>>(new Map())

/** Semantic space layout manifest (validation metadata) */
export const layoutManifest = new RuneStore<LayoutManifest | null>(null)

/** Overall data loading state */
export const dataLoadState = getOrCreateRuneStore<DataLoadState>('__SEMANTIC_EXPLORER_DATA_LOAD_STATE__', {
    status: 'idle',
    businessLoaded: false,
    threadsLoaded: false,
    error: null
})

// W72-H3: the in-flight enrichment promise is window-shared (like the stores)
// so a duplicated module (Vite code-splitting) cannot fire duplicate fetches.
const LEAD_ENRICHMENT_PROMISE_SLOT = '__SEMANTIC_EXPLORER_LEAD_ENRICHMENT_PROMISE__' as const

// ── Loading Phase Store ─────────────────────────────────────────────────────

/**
 * Four-phase loading progression: records → scene → restore → launch.
 * The LoadingOverlay and parity-attrs.svelte.ts layer read from this store.
 * Replaces the collapsed 2-state derivation that only had records/launch.
 */
export const loadingPhaseStore = getOrCreateRuneStore<LoadingPhase>(
    '__SEMANTIC_EXPLORER_DATA_LOADING_PHASE__',
    'records'
)

/**
 * Graphics mode: 'webgl' when GPU rendering is available, 'fallback' otherwise.
 * The engine bridge should set this during init; parity-attrs.svelte.ts reads it.
 */
export const graphicsModeStore = getOrCreateRuneStore<'webgl' | 'fallback'>(
    '__SEMANTIC_EXPLORER_DATA_GRAPHICS_MODE__',
    'webgl'
)

/**
 * Set the loading phase. parity-attrs.svelte.ts mirrors this to
 * body.dataset.{loadingOverlay,loadingPhase,sceneReady,cameraAssist}.
 */
export function setLoadingPhase(phase: LoadingPhase): void {
    loadingPhaseStore.set(phase)
}

/**
 * Set the graphics mode. parity-attrs.svelte.ts mirrors this to
 * body.dataset.graphicsMode.
 */
export function setGraphicsMode(mode: 'webgl' | 'fallback'): void {
    graphicsModeStore.set(mode)
}

// ── Derived Stores ────────────────────────────────────────────────────────────
// SEAM-1 pattern: the internal _-prefixed instance keeps getSnapshot()
// available to this module's getters while the exported binding is typed
// exactly as the previous derived() result (Readable).

/** Number of loaded business records */

/** Whether all data is ready */
const _isDataReady = new DerivedRuneStore<boolean>(() => dataLoadState.getSnapshot().status === 'ready', dataLoadState)
export const isDataReady: Readable<boolean> = _isDataReady

/** Whether data is currently loading */
const _isLoading = new DerivedRuneStore<boolean>(() => dataLoadState.getSnapshot().status === 'loading', dataLoadState)
export const isLoading: Readable<boolean> = _isLoading

// ── Getter wrappers (match the .svelte.ts API for compatibility) ──────────

export function getPointIndexByLeadId(): Map<string, number> {
    return pointIndexByLeadId.getSnapshot()
}
export function getLeadEnrichment(): Record<string, import('@lib/types/business').LeadEnrichment> | null {
    return leadEnrichment.getSnapshot()
}
export function getSemanticThreadBundle(): SemanticThreadBundle | null {
    return semanticThreadBundle.getSnapshot()
}
export function getSemanticThreadArtifactName(): string | null {
    return semanticThreadArtifactName.getSnapshot()
}
export function getSemanticNeighborMap(): Map<string, SemanticNeighborEntry> {
    return semanticNeighborMap.getSnapshot()
}
export function getLayoutManifest(): LayoutManifest | null {
    return layoutManifest.getSnapshot()
}
export function getDataLoadState(): DataLoadState {
    return dataLoadState.getSnapshot()
}
export function getIsDataReady(): boolean {
    const local = _isDataReady.getSnapshot()
    if (local) return true
    // Fallback: if the Svelte dataLoadState hasn't been initialized but the
    // legacy state has the data loaded, treat the data as ready.
    if (typeof window !== 'undefined') {
        const w = asSemanticExplorerWindow()
        if (Array.isArray(w.__APP_STATE__?.points) && (w.__APP_STATE__?.points?.length ?? 0) > 0) {
            return true
        }
    }
    return false
}
export function getIsLoading(): boolean {
    return _isLoading.getSnapshot()
}

/**
 * Engine-ready bundle: positions (Float32Array) + cluster assignments
 * (Uint16Array) + point count, in one shape. The canonical accessor for
 * consumers that need the full geometric surface — any future engine
 * refactor that wants {buffer, count, clusters} should call this rather
 * than re-composing the two writables.
 *
 * Returns null until both underlying stores are populated.
 */
// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Set business data from a load result.
 */
export function setBusinessData(result: BusinessDataResult): void {
    businessRecords.set(result.records)
    positionBuffer.set(result.positionsBuffer)
    clustersBuffer.set(result.clustersBuffer)
    pointIndexByLeadId.set(result.pointIndexByLeadId)
    leadEnrichment.set(result.enrichment)

    // Sync back to legacy state so legacy engine selectors (getPoints())
    // and focus flows (focusOnNode) see the data.
    try {
        {
        }

        // Derive originalPositions/nodePositions from the raw buffer so
        // focus-pocket and camera framing can work before/without WebGL init.
        const positionsBuffer = result.positionsBuffer
        if (positionsBuffer && positionsBuffer.length >= result.records.length * 3) {
            const derived: { x: number; y: number; z: number }[] = []
            for (let i = 0; i < result.records.length; i++) {
                derived.push({
                    x: positionsBuffer[i * 3] as number,
                    y: positionsBuffer[i * 3 + 1] as number,
                    z: positionsBuffer[i * 3 + 2] as number
                })
            }
            {
                appState.originalPositions = derived
                appState.nodePositions = derived.slice()
            }
            // W67: positions replaced -> invalidate the projected-neighbor grid +
            // candidate cache. thread-model's buildProjectedNeighborGrid /
            // getProjectedNeighborCandidates memoize forever and are never rebuilt
            // otherwise, so post-load proximity queries would use stale cell buckets.
            appState.projectedNeighborGrid = null
            appState.projectedNeighborCache = new Map()
        }
    } catch (e) {
        debugWarn('[data-store] Legacy state sync failed:', e)
    }
    dataLoadState.update((s) => ({
        ...s,
        businessLoaded: true,
        error: null
    }))

    // W67-D1: dev-only dual-write consistency assertion. setBusinessData is the
    // ONLY writer to both the rune stores AND the appState mirrors; if a future
    // refactor updates one side without the other, legacy selectors (getPoints,
    // focusOnNode) and the rune consumers diverge silently. Catch it here
    // rather than in production. Gated on import.meta.env.DEV so it never
    // ships.
    if (import.meta.env.DEV) {
        const records = businessRecords.getSnapshot()
        const recordCount = records.length
        const issues: string[] = []

        // Invariant 1: appState.nodePositions must be derived from the same
        // record count. A future refactor that sets nodePositions from a
        // different source (or forgets to slice) would silently break
        // focus-pocket and camera framing that reads nodePositions.
        if (appState.nodePositions.length !== recordCount) {
            issues.push(`nodePositions.length=${appState.nodePositions.length} !== records.length=${recordCount}`)
        }

        // Invariant 2: appState.originalPositions must mirror nodePositions
        // in length. They are set from the same derived array in this
        // function; a drift means one was mutated after assignment.
        if (appState.originalPositions.length !== recordCount) {
            issues.push(
                `originalPositions.length=${appState.originalPositions.length} !== records.length=${recordCount}`
            )
        }

        // Invariant 3: positionBuffer (Float32Array) must hold at least
        // recordCount * 3 components. A truncated buffer would produce
        // NaN positions in the engine without any compile-time signal.
        const buf = positionBuffer.getSnapshot()
        if (buf && buf.length < recordCount * 3) {
            issues.push(`positionBuffer.length=${buf.length} < records.length*3=${recordCount * 3}`)
        }

        // Invariant 4: pointIndexByLeadId must have one entry per record.
        // A missing entry means a lead_id lookup returns undefined at runtime.
        const indexMap = pointIndexByLeadId.getSnapshot()
        if (indexMap.size !== recordCount) {
            issues.push(`pointIndexByLeadId.size=${indexMap.size} !== records.length=${recordCount}`)
        }

        if (issues.length > 0) {
            debugWarn('[data-store] W67-D1 dual-write consistency assertion FAILED:\n  -', issues.join('\n  -'))
            if (import.meta.env.VITE_DEBUG_DATA_STORE === '1') {
                throw new Error(`[data-store] W67-D1 dual-write consistency assertion FAILED:\n${issues.join('\n')}`)
            }
        }
    }
}

function describeValue(v: unknown): string {
    if (v == null) return 'null'
    if (Array.isArray(v)) return `array[${v.length}]`
    if (v instanceof Map) return `map[${v.size}]`
    if (v instanceof Set) return `set[${v.size}]`
    if (
        v instanceof ArrayBuffer ||
        (v && typeof v === 'object' && 'length' in v && typeof (v as { length: number }).length === 'number')
    ) {
        return `typedarray[${(v as { length: number }).length}]`
    }
    return typeof v
}

/**
 * Set optional lead enrichment after the required record load has already
 * launched the app.
 */
export function setLeadEnrichmentData(enrichment: Record<string, LeadEnrichment> | null): void {
    leadEnrichment.set(enrichment)
}

/**
 * Hydrate optional lead enrichment without blocking first paint.
 */
export async function loadLeadEnrichment(): Promise<Record<string, LeadEnrichment> | null> {
    const existing = leadEnrichment.getSnapshot()
    if (existing) return existing

    // Cross-chunk singleton (W72-H3): read the in-flight promise from the
    // window slot so a duplicated module shares one fetch instead of N.
    const pending = getWindowSlot(LEAD_ENRICHMENT_PROMISE_SLOT) as
        Promise<Record<string, LeadEnrichment> | null> | null | undefined
    if (pending) return pending

    const promise = loadLeadEnrichmentData()
        .then((enrichment) => {
            if (enrichment) {
                setLeadEnrichmentData(enrichment)
                debugInfo(
                    `[data-store] Lead enrichment loaded for ${Object.keys(enrichment).length.toLocaleString()} records.`
                )
            }
            return enrichment
        })
        .catch((err: unknown) => {
            debugWarn('[data-store] Lead enrichment failed; continuing without it.', err)
            return null
        })
        .finally(() => {
            setWindowSlot(LEAD_ENRICHMENT_PROMISE_SLOT, null)
        })
    setWindowSlot(LEAD_ENRICHMENT_PROMISE_SLOT, promise)
    return promise
}

/**
 * Set semantic thread data from a load result.
 */
export function setSemanticThreadData(result: SemanticThreadDataResult): void {
    semanticThreadBundle.set(result.bundle)
    semanticThreadArtifactName.set(result.artifactName)
    semanticNeighborMap.set(result.neighborMap)
    layoutManifest.set(result.layoutManifest)

    dataLoadState.update((s) => ({
        ...s,
        threadsLoaded: true,
        error: null
    }))
}

/**
 * Mark optional semantic thread hydration as settled after a worker failure.
 * This keeps the Svelte store mirror in sync with legacy state while preserving
 * the graceful fallback behavior used by the field rendering path.
 */
export function setSemanticThreadFailure(error: string): void {
    semanticThreadBundle.set(null)
    semanticThreadArtifactName.set(null)
    semanticNeighborMap.set(new Map())
    layoutManifest.set(null)

    debugWarn('[data-store] Semantic threads failed; using geometric fallback.', error)

    dataLoadState.update((s) => ({
        ...s,
        threadsLoaded: true,
        error: null
    }))
}

/**
 * Set the loading status.
 */
export function setDataLoadStatus(status: DataLoadStatus): void {
    dataLoadState.update((s) => ({ ...s, status }))
}

/**
 * Set a data loading error.
 */
export function setDataLoadError(error: string): void {
    dataLoadState.set({
        status: 'error',
        businessLoaded: dataLoadState.getSnapshot().businessLoaded,
        threadsLoaded: dataLoadState.getSnapshot().threadsLoaded,
        error
    })
}

/**
 * Reset all data stores to initial state.
 */
export function resetDataStores(): void {
    setWindowSlot(LEAD_ENRICHMENT_PROMISE_SLOT, null)
    businessRecords.set([])
    positionBuffer.set(null)
    clustersBuffer.set(null)
    pointIndexByLeadId.set(new Map())
    leadEnrichment.set(null)
    semanticThreadBundle.set(null)
    semanticThreadArtifactName.set(null)
    semanticNeighborMap.set(new Map())
    layoutManifest.set(null)
    dataLoadState.set({
        status: 'idle',
        businessLoaded: false,
        threadsLoaded: false,
        error: null
    })
    setLoadingPhase('records')
    setGraphicsMode('webgl')
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Initialize required data by loading business records.
 *
 * Business records remain on the critical path. Large optional semantic thread
 * hydration is worker-backed and is triggered later by engine/lifecycle.ts.
 *
 * Call this once at app startup, typically from main.ts or App.svelte.
 */
export async function initData(): Promise<void> {
    const current = dataLoadState.getSnapshot()
    if (current.status === 'loading' || current.status === 'ready') {
        debugWarn('[data-store] initData() called while', current.status)
        return
    }

    setDataLoadStatus('loading')
    setLoadingPhase('records')
    debugInfo('[data-store] Starting data initialization...')

    try {
        const businessResult = await loadBusinessData()

        // Business records are required.
        setBusinessData(businessResult)
        setLoadingPhase('scene')
        debugInfo('[data-store] Business records loaded.')

        // Semantic threads are optional and worker-backed. They are loaded later by
        // engine/lifecycle.ts so the main startup path does not block on the 40 MB
        // thread artifact while the field is still becoming interactive.
        setLoadingPhase('restore')
        debugInfo('[data-store] Semantic threads deferred to worker lifecycle hydration.')

        // Final phase: launch
        setLoadingPhase('launch')
        // F3 (data-pipeline bugsweep 2026-08-08): threadsLoaded is intentionally
        // NOT set here. Semantic threads load later — loadSemanticThreads() runs
        // inside initEngineHeavy (engine/lifecycle.ts) and flips threadsLoaded
        // when it actually settles via setSemanticThreadData()/setSemanticThreadFailure().
        // status:'ready' is accurate for business data only; keep threadsLoaded
        // false until threads arrive so consumers can't read null bundles.
        dataLoadState.update((s) => ({
            ...s,
            status: 'ready',
            businessLoaded: true,
            error: null
        }))
        // Lead enrichment is loaded on-demand when the user first selects a
        // business card, not at startup, to keep the initial paint light.
        debugInfo('[data-store] Data initialization complete.')
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        debugError('[data-store] Unexpected error during init:', msg)
        setDataLoadError(msg)
        // F1 (data-pipeline bugsweep 2026-08-08): do NOT set phase='launch'
        // here — that hides the loading overlay BEFORE the error UI can
        // render (actuallyVisible gates on launch). The overlay now stays
        // visible while isError is set (LoadingOverlay actuallyVisible has
        // an isError term). Leave phase as-is so the error state shows.
    }
}
