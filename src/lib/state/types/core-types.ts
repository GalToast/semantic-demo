/**
 * @lib/state/types/core-types.ts — Core types shared across state modules.
 *
 * Extracted from state-types.ts (W13-T5b) to reduce file size.
 * Contains fundamental types: geometry, renderer, config, data, and common UI types.
 */

import type { Vector3 } from 'three'

export interface Vector3Like {
    x: number
    y: number
    z: number
    clone?(): Vector3Like
    copy?(v: Vector3Like): Vector3Like
    set?(x: number, y: number, z: number): Vector3Like
    add?(v: Vector3Like): Vector3Like
    sub?(v: Vector3Like): Vector3Like
    multiplyScalar?(s: number): Vector3Like
    normalize?(): Vector3Like
    lerpVectors?(a: Vector3Like, b: Vector3Like, alpha: number): Vector3Like
    distanceTo?(v: Vector3Like): number
    length?(): number
    lengthSq?(): number
    setLength?(l: number): Vector3Like
    toArray?(array?: number[], offset?: number): number[]
    fromArray?(array: number[], offset?: number): Vector3Like
}

export interface NodePosition {
    x: number
    y: number
    z: number
}

export interface CameraLike {
    position: Vector3
    fov?: number
    aspect?: number
    updateProjectionMatrix?(): void
    lookAt?(x: number, y: number, z: number): void
    setViewOffset?(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void
    clearViewOffset?(): void
}

export interface ControlsLike {
    target: Vector3
    update(): void
    enabled: boolean
    autoRotate?: boolean
    autoRotateSpeed?: number
    minDistance?: number
    maxDistance?: number
    rotateSpeed?: number
    panSpeed?: number
    enableDamping?: boolean
    dampingFactor?: number
    zoomSpeed?: number
    enablePan?: boolean
}

export interface RendererInfoMemory {
    geometries?: number
    textures?: number
}

export interface RendererInfo {
    memory: RendererInfoMemory
    programs?: unknown[] | null
    render?: { calls?: number; triangles?: number }
}

export interface RendererLike {
    domElement: HTMLCanvasElement
    render(scene: unknown, camera: unknown): void
    compile?(scene: unknown, camera: unknown): void
    setSize?(width: number, height: number): void
    setPixelRatio?(ratio: number): void
    dispose?(): void
    info: RendererInfo
}

export type ClusterName =
    | 'General Business'
    | 'Professional Services'
    | 'Food & Hospitality'
    | 'Construction & Trades'
    | 'Retail & Shops'
    | 'Beauty & Wellness'
    | 'Real Estate & Property'
    | 'Industrial & Logistics'
    | 'Agriculture & Ranching'
    | 'Automotive'
    | 'Healthcare & Medical'
    | 'Therapy & Counseling'
    | 'Education & Childcare'
    | 'Churches'
    | 'Faith Ministries'
    | 'Community Nonprofits'
    | 'Foundations'
    | 'Arts & Culture'
    | 'Economic Development'
    | 'Public Agencies'
    | 'Enterprise Brands'

export type ViewName = 'galaxy' | 'map'

export type CompassPhase = 'overview' | 'search' | 'focus' | 'trail' | 'inside' | 'map'

export type ThreadSource = 'geometric-fallback' | string | null

export type LoadingPhaseKey = 'records' | 'scene' | 'restore' | 'launch'

export interface LoadingPhaseMeta {
    progress: number
    note: string
    foot: string
}

export interface CanvasHoverCandidate {
    index?: number
    screenX?: number
    screenY?: number
    source?: string
    reason?: string
    [key: string]: unknown
}

export interface ThreadCandidateLike {
    index: number
    score: number
    semanticScore: number
    sameCity: boolean
    sameStatus: boolean
    bridgeScore: number
    signalScore: number
    threadType: string
    relationshipRole: string
    relationshipAxis: string
    roleReason: string
    reason: string
    source: string
    [key: string]: unknown
}

export interface ConstellationMotif {
    label: string
    directLift: number
    supportLift: number
    directPriority: number
    supportPriority: number
    braid: number
}

export type ConstellationMotifName = 'rosette' | 'lattice' | 'delta' | 'market' | 'civic'

export interface Point {
    name?: string | null
    what?: string | null
    trivia?: string | null
    public_note?: string | null
    public_detail?: string | null
    city?: string | null
    cluster?: number | null
    status?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
    lat?: number | null
    lng?: number | null
    lead_id?: string | number | null
    x?: number
    y?: number
    z?: number
    [key: string]: unknown
}

export interface SemanticNeighbor {
    leadId: string | number
    semanticScore?: number
    score?: number
    bridgeScore?: number
    sameCity?: boolean
    threadType?: string
}

export interface SemanticNode {
    leadId: string
    neighbors: SemanticNeighbor[]
}

export interface StateConfig {
    MAP_HANDOFF_PRELUDE_MS: number
    VIEW_HANDOFF_OUT_MS: number
    TERRAIN_LANDING_SETTLE_MS: number
    TERRAIN_LANDING_SETTLE_LONG_MS: number
    SHOW_VIEW_HANDOFF_DISMISS_MS: number
    MAP_TRAIL_REFRESH_LATE_DELAY_MS: number
    AUTO_ROTATE_IDLE_MS: number
    AUTO_ROTATE_MANUAL_IDLE_MS: number
    AUTO_ROTATE_SOFT_RESUME_MS: number
    AUTO_ROTATE_BASE_SPEED: number
    MOBILE_ROUTE_FIELD_PEEK_MS: number
    SELECTED_CARD_FADE_MS: number
    ORBIT_MIN_DISTANCE_DEFAULT: number
    ORBIT_MIN_DISTANCE_INSIDE: number
    ORBIT_MAX_DISTANCE_DEFAULT: number
    ORBIT_MAX_DISTANCE_FREE: number
    ORBIT_ROTATE_SPEED_DEFAULT: number
    ORBIT_ROTATE_SPEED_FREE: number
    ORBIT_PAN_SPEED_DEFAULT: number
    ORBIT_PAN_SPEED_FREE: number
    SEARCH_TRAIL_CUE_MIN_DWELL_MS: number
    JOURNEY_COMPASS_PHASE_ORDER: readonly CompassPhase[]
    FOCUS_CONSTELLATION_MOTIFS: Record<ConstellationMotifName, ConstellationMotif>
    SCENE_REVEAL_DURATION_MS: number
    LOADING_MIN_VISIBLE_MS: number
    POINTS_MATERIAL_BASE_SIZE: number
    POINTS_MATERIAL_BASE_OPACITY: number
    FOCUS_THREAD_SEGMENTS: number
    HOVER_LOCK_CONFIRM_MS: number
    HOVER_SAMPLE_MS: number
    COLORS: readonly string[]
    CLUSTER_NAMES: readonly ClusterName[]
    LOADING_PHASE_META: Record<LoadingPhaseKey, LoadingPhaseMeta>
}
