import * as THREE from 'three'

export interface PointData {
    x?: number
    y?: number
    z?: number
    cluster?: number
    lead_id?: string | number
}

export interface SemanticNeighbor {
    leadId: string | number
    semanticScore?: number
    bridgeScore?: number
    sameCity?: boolean
    threadType?: string
}

export interface SemanticNode {
    neighbors: SemanticNeighbor[]
}

export interface Diagnostics {
    active: boolean
    reason?: string
    sampleCount?: number
    avgFrameMs?: number
    frameMsAverage?: number
    avgUpdateMs?: number
    avgRenderMs?: number
    lastFrameAt?: number
    drawCalls?: number
    triangles?: number
    myceliumCoreSegments?: number
    myceliumWispySegments?: number
    myceliumBridgeSegments?: number
    renderer?: string | null
    vendor?: string | null
}

export interface WebGLContextState {
    scene: THREE.Scene | null
    camera: THREE.PerspectiveCamera | null
    renderer: THREE.WebGLRenderer | null
    controls: any | null
    pointsMesh: THREE.Points | null
    pointsMaterial: THREE.PointsMaterial | null
    nodeSporeMesh: THREE.InstancedMesh | null
    nodeSporeMaterial: THREE.Material | null
    rawPositionsBuffer: Float32Array | null
    rawClustersBuffer: Float32Array | null
    myceliumLines: THREE.LineSegments | null
    myceliumGroup: THREE.Group | null
    myceliumCoreLines: THREE.LineSegments | null
    myceliumWispyLines: THREE.LineSegments | null
    myceliumBridgeLines: THREE.LineSegments | null
    focusSemanticLines: THREE.LineSegments | null
    focusSemanticConnectionPairs: Array<{ a: number; b: number; layer: number }>
    semanticLensGroup: THREE.Group | null
    semanticLensGlow: THREE.Mesh | null
    semanticLensSpokes: THREE.LineSegments | null
    myceliumConnectionPairs: Array<{ a: number; b: number; layer: number }>
    hemiLight: THREE.HemisphereLight | null
    dirLight: THREE.DirectionalLight | null
    focusLens: THREE.Mesh | null
    focusHalo: THREE.Sprite | null
    focusCore: THREE.Mesh | null
    focusMoteGroup: THREE.Group | null
    focusMotes: THREE.Points[]
    focusPetalGroup: THREE.Group | null
    focusPetals: THREE.Points[]
    focusFilaments: THREE.LineSegments | null
    focusAnchorGroup: THREE.Group | null
    focusAnchorRingMesh: THREE.Mesh | null
    focusAnchorHaloSprite: THREE.Sprite | null
    hoverHalo: THREE.Sprite | null
    semanticManifold: THREE.Mesh | null
    routeTraceLines: THREE.LineSegments | null
    arrivalHandoffGroup: THREE.Group | null
    routeTraceConnectionPairs: Array<{ a: number; b: number; layer: number }>
    routeTraceRenderStateKey: string
    inspectedStrandGroup: THREE.Group | null
    [key: string]: any // Allow arbitrary dynamic properties from legacy code
}

export interface IDisposable {
    dispose(): void
}
