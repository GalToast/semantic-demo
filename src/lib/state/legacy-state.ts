/**
 * @lib/state/legacy-state.ts — LegacyState interface for the engine-internal state surface.
 *
 * This is the typed shape of `appState` as consumed by the engine subsystems
 * (three-engine-core, renderer-diagnostics, cluster-filter-controller,
 * window-actions, triggers, main.ts test compat proxy).
 *
 * Moved from `src/lib/engine/three-engine-core.ts` (Phase 4, 2026-06-25) so it
 * can be imported by `src/lib/state/legacy-state-adapter.ts` without creating
 * a circular dependency.
 *
 * Why this exists alongside `appState` (which is the Svelte 5 rune state):
 *   - The runtime app state surface is dynamically shaped — pre-Svelte-5 JS
 *     modules wrote arbitrary fields onto the global state object at runtime.
 *   - The test-compat proxy in main.ts still exposes that surface for
 *     backwards compatibility with Playwright surface tests.
 *   - Because the shape is dynamic at the global level, we cannot fully type
 *     the surface; this interface captures the *statically-known* subset.
 *   - The `[key: string]: unknown` index signature preserves dynamic access
 *     (`legacyState[prop]`) while forcing narrowing at use sites for the
 *     typed subset.
 *
 * Consumers of `legacyState` (the instance) MUST read from this interface,
 * not cast `appState as any` at call sites.
 */
import type {
    Group,
    HemisphereLight,
    InstancedMesh,
    LineSegments,
    Material,
    PerspectiveCamera,
    Points,
    Scene,
    Vector3,
    WebGLRenderer,
    DirectionalLight
} from 'three'
import type { NodePosition, ScenePerformanceDiagnostics } from './state-types'
import type { NavState, Point } from './state-types'
import type { BusinessRecord } from '@lib/types/business'

export interface LegacyState {
    // ── Engine scene graph ────────────────────────────────────────────────────
    scene: Scene | null
    camera: PerspectiveCamera | null
    renderer: WebGLRenderer | null
    controls: { update(): void; enabled: boolean; target: Vector3; dispose(): void } | null

    // ── Mycelium meshes ───────────────────────────────────────────────────────
    pointsMesh: Points | null
    pointsMaterial: Material | null
    nodeSporeMesh: InstancedMesh | null
    nodeSporeHitMesh: InstancedMesh | null
    nodeSporeMaterial: Material | null
    myceliumGroup: Group | null
    myceliumCoreLines: LineSegments | null
    myceliumWispyLines: LineSegments | null
    myceliumBridgeLines: LineSegments | null
    myceliumConnectionPairs: Array<{ a: number; b: number; layer?: number }>

    // ── Lighting ──────────────────────────────────────────────────────────────
    hemiLight: HemisphereLight | null
    dirLight: DirectionalLight | null

    // ── Animation / motion ────────────────────────────────────────────────────
    autoRotate: boolean
    autoRotateSuspended: boolean
    autoRotateResumeDueAt?: number
    forceAnimate: boolean
    pulsePhase: number
    weather: { wind_speed_10m?: number }

    // ── View / scene state ───────────────────────────────────────────────────
    currentView: string
    focusedNode: number | null
    selectedPoint: BusinessRecord | null
    sceneRevealActive: boolean
    searchGlowActive?: boolean

    // ── Thread inspection ────────────────────────────────────────────────────
    inspectedThreadIndex?: number | null
    pinnedThreadIndex?: number | null
    inspectedStrandGroup: Group | null

    // ── Camera reveal ────────────────────────────────────────────────────────
    sceneRevealCameraStart: Vector3 | null
    sceneRevealCameraEnd: Vector3 | null

    // ── Performance / diagnostics ─────────────────────────────────────────────
    scenePerformanceDiagnostics: ScenePerformanceDiagnostics | null

    // ── Trail / neighborhood state ────────────────────────────────────────────
    trailDepth: number
    navState: NavState | null
    activeClusterFilter: number | null

    // ── Points / positions ────────────────────────────────────────────────────
    points: Point[]
    nodePositions: NodePosition[]
    targetPositions: NodePosition[]
    nodesAreSettling: boolean
    focusPocketMotionByIndex: number[]
    hoverHighlightIndex: number
    myceliumDirty: boolean

    // ── Index signature for dynamic reads (test compat proxy) ─────────────────
    [key: string]: unknown
}
