/**
 * @lib/data-store.ts — Data stores for business records and semantic threads
 *
 * Replaces the data slices from js/state.js with Svelte stores.
 * Required business records are populated by initData(); large optional
 * enrichment and semantic thread artifacts hydrate after launch.
 */

import { writable, derived, get } from 'svelte/store'
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
import type { Point } from '@lib/state/state-types'
import { loadBusinessData, loadLeadEnrichmentData } from '@lib/data-loader'
import { debugInfo, debugWarn } from '@lib/utils/diagnostic-adapter'
import { appState } from '@lib/state/app.svelte'

// ── Cross-chunk singleton helpers ────────────────────────────────────────────
// When Vite code-splits, this module can be duplicated into multiple chunks.
// Each duplicate would create its own writable-store instances, so consumers
// in different chunks would see different (empty) stores.  We use a plain
// *window* data property to share the canonical store instances.
function getOrCreateWritable<T>(windowKey: string, initial: T) {
    const existing = typeof window !== 'undefined' ? (window as Record<string, unknown>)[windowKey] : undefined
    if (existing && typeof existing.subscribe === 'function') {
        return existing as ReturnType<typeof writable<T>>
    }
    const store = writable<T>(initial)
    if (typeof window !== 'undefined') {
        ;(window as Record<string, unknown>)[windowKey] = store
    }
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
export const businessRecords = getOrCreateWritable<readonly BusinessRecord[]>(
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
    const w = window as unknown as {
        __APP_STATE__?: {
            points?: readonly BusinessRecord[]
            semanticNeighborMapByLeadId?: Map<string, unknown>
            semanticThreadBundle?: unknown
            semanticThreadArtifactName?: unknown
            semanticThreadsStatus?: string
            semanticSpaceLayoutManifest?: unknown
            threadCandidates?: readonly number[]
            threadSource?: string
        }
    }
    const windowAppState = w.__APP_STATE__
    if (!windowAppState) return false
    const legacy = windowAppState as Record<string, unknown>
    let didHydrate = false
    if (Array.isArray(windowAppState.points) && windowAppState.points.length > 0) {
        businessRecords.set(windowAppState.points as BusinessRecord[])
        didHydrate = true
    }
    if (legacy.semanticNeighborMapByLeadId instanceof Map) {
        semanticNeighborMap.set(legacy.semanticNeighborMapByLeadId as Map<string, SemanticNeighborEntry>)
        didHydrate = true
    }
    if (legacy.semanticThreadBundle !== undefined) {
        semanticThreadBundle.set(legacy.semanticThreadBundle as SemanticThreadBundle | null)
        didHydrate = true
    }
    if (legacy.semanticThreadArtifactName !== undefined) {
        semanticThreadArtifactName.set(legacy.semanticThreadArtifactName as string | null)
        didHydrate = true
    }
    if (legacy.semanticSpaceLayoutManifest !== undefined) {
        layoutManifest.set(legacy.semanticSpaceLayoutManifest as LayoutManifest | null)
        didHydrate = true
    }
    return didHydrate
}

/** Synchronous snapshot of business records. */
export function getBusinessRecords(): readonly BusinessRecord[] {
    let result: readonly BusinessRecord[] = []
    const unsub = businessRecords.subscribe((v) => {
        result = v
    })
    unsub()
    if (result.length > 0) return result
    // Fallback: read from the legacy state when the Svelte store is empty.
    // (Hydration may not have run yet for components created before main.ts calls
    // hydrateFromLegacyState.)
    if (typeof window !== 'undefined') {
        const w = window as unknown as { __APP_STATE__?: { points?: readonly BusinessRecord[] } }
        const points = w.__APP_STATE__?.points
        if (Array.isArray(points) && points.length > 0) {
            return points
        }
    }
    return result
}

/** Float32Array of interleaved [x,y,z] positions in [0,1] unit cube */
export const positionBuffer = writable<Float32Array | null>(null)

/** Uint16Array of cluster assignments per point (parallel to positions) */
export const clustersBuffer = writable<Uint16Array | null>(null)

/** Map from lead_id to point index for O(1) lookup */
export const pointIndexByLeadId = writable<Map<string, number>>(new Map())

/** Enrichment data keyed by lead_id */
export const leadEnrichment = writable<Record<string, import('@lib/types/business').LeadEnrichment> | null>(null)

/** Raw semantic thread bundle */
export const semanticThreadBundle = writable<SemanticThreadBundle | null>(null)

/** Name of the loaded thread artifact file */
export const semanticThreadArtifactName = writable<string | null>(null)

/** Normalized neighbor map keyed by lead_id */
export const semanticNeighborMap = writable<Map<string, SemanticNeighborEntry>>(new Map())

/** Semantic space layout manifest (validation metadata) */
export const layoutManifest = writable<LayoutManifest | null>(null)

/** Overall data loading state */
export const dataLoadState = getOrCreateWritable<DataLoadState>('__SEMANTIC_EXPLORER_DATA_LOAD_STATE__', {
    status: 'idle',
    businessLoaded: false,
    threadsLoaded: false,
    error: null
})

let leadEnrichmentLoadPromise: Promise<Record<string, LeadEnrichment> | null> | null = null

// ── Loading Phase Store ─────────────────────────────────────────────────────

/**
 * Four-phase loading progression: records → scene → restore → launch.
 * The LoadingOverlay and parity-attrs.svelte.ts layer read from this store.
 * Replaces the collapsed 2-state derivation that only had records/launch.
 */
export const loadingPhaseStore = getOrCreateWritable<LoadingPhase>(
    '__SEMANTIC_EXPLORER_DATA_LOADING_PHASE__',
    'records'
)

/**
 * Graphics mode: 'webgl' when GPU rendering is available, 'fallback' otherwise.
 * The engine bridge should set this during init; parity-attrs.svelte.ts reads it.
 */
export const graphicsModeStore = getOrCreateWritable<'webgl' | 'fallback'>(
    '__SEMANTIC_EXPLORER_DATA_GRAPHICS_MODE__',
    'webgl'
)

/**
 * Set the loading phase and sync body.dataset for legacy test compat.
 */
export function setLoadingPhase(phase: LoadingPhase): void {
    loadingPhaseStore.set(phase)
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.loadingPhase = phase
    }
}

/**
 * Set the graphics mode and sync body.dataset.
 */
export function setGraphicsMode(mode: 'webgl' | 'fallback'): void {
    graphicsModeStore.set(mode)
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.graphicsMode = mode
    }
}

// ── Derived Stores ────────────────────────────────────────────────────────────

/** Number of loaded business records */
export const recordCount = derived(businessRecords, ($r) => $r.length)

/** Whether all data is ready */
export const isDataReady = derived(dataLoadState, ($s) => $s.status === 'ready')

/** Whether data is currently loading */
export const isLoading = derived(dataLoadState, ($s) => $s.status === 'loading')

// ── Getter wrappers (match the .svelte.ts API for compatibility) ──────────

export function getPointIndexByLeadId(): Map<string, number> {
    return get(pointIndexByLeadId)
}
export function getLeadEnrichment(): Record<string, import('@lib/types/business').LeadEnrichment> | null {
    return get(leadEnrichment)
}
export function getSemanticThreadBundle(): SemanticThreadBundle | null {
    return get(semanticThreadBundle)
}
export function getSemanticThreadArtifactName(): string | null {
    return get(semanticThreadArtifactName)
}
export function getSemanticNeighborMap(): Map<string, SemanticNeighborEntry> {
    return get(semanticNeighborMap)
}
export function getLayoutManifest(): LayoutManifest | null {
    return get(layoutManifest)
}
export function getDataLoadState(): DataLoadState {
    return get(dataLoadState)
}
export function getIsDataReady(): boolean {
    const local = get(isDataReady)
    if (local) return true
    // Fallback: if the Svelte dataLoadState hasn't been initialized but the
    // legacy state has the data loaded, treat the data as ready.
    if (typeof window !== 'undefined') {
        const w = window as unknown as { __APP_STATE__?: { points?: readonly unknown[] } }
        if (Array.isArray(w.__APP_STATE__?.points) && (w.__APP_STATE__?.points?.length ?? 0) > 0) {
            return true
        }
    }
    return false
}
export function getIsLoading(): boolean {
    return get(isLoading)
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
export function getPositionBufferDescriptor(): PositionBufferDescriptor | null {
    const buffer = get(positionBuffer)
    const clusters = get(clustersBuffer)
    if (!buffer || !clusters) return null
    return { buffer, count: buffer.length / 3, clusters }
}

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
        appState.points = result.records as unknown as Point[]
        appState.rawPositionsBuffer = result.positionsBuffer
        appState.rawClustersBuffer = result.clustersBuffer
        appState.leadEnrichment = result.enrichment
        appState.pointIndexByLeadId = result.pointIndexByLeadId
    } catch (e) {
        if (import.meta.env.DEV) console.warn('[data-store] Legacy state sync failed:', e)
    }
    dataLoadState.update((s) => ({
        ...s,
        businessLoaded: true,
        error: null
    }))
}

/**
 * Set optional lead enrichment after the required record load has already
 * launched the app.
 */
export function setLeadEnrichmentData(enrichment: Record<string, LeadEnrichment> | null): void {
    leadEnrichment.set(enrichment)
    try {
        appState.leadEnrichment = enrichment
    } catch (e) {
        if (import.meta.env.DEV) console.warn('[data-store] Legacy enrichment sync failed:', e)
    }
}

/**
 * Hydrate optional lead enrichment without blocking first paint.
 */
export async function loadLeadEnrichment(): Promise<Record<string, LeadEnrichment> | null> {
    const existing = get(leadEnrichment)
    if (existing) return existing

    if (!leadEnrichmentLoadPromise) {
        leadEnrichmentLoadPromise = loadLeadEnrichmentData()
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
                leadEnrichmentLoadPromise = null
            })
    }

    return leadEnrichmentLoadPromise
}

/**
 * Set semantic thread data from a load result.
 */
export function setSemanticThreadData(result: SemanticThreadDataResult): void {
    semanticThreadBundle.set(result.bundle)
    semanticThreadArtifactName.set(result.artifactName)
    semanticNeighborMap.set(result.neighborMap)
    layoutManifest.set(result.layoutManifest)

    // Sync back to legacy state so legacy neighborhood / thread builders see the data.
    try {
        appState.semanticNeighborMapByLeadId = result.neighborMap
        appState.semanticThreadBundle = result.bundle
        appState.semanticThreadArtifactName = result.artifactName
    } catch (e) {
        if (import.meta.env.DEV) console.warn('[data-store] Legacy semantic thread sync failed:', e)
    }

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

    if (import.meta.env.DEV) console.warn('[data-store] Semantic threads failed; using geometric fallback.', error)

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
        businessLoaded: get(dataLoadState).businessLoaded,
        threadsLoaded: get(dataLoadState).threadsLoaded,
        error
    })
}

/**
 * Reset all data stores to initial state.
 */
export function resetDataStores(): void {
    leadEnrichmentLoadPromise = null
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
    const current = get(dataLoadState)
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
        dataLoadState.update((s) => ({
            ...s,
            status: 'ready',
            businessLoaded: true,
            threadsLoaded: true,
            error: null
        }))
        // Lead enrichment is loaded on-demand when the user first selects a
        // business card, not at startup, to keep the initial paint light.
        debugInfo('[data-store] Data initialization complete.')
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (import.meta.env.DEV) console.error('[data-store] Unexpected error during init:', msg)
        setDataLoadError(msg)
        setLoadingPhase('launch') // dismiss overlay on error
    }
}
