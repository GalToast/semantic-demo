/**
 * @lib/types/webgl.ts — WebGL/Three.js specific type definitions
 *
 * Typed wrappers for Three.js scene configuration, node instances,
 * thread geometry, and shader uniforms.
 */

// ── Point Types ─────────────────────────────────────────────────────────────────

/** 3D point in unit cube space [0,1]³ */
export type Point3D = { x: number; y: number; z: number }

// ── Scene Diagnostics ─────────────────────────────────────────────────────────

export interface ScenePerformanceDiagnostics {
    active: boolean
    reason: string
    lastFrameAt: number
    sampleCount: number
    avgFrameMs: number
    maxFrameMs: number
    avgUpdateMs: number
    maxUpdateMs: number
    avgRenderMs: number
    maxRenderMs: number
    avgControlsMs: number
    avgNodeMotionMs: number
    avgThreadUpdateMs: number
    avgGlowMs: number
    avgLensMs: number
    myceliumCoreSegments: number
    myceliumWispySegments: number
    myceliumBridgeSegments: number
}
