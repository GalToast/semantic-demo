/**
 * @lib/engine/three-store-sync.ts — Multi-store handle-mirror helpers
 *
 * Extracted from `three-engine-core.ts` during W50 Phase 5c
 * (initThreeJS multi-store handle registration). Responsible for the
 * 4-way mirror writes that back the legacy + reactive state split:
 *      webglContext (canonical, builder writes here)
 *      appState    (reactive Svelte 5 class)
 *      legacyState (legacy-state-adapter alias)
 *      engineState.state (legacy mirror held inside the singleton)
 *
 * Three pure-ish helpers, one per init concern:
 *   - C3 scene handles (6 fields, sized to the SceneSetup from scene-init)
 *   - C11 points handles (4 fields: points/spore mesh+material)
 *   - C12 mycelium handles (5 fields: group + 3 line-segments + pairs)
 *
 * Each takes a typed `sinks` bundle so unit tests can drop in plain
 * object mocks without standing up the singleton tree.
 *
 * References:
 *   - docs/three-engine-decomposition-plan.md §3, §5 (Phase 3 — C3, C11, C12)
 *   - commits 035f6956 (Phase 4 frame-updates), b60d05f1 (Phase 5 init-helpers),
 *     fc71e487 (a11y+lint cleanup)
 */

import type {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    HemisphereLight,
    DirectionalLight,
    Points,
    PointsMaterial,
    InstancedMesh,
    Material,
    Group
} from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import type { LegacyState } from '@lib/state/legacy-state'
import type { ThreeEngineState } from './three-engine-state'
import type { WebGLContextState } from '@lib/engine/webgl-context'
import { webglContext } from '@lib/engine/webgl-context'
import { appState, legacyState } from '@lib/state/app.svelte'
import { engineState } from './three-engine-state'

// ── Sink contracts ───────────────────────────────────────────────────────────

/**
 * Sinks bundle for {@link syncSceneHandles}.
 *
 * Required fields per sink (others may exist — structural subtyping allows
 * supersets, e.g. the actual `webglContext` singleton carries 30+ fields).
 *
 *   `webglContext`: the 6 mirrored scene handles
 *   `appState`:     scene, renderer, controls (reactive mirror subset)
 *   `legacyState`:  camera, hemiLight, dirLight (legacy-only mirrors;
 *                   null is tolerated for early-init test scenarios)
 *   `engineState.state`: full legacy mirror — null is tolerated when the
 *                   engine state has not yet been hydrated.
 *
 * Plan reference: docs/three-engine-decomposition-plan.md §3 (C3 mirror map)
 */
export interface SceneSyncSinks {
    webglContext: Pick<WebGLContextState, 'scene' | 'camera' | 'renderer' | 'controls' | 'hemiLight' | 'dirLight'>
    appState: Pick<typeof appState, 'scene' | 'renderer' | 'controls'>
    legacyState: Pick<LegacyState, 'camera' | 'hemiLight' | 'dirLight'> | null
    engineState: Pick<ThreeEngineState, 'state'>
}

/**
 * Sinks bundle for {@link syncPointsHandles}.
 */
export interface PointsSyncSinks {
    appState: Pick<typeof appState, 'pointsMesh' | 'pointsMaterial' | 'nodeSporeMesh' | 'nodeSporeMaterial'>
    engineState: Pick<ThreeEngineState, 'state'>
}

/**
 * Sinks bundle for {@link syncMyceliumHandles}. `legacyState` may be null.
 */
export interface MyceliumSyncSinks {
    appState: Pick<
        typeof appState,
        'myceliumGroup' | 'myceliumCoreLines' | 'myceliumWispyLines' | 'myceliumBridgeLines'
    >
    legacyState: Pick<LegacyState, 'myceliumConnectionPairs'> | null
    engineState: Pick<ThreeEngineState, 'state'>
}

// ── Mirror-input contracts ───────────────────────────────────────────────────

/**
 * Six scene handles produced by `buildThreeScene` (renderer/scene-init.ts).
 * Identical shape to `SceneSetup` minus the optional glow/refSphere fields
 * which initThreeJS does not mirror.
 */
export interface SceneMirrorInput {
    scene: Scene
    camera: PerspectiveCamera
    renderer: WebGLRenderer
    controls: OrbitControls
    hemiLight: HemisphereLight
    dirLight: DirectionalLight
}

/**
 * Four points/spore handles produced by `createPointsPort()` and read from
 * `webglContext`. Each field is typed nullable because `webglContext`
 * itself tracks null until the builder populates it; the original inline
 * code accepted nullables too via matching assignment shapes.
 */
export interface PointsMirrorInput {
    pointsMesh: Points | null
    pointsMaterial: PointsMaterial | null
    nodeSporeMesh: InstancedMesh | null
    nodeSporeMaterial: Material | null
}

/**
 * Five mycelium handles produced by `createMyceliumPort()` and read from
 * `webglContext`. Fields are nullable for the same reason as
 * {@link PointsMirrorInput} — `webglContext` is `... | null` until the
 * builder populates it. `myceliumConnectionPairs` defaults to `[]` in the
 * webglContext type, so it is always an array (possibly empty).
 */
export interface MyceliumMirrorInput {
    myceliumGroup: Group | null
    myceliumCoreLines: LineSegments2 | null
    myceliumWispyLines: LineSegments2 | null
    myceliumBridgeLines: LineSegments2 | null
    myceliumConnectionPairs: Array<{ a: number; b: number; layer: number }>
}

// ── Default sink factories ───────────────────────────────────────────────────

function defaultSceneSinks(): SceneSyncSinks {
    return {
        webglContext,
        appState,
        legacyState,
        engineState
    }
}

function defaultPointsSinks(): PointsSyncSinks {
    return { appState, engineState }
}

function defaultMyceliumSinks(): MyceliumSyncSinks {
    return { appState, legacyState, engineState }
}

// ── C3 — Scene mirror ────────────────────────────────────────────────────────

/**
 * Mirror the 6 scene-handle fields produced by `buildThreeScene` into the
 * canonical singleton stores. This is the multi-store write that backs
 * the legacy + reactive state split.
 *
 * Mirror map (preserves previous inline behavior exactly):
 *   - `webglContext` ← all 6
 *   - `appState`     ← scene, renderer, controls
 *   - `legacyState`  ← camera, hemiLight, dirLight (when not null)
 *   - `engineState.state` ← all 6 (when not null)
 *
 * @param setup — six handle objects from `SceneSetup`
 * @param sinks — injectable bundle for tests; defaults to project singletons
 *
 * Plan reference: docs/three-engine-decomposition-plan.md §5 (C3)
 */
export function syncSceneHandles(setup: SceneMirrorInput, sinks: SceneSyncSinks = defaultSceneSinks()): void {
    const webglCtx = sinks.webglContext
    const app = sinks.appState
    const legacy = sinks.legacyState
    const state = sinks.engineState.state

    webglCtx.scene = setup.scene
    app.scene = setup.scene
    if (state) state.scene = setup.scene

    webglCtx.camera = setup.camera
    if (legacy) legacy.camera = setup.camera
    if (state) state.camera = setup.camera

    webglCtx.renderer = setup.renderer
    app.renderer = setup.renderer
    if (state) state.renderer = setup.renderer

    webglCtx.controls = setup.controls
    app.controls = setup.controls
    if (state) state.controls = setup.controls

    webglCtx.hemiLight = setup.hemiLight
    if (legacy) legacy.hemiLight = setup.hemiLight
    if (state) state.hemiLight = setup.hemiLight

    webglCtx.dirLight = setup.dirLight
    if (legacy) legacy.dirLight = setup.dirLight
    if (state) state.dirLight = setup.dirLight
}

// ── C11 — Points mirror ──────────────────────────────────────────────────────

/**
 * Mirror the 4 points/spore handles created by `createPointsPort()` into
 * `appState` and `engineState.state`. The handles originate inside
 * `webglContext` (the builder writes them there).
 *
 * @param handles — 4 point/spore handles produced by the builder
 * @param sinks — injectable bundle for tests; defaults to project singletons
 *
 * Plan reference: docs/three-engine-decomposition-plan.md §5 (C11)
 */
export function syncPointsHandles(handles: PointsMirrorInput, sinks: PointsSyncSinks = defaultPointsSinks()): void {
    const app = sinks.appState
    const state = sinks.engineState.state

    app.pointsMesh = handles.pointsMesh
    app.pointsMaterial = handles.pointsMaterial
    app.nodeSporeMesh = handles.nodeSporeMesh
    app.nodeSporeMaterial = handles.nodeSporeMaterial

    if (state) {
        state.pointsMesh = handles.pointsMesh
        state.pointsMaterial = handles.pointsMaterial
        state.nodeSporeMesh = handles.nodeSporeMesh
        state.nodeSporeMaterial = handles.nodeSporeMaterial
    }
}

// ── C12 — Mycelium mirror ────────────────────────────────────────────────────

/**
 * Mirror the 5 mycelium handles created by `createMyceliumPort()` into
 * `appState`, `legacyState`, and `engineState.state`.
 *
 * `myceliumConnectionPairs` is the only field that also writes
 * `legacyState` directly (preserved from previous inline behavior — it is
 * read by search/query code paths that pull from legacyState directly).
 *
 * @param handles — 5 mycelium handles produced by the builder
 * @param sinks — injectable bundle for tests; defaults to project singletons
 *
 * Plan reference: docs/three-engine-decomposition-plan.md §5 (C12)
 */
export function syncMyceliumHandles(
    handles: MyceliumMirrorInput,
    sinks: MyceliumSyncSinks = defaultMyceliumSinks()
): void {
    const app = sinks.appState
    const legacy = sinks.legacyState
    const state = sinks.engineState.state

    app.myceliumGroup = handles.myceliumGroup
    app.myceliumCoreLines = handles.myceliumCoreLines
    app.myceliumWispyLines = handles.myceliumWispyLines
    app.myceliumBridgeLines = handles.myceliumBridgeLines

    if (legacy) legacy.myceliumConnectionPairs = handles.myceliumConnectionPairs

    if (state) {
        state.myceliumGroup = handles.myceliumGroup
        state.myceliumCoreLines = handles.myceliumCoreLines
        state.myceliumWispyLines = handles.myceliumWispyLines
        state.myceliumBridgeLines = handles.myceliumBridgeLines
        state.myceliumConnectionPairs = handles.myceliumConnectionPairs
    }
}
