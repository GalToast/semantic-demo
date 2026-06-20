/**
 * @lib/data-store.svelte.ts — Data stores for business records and semantic threads (Svelte 5 runes)
 *
 * Replaces the data slices from js/state.js with Svelte stores.
 * Required business records are populated by initData(); large optional
 * enrichment and semantic thread artifacts hydrate after launch.
 */

import { get } from 'svelte/store'
import {
    businessRecords,
    loadingPhaseStore,
    graphicsModeStore,
    leadEnrichment as leadEnrichmentCanonical,
    semanticThreadBundle as semanticThreadBundleStore,
    semanticThreadArtifactName as semanticThreadArtifactNameStore,
    semanticNeighborMap as semanticNeighborMapStore,
    layoutManifest as layoutManifestStore
} from './data-store.ts'
import type { BusinessRecord, BusinessDataResult, SemanticThreadDataResult, PositionBufferDescriptor } from '@lib/types/business'
import type { LoadingPhase } from '@lib/types/state'
import { loadBusinessData } from '@lib/data-loader'
import { debugInfo, debugWarn } from '@lib/utils/diagnostic-adapter'

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

/** Raw business records loaded from data.dat. Svelte writable so module-level
 *  state propagates reactively to consumers (a module-level $state rune read
 *  through a function does not always track in $derived callbacks). */
/** Re-export the canonical writable from data-store.ts so all consumers share the same instance. */
export const businessRecordsStore = businessRecords
export function getBusinessRecords() {
    return get(businessRecordsStore)
}

/** Float32Array of interleaved [x,y,z] positions in [0,1] unit cube */
let positionBuffer = $state<Float32Array | null>(null)
export function getPositionBuffer() {
    return positionBuffer
}

/** Uint16Array of cluster assignments per point (parallel to positions) */
let clustersBuffer = $state<Uint16Array | null>(null)
export function getClustersBuffer() {
    return clustersBuffer
}

/** Map from lead_id to point index for O(1) lookup */
let pointIndexByLeadId = $state<Map<string, number>>(new Map())
export function getPointIndexByLeadId() {
    return pointIndexByLeadId
}

/** Enrichment data keyed by lead_id. Re-export the canonical writable so
 *  lazy hydration updates the same store read by legacy/engine sync paths. */
export const leadEnrichmentStore = leadEnrichmentCanonical
export function getLeadEnrichment() {
    return get(leadEnrichmentStore)
}

/** Raw semantic thread bundle — kept in sync with the canonical writable store. */
let semanticThreadBundle = get(semanticThreadBundleStore)
export function getSemanticThreadBundle() {
    return semanticThreadBundle
}

/** Name of the loaded thread artifact file */
let semanticThreadArtifactName = get(semanticThreadArtifactNameStore)
export function getSemanticThreadArtifactName() {
    return semanticThreadArtifactName
}

/** Normalized neighbor map keyed by lead_id */
let semanticNeighborMap = get(semanticNeighborMapStore)
export function getSemanticNeighborMap() {
    return semanticNeighborMap
}

/** Semantic space layout manifest (validation metadata) */
let layoutManifest = get(layoutManifestStore)
export function getLayoutManifest() {
    return layoutManifest
}

semanticThreadBundleStore.subscribe((v) => {
    semanticThreadBundle = v
})
semanticThreadArtifactNameStore.subscribe((v) => {
    semanticThreadArtifactName = v
})
semanticNeighborMapStore.subscribe((v) => {
    semanticNeighborMap = v
})
layoutManifestStore.subscribe((v) => {
    layoutManifest = v
})

/** Overall data loading state */
let _dataLoadState = $state<DataLoadState>({
    status: 'idle',
    businessLoaded: false,
    threadsLoaded: false,
    error: null
})
export function getDataLoadState() {
    return _dataLoadState
}

// ── Loading Phase Store ─────────────────────────────────────────────────────

/**
 * Four-phase loading progression: records → scene → restore → launch.
 * The LoadingOverlay and parity-attrs.svelte.ts layer read from this store.
 */
export { loadingPhaseStore, graphicsModeStore }
export function getLoadingPhaseStore() {
    return get(loadingPhaseStore)
}
export function getGraphicsModeStore() {
    return get(graphicsModeStore)
}

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

// ── Svelte 5 Rune State (mirrors the writable store for reactive consumption) ──

let _businessRecordsRune = $state<readonly BusinessRecord[]>([])

// Keep the rune in sync with the canonical writable store.
businessRecordsStore.subscribe((records) => {
    _businessRecordsRune = records
})

// ── Derived Stores ────────────────────────────────────────────────────────────

/** Number of loaded business records */
const _recordCount = $derived(_businessRecordsRune.length)
export function getRecordCount() {
    return _recordCount
}

/** Whether all data is ready */
const _isDataReady = $derived(_dataLoadState.status === 'ready')
export function getIsDataReady() {
    return _isDataReady
}

/** Whether data is currently loading */
const _isLoading = $derived(_dataLoadState.status === 'loading')
export function getIsLoading() {
    return _isLoading
}

/** Position buffer as a PositionBufferDescriptor (ready for WebGL) */
const _positionDescriptor = $derived.by((): PositionBufferDescriptor | null => {
    if (!positionBuffer || !clustersBuffer) return null
    return {
        buffer: positionBuffer,
        count: positionBuffer.length / 3,
        clusters: clustersBuffer
    }
})
export function getPositionDescriptor() {
    return _positionDescriptor
}

/** Total number of semantic thread edges */
const _threadEdgeCount = $derived.by(() => {
    if (!semanticThreadBundle?.nodes) return 0
    return Object.values(semanticThreadBundle.nodes).reduce(
        (sum, node) => sum + (Array.isArray(node?.neighbors) ? node.neighbors.length : 0),
        0
    )
})
export function getThreadEdgeCount() {
    return _threadEdgeCount
}

/** Number of entries in the semantic neighbor map */
const _neighborMapSize = $derived(semanticNeighborMap.size)
export function getNeighborMapSize() {
    return _neighborMapSize
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Set business data from a load result.
 */
export function setBusinessData(result: BusinessDataResult): void {
    businessRecordsStore.set(result.records)
    positionBuffer = result.positionsBuffer
    clustersBuffer = result.clustersBuffer
    pointIndexByLeadId = result.pointIndexByLeadId
    _dataLoadState.businessLoaded = true
    _dataLoadState.error = null
}

/**
 * Set semantic thread data from a load result.
 */
export function setSemanticThreadData(result: SemanticThreadDataResult): void {
    semanticThreadBundleStore.set(result.bundle)
    semanticThreadArtifactNameStore.set(result.artifactName)
    semanticNeighborMapStore.set(result.neighborMap)
    layoutManifestStore.set(result.layoutManifest)
    _dataLoadState.threadsLoaded = true
    _dataLoadState.error = null
}

export { setSemanticThreadFailure } from './data-store.ts'

/**
 * Set the loading status.
 */
export function setDataLoadStatus(status: DataLoadStatus): void {
    _dataLoadState.status = status
}

/**
 * Set a data loading error.
 */
export function setDataLoadError(error: string): void {
    _dataLoadState.status = 'error'
    _dataLoadState.error = error
}

/**
 * Reset all data stores to initial state.
 */
export function resetDataStores(): void {
    businessRecordsStore.set([])
    positionBuffer = null
    clustersBuffer = null
    pointIndexByLeadId = new Map()
    semanticThreadBundleStore.set(null)
    semanticThreadArtifactNameStore.set(null)
    semanticNeighborMapStore.set(new Map())
    layoutManifestStore.set(null)
    _dataLoadState.status = 'idle'
    _dataLoadState.businessLoaded = false
    _dataLoadState.threadsLoaded = false
    _dataLoadState.error = null
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
    const current = _dataLoadState
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
        _dataLoadState.status = 'ready'
        _dataLoadState.businessLoaded = true
        _dataLoadState.threadsLoaded = true
        _dataLoadState.error = null
        debugInfo('[data-store] Data initialization complete.')
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[data-store] Unexpected error during init:', msg)
        setDataLoadError(msg)
        setLoadingPhase('launch') // dismiss overlay on error
    }
}
