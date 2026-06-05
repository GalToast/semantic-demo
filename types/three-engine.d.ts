import * as THREE from 'three';

export interface PointData {
    x?: number;
    y?: number;
    z?: number;
    cluster?: number;
    lead_id?: string | number;
}

export interface SemanticNeighbor {
    leadId: string | number;
    semanticScore?: number;
    bridgeScore?: number;
    sameCity?: boolean;
    threadType?: string;
}

export interface SemanticNode {
    neighbors: SemanticNeighbor[];
}

export interface Diagnostics {
    active: boolean;
    reason?: string;
    sampleCount?: number;
    avgFrameMs?: number;
    frameMsAverage?: number;
    avgUpdateMs?: number;
    avgRenderMs?: number;
    lastFrameAt?: number;
    drawCalls?: number;
    triangles?: number;
    myceliumCoreSegments?: number;
    myceliumWispySegments?: number;
    myceliumBridgeSegments?: number;
    renderer?: string | null;
    vendor?: string | null;
}

export interface WebGLContextState {
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    controls: any | null;
    pointsMesh: THREE.Points | null;
    pointsMaterial: THREE.PointsMaterial | null;
    nodeSporeMesh: THREE.InstancedMesh | null;
    nodeSporeHitMesh: THREE.InstancedMesh | null;
    nodeSporeMaterial: THREE.Material | null;
    myceliumGroup: THREE.Group | null;
    myceliumCoreLines: THREE.LineSegments | null;
    myceliumWispyLines: THREE.LineSegments | null;
    myceliumBridgeLines: THREE.LineSegments | null;
    myceliumConnectionPairs: Array<{a: number, b: number, layer: number}>;
    semanticLensGroup: THREE.Group | null;
    semanticLensGlow: THREE.Mesh | null;
    semanticLensSpokes: THREE.LineSegments | null;
    semanticManifold: THREE.Mesh | null;
    rawPositionsBuffer: Float32Array | null;
    rawClustersBuffer: Float32Array | null;
    focusBeaconTexture: THREE.Texture | null;
    focusRingTexture: THREE.Texture | null;
    focusNextCueTexture: THREE.Texture | null;
    hemiLight?: THREE.HemisphereLight | null;
    dirLight?: THREE.DirectionalLight | null;
    [key: string]: any; // Allow arbitrary dynamic properties from legacy code
}

export interface IDisposable {
    dispose(): void;
}
