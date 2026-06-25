/**
 * @lib/types/business.ts — Business/node type definitions
 *
 * Represents the 8,406 Montgomery County business records in the semantic field.
 */

import type { RelationshipRole } from '@lib/utils/relationship-roles'

/** Cluster/category index matching CLUSTER_NAMES in state.js */
export type ClusterIndex = number

/** Raw business record as loaded from county data */
export interface BusinessRecord {
    id: string
    lead_id: string
    name: string
    what: string
    public_note: string
    public_detail: string
    status: 'active' | 'inactive' | 'disqualified' | string
    category: string
    cluster: ClusterIndex
    city: string
    zip: string
    website: string | null
    email: string | null
    phone: string | null
    trivia?: string | null
    lat: number | null
    lng: number | null
    geocoded: boolean
    /** Index signature — allows structural compatibility with the looser `Point`
     *  shape used by journey/inspector modules. Extra fields are ignored. */
    [key: string]: unknown
}

/** Node in the 3D semantic field */
export interface SemanticNode {
    /** Index in the points array (0-based) */
    index: number
    /** Lead ID from the database */
    leadId: string
    /** Business name */
    name: string
    /** Cluster category index */
    cluster: ClusterIndex
    /** Position in 3D space [x, y, z] in [0,1] unit cube */
    position: [number, number, number]
    /** Raw position from the Float32Array buffer */
    bufferOffset: number
    /** Synergy score (relationship density) */
    synergyScore: number
    /** Whether the node has a geocode */
    geocoded: boolean
    /** Whether the node is currently filtered out */
    filtered: boolean
    /** The underlying business record */
    record: BusinessRecord
}

/** Connection/edge between two nodes */
export interface SemanticEdge {
    sourceIndex: number
    targetIndex: number
    weight: number
    relationshipLabel: string
    type: 'geometric' | 'semantic' | 'trail'
    reason: string
}

/** A trail stop in a journey path */
export interface TrailSegment {
    fromIndex: number
    toIndex: number
    weight: number
    label: string
}

/** Neighbor relationship between two nodes */
export interface NeighborRelationship {
    sourceIndex: number
    targetIndex: number
    score: number
    role: 'direct' | 'support' | 'civic' | 'geometric-fallback'
    label: string
}

/** Position buffer layout descriptor */
export interface PositionBufferDescriptor {
    /** Float32Array of interleaved [x,y,z] positions */
    buffer: Float32Array
    /** Number of points */
    count: number
    /** Cluster assignment per point (parallel array) */
    clusters: Uint16Array
}

/** Cluster color and metadata */
export interface ClusterMeta {
    name: string
    color: string
    index: ClusterIndex
}

/** Enrichment data from lead enrichment JSON */
export interface LeadEnrichment {
    lead_id: string
    category?: string
    website_status?: string
    email_verified?: boolean
    synergy_score?: number
    cluster_assignment?: string
}

// ── Semantic Thread Types ──────────────────────────────────────────────────────

/** A neighbor entry inside a semantic thread node */
export interface SemanticThreadNeighbor {
    lead_id: string | null
    score: number
    semantic_score: number
    same_city: boolean
    same_status: boolean
    bridge_score: number
    signal_score: number
    thread_type: string
    relationship_role: string
    relationship_axis: string
    role_reason: string
    reason: string
}

/** A node in the semantic thread bundle (keyed by fallback lead_id) */
export interface SemanticThreadNode {
    lead_id: string | null
    name: string | null
    city: string | null
    status: string | null
    signal_score: number
    neighbors: SemanticThreadNeighbor[]
}

/** Raw semantic thread bundle from semantic_threads.dat */
export interface SemanticThreadBundle {
    nodes: Record<string, SemanticThreadNode>
}

/** Semantic space layout manifest from semantic_space_layout_manifest.json */
export interface LayoutManifest {
    generated_at?: string
    method?: string
    rows: number
    edges: number
    thread_path?: string
    data_path?: string
}

/** Normalized neighbor entry after processing (for store consumption) */
export interface SemanticNeighborEntry {
    leadId: string
    name: string | null
    city: string | null
    status: string | null
    signalScore: number
    neighbors: SemanticNeighborDetail[]
}

/** A single neighbor detail in the normalized neighbor map */
export interface SemanticNeighborDetail {
    leadId: string
    score: number
    semanticScore: number
    sameCity: boolean
    sameStatus: boolean
    bridgeScore: number
    signalScore: number
    threadType: string
    relationshipRole: RelationshipRole
    relationshipAxis: string
    roleReason: string
    reason: string
}

// ── Data Loading Result Types ──────────────────────────────────────────────────

/** Result of loading business records from data.dat */
export interface BusinessDataResult {
    records: BusinessRecord[]
    positionsBuffer: Float32Array
    clustersBuffer: Uint16Array
    pointIndexByLeadId: Map<string, number>
    enrichment: Record<string, LeadEnrichment> | null
}

/** Result of loading semantic thread data */
export interface SemanticThreadDataResult {
    bundle: SemanticThreadBundle
    artifactName: string
    neighborMap: Map<string, SemanticNeighborEntry>
    layoutManifest: LayoutManifest | null
}
