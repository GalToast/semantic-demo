/**
 * @lib/engine/three-engine.ts — Canonical Three.js engine orchestration
 *
 * Single source of truth for the WebGL render loop, scene lifecycle, and
 * renderer management.  Legacy `js/modules/three-engine.ts` was deleted in
 * W13-T5b Wave 7 (commit 00eb691).
 *
 * Public API:
 *   initThreeJS, deinit, animate, onWindowResize, cancelAnimate,
 *   getSceneRenderableDiagnostics, updateCameraViewportOffset,
 *   plus re-exported helpers from legacy modules.
 *
 * Remaining legacy module dependencies are lazy-loaded at module init time via
 * _ensureModules(). Exported functions are synchronous with defensive guards.
 */

// ── Static @lib/* imports ────────────────────────────────────────────────────

import { DisposableRegistry } from '@lib/utils/disposable-registry'
import { buildThreeScene } from './renderer/scene-init'
import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Vector3,
    FogExp2,
    Material,
    MeshPhongMaterial,
    Points,
    Group,
    LineSegments,
    HemisphereLight,
    DirectionalLight,
    InstancedMesh
} from 'three'
import type { NodePosition, NavState, ScenePerformanceDiagnostics, Point } from '@lib/state/state-types'
import type { BusinessRecord } from '@lib/types/business'
export { getSceneRenderableDiagnostics } from './renderer/renderer-diagnostics'

import { webglContext } from '@lib/engine/webgl-context'
import { showWebGLFallback } from './renderer/webgl-fallback'
import { sampleScenePerformance } from './renderer/renderer-diagnostics'
import { CONFIG } from '@lib/engine/config'
import { disposeObject3D } from '@lib/engine/resource-tracker'
import {
    compilePointMaterialForReadiness as compilePointMaterialForReadinessPort,
    createPoints as createPointsPort,
    disposeNodeVisuals as disposeNodeVisualsPort,
    MYCELIUM_FIELD_SCALE as PORT_MYCELIUM_FIELD_SCALE,
    SCENE_ATMOSPHERE as PORT_SCENE_ATMOSPHERE,
    setNodeSporeInstanceMatrix as setNodeSporeInstanceMatrixPort
} from '@lib/engine/node-manager'
import {
    createMycelium as createMyceliumPort,
    disposeMycelium as disposeMyceliumPort,
    getMyceliumPresentationProfile as getMyceliumPresentationProfilePort,
    getThreadPulseOpacity as getThreadPulseOpacityPort,
    shouldRenderBridgeThreads as shouldRenderBridgeThreadsPort,
    shouldRenderThreads as shouldRenderThreadsPort
} from '@lib/engine/thread-manager'
// Postprocessing is dynamically imported to save ~150-200 kB from the main
// chunk. The module is only needed when premium mode is toggled ON.
type PostProcessingModule = {
    initPostProcessing: typeof import('@lib/engine/three-postprocessing').initPostProcessing
    renderPostProcessing: typeof import('@lib/engine/three-postprocessing').renderPostProcessing
    disposePostProcessing: typeof import('@lib/engine/three-postprocessing').disposePostProcessing
    resizePostProcessing: typeof import('@lib/engine/three-postprocessing').resizePostProcessing
}

let _ppModule: PostProcessingModule | null = null
let _ppLoading: Promise<PostProcessingModule> | null = null

async function _loadPostProcessing(): Promise<PostProcessingModule> {
    if (_ppModule) return _ppModule
    if (_ppLoading) return _ppLoading
    _ppLoading = import('@lib/engine/three-postprocessing').then((m) => {
        _ppModule = {
            initPostProcessing: m.initPostProcessing,
            renderPostProcessing: m.renderPostProcessing,
            disposePostProcessing: m.disposePostProcessing,
            resizePostProcessing: m.resizePostProcessing
        }
        return _ppModule
    })
    return _ppLoading
}
import { easeInOutCubic, easeOutQuint } from '@lib/utils/math-easing'
import { debugWarn, debugInfo } from '@lib/utils/diagnostic-adapter'
import { isMobileViewport } from '@lib/utils/environment'
import { appState } from '@lib/state/app.svelte'
import { updateRouteTraceOverlayFrame, updateArrivalHandoffOverlayFrame } from '@lib/engine/journey-webgl-lazy'

// ── Static ../../../js/* imports (COLD — init-only, consumed by ensureModules) ──
import * as viewControllerMod from '@lib/orchestration/view-controller'
import * as mapStateMod from '@lib/engine/map-state'
import * as uiFeedbackMod from '@lib/ui/ui-feedback'
import * as mapFlatteningMod from '../utils/map-flattening-layout'
import * as webglRestoreMod from '@lib/utils/webgl-restore-adapter'
import * as focusAnchorMod from '@lib/journey/focus-anchor-indicator'
import * as audioScapeMod from '@lib/audio/audio-scape'
import * as eventBindingsMod from '@lib/ui/event-bindings'
import * as loadingUiMod from '../ui/loading'

// ── Static ../../../js/* imports (HOT — render-loop, consumed by ensureModules) ──

import { legacyState } from '@lib/state/legacy-state-adapter'
import * as clusterLabelsMod from '@lib/ui/cluster-labels'
import * as focusPocketMod from '@lib/journey/focus-pocket'
import * as sceneRevealMod from './scene-reveal'
import * as cameraControlsMod from '@lib/engine/camera-controls'
import * as myceliumEngineMod from './mycelium-engine'
import * as inspectedStrandMod from '@lib/journey/inspected-strand-overlay-adapter'
import * as threeSearchAnimationsMod from './three-search-animations'
import * as threeInteractionVisualsMod from './three-interaction-visuals'

// ── Legacy Module Type Contracts ──────────────────────────────────────────────

interface LegacyState {
    scene: Scene | null
    camera: PerspectiveCamera | null
    renderer: WebGLRenderer | null
    controls: { update(): void; enabled: boolean; target: Vector3; dispose(): void } | null
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
    hemiLight: HemisphereLight | null
    dirLight: DirectionalLight | null
    autoRotate: boolean
    autoRotateSuspended: boolean
    autoRotateResumeDueAt?: number
    currentView: string
    forceAnimate: boolean
    focusedNode: number | null
    trailDepth: number
    nodePositions: NodePosition[]
    targetPositions: NodePosition[]
    nodesAreSettling: boolean
    focusPocketMotionByIndex: number[]
    hoverHighlightIndex: number
    pulsePhase: number
    weather: { wind_speed_10m?: number }
    myceliumDirty: boolean
    selectedPoint: BusinessRecord | null
    sceneRevealActive: boolean
    searchGlowActive?: boolean
    inspectedThreadIndex?: number | null
    pinnedThreadIndex?: number | null
    sceneRevealCameraStart: Vector3 | null
    sceneRevealCameraEnd: Vector3 | null
    inspectedStrandGroup: Group | null
    scenePerformanceDiagnostics: ScenePerformanceDiagnostics | null
    navState: NavState | null
    points: Point[]
    [key: string]: unknown
}

interface WithStateMutationFn {
    (fn: () => void): void
}

interface ViewControllerModule {
    switchView(view: string, options?: Record<string, unknown>): void
}

interface ClusterLabelsModule {
    updateClusterLabels(): void
}

interface FocusPocketModule {
    applyFocusPocketBreathing(now: number, positions: NodePosition[]): boolean
}

interface SceneRevealModule {
    getSceneRevealProgress(now: number): number
    setSceneRevealDataset(active: boolean): void
}

interface CameraControlsModule {
    releaseFocusCameraAssist(reason?: string): void
    focusCameraAssistIsActive(now?: number): void
    noteSceneInteraction(delay: number): void
    scheduleAutoRotateResume(delay: number): void
    updateAutoRotateSoftResume(now?: number): void
    applySemanticCentroidCamera(now?: number): void
    cancelFocusCameraAnimation(): void
}

interface MapStateModule {
    initMap(): void
}

interface MyceliumEngineModule {
    updateMyceliumThreads(): void
}

interface UiFeedbackModule {
    showExperienceToast(title: string, message: string): void
}

interface MapFlatteningModule {
    applyMapFlatteningLayout(): void
}

interface WebGLRestoreModule {
    restoreWebGLContext(): Promise<void>
}

interface InspectedStrandModule {
    updateInspectedStrandOverlayFrame(now: number): void
}

interface FocusAnchorModule {
    disposeFocusAnchorIndicator(): void
}

interface ThreeSearchAnimationsModule {
    triggerSearchHeroMoment(): void
    triggerCorridorNodeGlow(now: number): void
    updateCorridorNodeGlow(now: number): void
    triggerSearchCorridorAnimation(now: number): void
    updateSearchCorridorAnimation(now: number): void
    disposeSearchCorridorAnimation(): void
    disposeHeroAnimation(): void
}

interface AudioScapeModule {
    disposeAudio(): void
}

interface EventBindingsModule {
    disposeEventListeners(): void
}

interface LoadingUiModule {
    cancelLoadingHide(): void
}

interface ThreeInteractionVisualsModule {
    updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number | null): void
    disposeInteractionVisuals(): void
    initSemanticLens(): void
    initSemanticManifold(): void
}

// ── Lazy Module Cache ────────────────────────────────────────────────────────

let _state: LegacyState | null = null
let _withStateMutation: WithStateMutationFn | null = null
let _viewController: ViewControllerModule | null = null
let _clusterLabels: ClusterLabelsModule | null = null
let _focusPocket: FocusPocketModule | null = null
let _sceneReveal: SceneRevealModule | null = null
let _cameraControls: CameraControlsModule | null = null
let _mapState: MapStateModule | null = null
let _myceliumEngine: MyceliumEngineModule | null = null
let _uiFeedback: UiFeedbackModule | null = null
let _mapFlattening: MapFlatteningModule | null = null
let _webglRestore: WebGLRestoreModule | null = null
let _inspectedStrand: InspectedStrandModule | null = null
let _focusAnchor: FocusAnchorModule | null = null
let _threeSearchAnimations: ThreeSearchAnimationsModule | null = null
let _audioScape: AudioScapeModule | null = null
let _eventBindings: EventBindingsModule | null = null
let _loadingUi: LoadingUiModule | null = null
let _threeInteractionVisuals: ThreeInteractionVisualsModule | null = null

let _loaded = false

function _ensureModules(): void {
    if (_loaded) return
    try {
        _state = legacyState as unknown as LegacyState
        if (typeof window !== 'undefined') {
            ;(window as unknown as { __LEGACY_APP_STATE__?: unknown }).__LEGACY_APP_STATE__ = legacyState
            ;(window as unknown as { __refreshTestCompatState__?: () => void }).__refreshTestCompatState__?.()
        }
        _withStateMutation = ((fn: () => void) => fn()) as unknown as WithStateMutationFn
        _viewController = viewControllerMod as unknown as ViewControllerModule
        _clusterLabels = clusterLabelsMod as unknown as ClusterLabelsModule
        _focusPocket = focusPocketMod as unknown as FocusPocketModule
        _sceneReveal = sceneRevealMod as unknown as SceneRevealModule
        _cameraControls = cameraControlsMod as unknown as CameraControlsModule
        _mapState = mapStateMod as unknown as MapStateModule
        _myceliumEngine = myceliumEngineMod as unknown as MyceliumEngineModule
        _uiFeedback = uiFeedbackMod as unknown as UiFeedbackModule
        _mapFlattening = mapFlatteningMod as unknown as MapFlatteningModule
        _webglRestore = webglRestoreMod as unknown as WebGLRestoreModule
        _inspectedStrand = inspectedStrandMod as unknown as InspectedStrandModule
        _focusAnchor = focusAnchorMod as unknown as FocusAnchorModule
        _threeSearchAnimations = threeSearchAnimationsMod as unknown as ThreeSearchAnimationsModule
        _audioScape = audioScapeMod as unknown as AudioScapeModule
        _eventBindings = eventBindingsMod as unknown as EventBindingsModule
        _loadingUi = loadingUiMod as unknown as LoadingUiModule
        _threeInteractionVisuals = threeInteractionVisualsMod as unknown as ThreeInteractionVisualsModule
        _loaded = true
    } catch (err) {
        if (import.meta.env.DEV) console.error('[three-engine] Failed to load legacy modules:', err)
    }
}

void _ensureModules()

// ── Re-exported legacy helpers (delegation wrappers) ─────────────────────────

export function updateMyceliumThreads(): void {
    _myceliumEngine?.updateMyceliumThreads()
}

export function applyMapFlatteningLayout(): void {
    _mapFlattening?.applyMapFlatteningLayout()
}

export function triggerSearchHeroMoment(): void {
    _threeSearchAnimations?.triggerSearchHeroMoment()
}

export function triggerCorridorNodeGlow(now: number): void {
    _threeSearchAnimations?.triggerCorridorNodeGlow(now)
}

export function updateCorridorNodeGlow(now: number): void {
    _threeSearchAnimations?.updateCorridorNodeGlow(now)
}

export function triggerSearchCorridorAnimation(now: number): void {
    _threeSearchAnimations?.triggerSearchCorridorAnimation(now)
}

export function updateSearchCorridorAnimation(now: number): void {
    _threeSearchAnimations?.updateSearchCorridorAnimation(now)
}

export function disposeSearchCorridorAnimation(): void {
    _threeSearchAnimations?.disposeSearchCorridorAnimation()
}

export function updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number | null): void {
    _threeInteractionVisuals?.updateInteractionVisuals(now, hoveredNode, focusedNode)
}

export function disposeInteractionVisuals(): void {
    _threeInteractionVisuals?.disposeInteractionVisuals()
}

export function initSemanticLens(): void {
    _threeInteractionVisuals?.initSemanticLens()
}

export function initSemanticManifold(): void {
    _threeInteractionVisuals?.initSemanticManifold()
}

export function shouldRenderThreads(): boolean {
    return shouldRenderThreadsPort()
}

export function shouldRenderBridgeThreads(): boolean {
    return shouldRenderBridgeThreadsPort()
}

export function createPoints(): void {
    createPointsPort()
    appState.pointsMesh = webglContext.pointsMesh
    appState.pointsMaterial = webglContext.pointsMaterial
    appState.nodeSporeMesh = webglContext.nodeSporeMesh
    appState.nodeSporeHitMesh = webglContext.nodeSporeHitMesh
    appState.nodeSporeMaterial = webglContext.nodeSporeMaterial
    if (_state) {
        _state.pointsMesh = webglContext.pointsMesh
        _state.pointsMaterial = webglContext.pointsMaterial
        _state.nodeSporeMesh = webglContext.nodeSporeMesh
        _state.nodeSporeHitMesh = webglContext.nodeSporeHitMesh
        _state.nodeSporeMaterial = webglContext.nodeSporeMaterial
    }
}

export function createMycelium(): void {
    createMyceliumPort()
}

export const SCENE_ATMOSPHERE: Record<string, any> = {}
export const MYCELIUM_FIELD_SCALE = { x: 3.2, y: 2.6, z: 3.7 }

Object.assign(SCENE_ATMOSPHERE, PORT_SCENE_ATMOSPHERE)
Object.assign(MYCELIUM_FIELD_SCALE, PORT_MYCELIUM_FIELD_SCALE)

// ── Module-level Mutable State ───────────────────────────────────────────────

let _rafId: number | null = null
let _idleFrameTimerId: number | null = null
let _webglContextLost = false
let _circuitBreakerTripped = false
let _webglRestoreTimer: number | null = null
let _lastHoveredNode: number | null = null
let _hoverEmissiveFlash = 0
let _sceneRegistry: DisposableRegistry | null = null
let _mapButtonClickHandler: ((event: MouseEvent) => void) | null = null

const IDLE_STATIC_FRAME_INTERVAL_MS = 125

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasFiniteNodeIndex(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function sceneNeedsContinuousFrame(now: number): boolean {
    if (!_state) return true
    const focusPocketMotion = _state.focusPocketMotionByIndex as unknown
    const focusPocketMoving = Array.isArray(focusPocketMotion)
        ? focusPocketMotion.length > 0
        : (focusPocketMotion as Map<unknown, unknown>)?.size > 0
    const autoRotateActive = Boolean(_state.autoRotate && !_state.autoRotateSuspended)
    const autoRotateResumePending =
        typeof _state.autoRotateResumeDueAt === 'number' && _state.autoRotateResumeDueAt > now
    const routeTraceActive = Boolean(_state.routeTraceLines)
    return Boolean(
        _state.forceAnimate ||
        _state.sceneRevealActive ||
        _state.nodesAreSettling ||
        _state.myceliumDirty ||
        routeTraceActive ||
        focusPocketMoving ||
        autoRotateActive ||
        autoRotateResumePending ||
        _state.searchGlowActive ||
        hasFiniteNodeIndex(_state.hoverHighlightIndex) ||
        hasFiniteNodeIndex(_state.focusedNode) ||
        hasFiniteNodeIndex(_state.inspectedThreadIndex) ||
        hasFiniteNodeIndex(_state.pinnedThreadIndex)
    )
}

function scheduleNextAnimationFrame(continuous: boolean): void {
    if (_rafId !== null || _idleFrameTimerId !== null) return
    if (continuous) {
        _rafId = window.requestAnimationFrame(animate)
        return
    }
    _idleFrameTimerId = window.setTimeout(() => {
        _idleFrameTimerId = null
        if (_rafId === null) _rafId = window.requestAnimationFrame(animate)
    }, IDLE_STATIC_FRAME_INTERVAL_MS)
}

export function updateCameraViewportOffset() {
    const camera = webglContext.camera || appState.camera
    if (!camera) return
    const width = window.innerWidth
    const height = window.innerHeight

    // Only shift the camera frustum when the info-panel is actually showing
    // content that takes real screen real estate on desktop. Idle / launch
    // surfaces keep the panel chrome open but empty; offsetting the camera
    // there pushes the 3D cloud off-center on first paint.
    const surface = document.body?.dataset?.panelSurface
    const focused = document.body?.dataset?.focusedNode
    const hasContent = Boolean(
        focused ||
        surface === 'focus' ||
        surface === 'search' ||
        surface === 'focus-search' ||
        surface === 'semantic-dive'
    )
    const panel = document.querySelector('.info-panel')
    if (panel && hasContent && panel.classList.contains('active') && width > 768) {
        const rect = panel.getBoundingClientRect()
        const offset = rect.right / 2
        camera.setViewOffset?.(width, height, -offset, 0, width, height)
    } else {
        camera.clearViewOffset?.()
    }
    camera.updateProjectionMatrix?.()
}

// ── Yield helper for breaking up long tasks (W5-T1b / W8) ──────────────────────
//
// Uses setTimeout(0) instead of requestIdleCallback: during engine init the
// main thread is busy with GPU work, so requestIdleCallback's 50ms timeout
// adds latency without actually yielding earlier. setTimeout(0) is the
// fastest path to the event loop.

function _yieldToBrowser(_timeoutMs = 50): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()
    return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

export async function initThreeJS() {
    cancelAnimate()

    // Reset circuit breaker so a fresh init can start the loop even if a
    // previous animate() iteration tripped it.
    _circuitBreakerTripped = false

    const container = document.getElementById('canvas-container')
    if (!container) throw new Error('initThreeJS: #canvas-container element not found in DOM')

    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight

    const result = await buildThreeScene(container, width, height)
    if (!result.success) {
        _mapButtonClickHandler = showWebGLFallback(
            container,
            { reason: result.reason || 'webgl-unavailable' },
            { state: _state, viewController: _viewController, mapState: _mapState, uiFeedback: _uiFeedback }
        )
        return false
    }

    const { scene, camera, renderer, controls, hemiLight, dirLight } = result.setup

    webglContext.scene = scene
    appState.scene = scene
    if (_state) _state.scene = scene

    webglContext.camera = camera
    legacyState.camera = camera
    if (_state) _state.camera = camera

    webglContext.renderer = renderer
    appState.renderer = renderer
    if (_state) _state.renderer = renderer

    webglContext.controls = controls
    appState.controls = controls
    if (_state) _state.controls = controls

    webglContext.hemiLight = hemiLight
    legacyState.hemiLight = hemiLight
    if (_state) _state.hemiLight = hemiLight

    webglContext.dirLight = dirLight
    legacyState.dirLight = dirLight
    if (_state) _state.dirLight = dirLight

    // Initialize DisposableRegistry for all DOM/Three.js event listeners.
    // Registering at creation time means we can never forget to remove them.
    _sceneRegistry?.disposeAll()
    _sceneRegistry = new DisposableRegistry({ label: 'three-engine' })

    _sceneRegistry.listener(renderer.domElement, 'webglcontextlost', (event: Event) => {
        event.preventDefault()
        _webglContextLost = true
        pauseRenderLoopTimers({ clearRestoreTimer: true })
        _uiFeedback?.showExperienceToast('Graphics connection lost', 'Re-establishing 3D scene...')
    })

    _sceneRegistry.listener(renderer.domElement, 'webglcontextrestored stimulus', () => {
        _webglContextLost = false
        _webglRestoreTimer = window.setTimeout(() => {
            _webglRestore?.restoreWebGLContext().catch((err) => {
                if (import.meta.env.DEV) console.error('Failed to restore WebGL context:', err)
            })
            if (
                _rafId === null &&
                !_circuitBreakerTripped &&
                webglContext.renderer &&
                webglContext.scene &&
                webglContext.camera
            ) {
                animate()
            }
        }, 1000)
    })

    _sceneRegistry.listener(document, 'visibilitychange', () => {
        if (
            !document.hidden &&
            _rafId === null &&
            _idleFrameTimerId === null &&
            !_webglContextLost &&
            !_circuitBreakerTripped &&
            webglContext.renderer &&
            webglContext.scene &&
            webglContext.camera
        ) {
            animate()
        }
    })

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        appState.autoRotate = false
        if (_state) _state.autoRotate = false
        const rotateBtn = document.getElementById('btn-rotate')
        if (rotateBtn) rotateBtn.setAttribute('aria-pressed', 'false')
    }

    controls.autoRotate = !!(
        (appState.autoRotate || _state?.autoRotate) &&
        !(appState.autoRotateSuspended || _state?.autoRotateSuspended)
    )
    controls.autoRotateSpeed = CONFIG.AUTO_ROTATE_BASE_SPEED

    _sceneRegistry.listener(controls, 'start', () => {
        _cameraControls?.releaseFocusCameraAssist('user-control')
        _cameraControls?.noteSceneInteraction(CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS)
    })
    _sceneRegistry.listener(controls, 'end', () => {
        _cameraControls?.scheduleAutoRotateResume(CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS)
    })

    // W8: yield before heavy geometry/buffer work to break the init long task.
    // createPoints() uploads 8,406 × 3 floats + 8,406 × 16 instance matrices;
    // createMycelium() uploads 100,872 edge line segments. Both are O(n)
    // synchronous work that benefits from interleaved yield.
    await _yieldToBrowser()

    createPoints()

    // W8: yield between createPoints() and createMycelium() to keep individual
    // tasks under 200ms. createMycelium() uploads 100k+ edge line segments.
    await _yieldToBrowser()

    createMycelium()
    appState.myceliumGroup = webglContext.myceliumGroup
    appState.myceliumCoreLines = webglContext.myceliumCoreLines
    appState.myceliumWispyLines = webglContext.myceliumWispyLines
    appState.myceliumBridgeLines = webglContext.myceliumBridgeLines
    legacyState.myceliumConnectionPairs = webglContext.myceliumConnectionPairs
    if (_state) {
        _state.myceliumGroup = webglContext.myceliumGroup
        _state.myceliumCoreLines = webglContext.myceliumCoreLines
        _state.myceliumWispyLines = webglContext.myceliumWispyLines
        _state.myceliumBridgeLines = webglContext.myceliumBridgeLines
        _state.myceliumConnectionPairs = webglContext.myceliumConnectionPairs
    }

    // W8: yield after mycelium buffer upload (100k+ edges) before the
    // material compilation and visual setup phases.
    await _yieldToBrowser()

    compilePointMaterialForReadinessPort()
    initSemanticLens()
    initSemanticManifold()
    document.body.dataset.graphicsMode = 'webgl'
    updateCameraViewportOffset()

    // W8: yield before starting the render loop. The first frame() call
    // triggers shader compilation and uniform binding which can block.
    await _yieldToBrowser()

    // Start the render loop explicitly. The new Svelte lifecycle no longer
    // receives the legacy DOM scene-ready path, and without this the renderer
    // exposes a populated scene but never issues its first draw.
    animate()

    // Postprocessing composer: wraps renderer/scene/camera in an EffectComposer
    // (vignette + chromatic aberration + bloom + DOF). Effects stay disabled
    // until premium mode is toggled on via the body data-attribute. The
    // composer's render path is invoked from the animate loop below; if
    // premium mode is off, the loop falls through to vanilla renderer.render().
    //
    // Gated on mobile: postprocessing adds 80+ KB and heavy GPU passes that
    // are unnecessary on small viewports. The vanilla renderer.render() path
    // is used instead.
    if (!isMobileViewport()) {
        _loadPostProcessing().then((pp) => {
            try {
                pp.initPostProcessing(renderer, scene, camera)
            } catch (ppErr) {
                debugWarn('[three-engine] postprocessing init failed, vanilla render will be used:', ppErr)
            }
        })
    } else {
        // W46-A: Mark the intentional mobile performance path so tests and
        // future UI can detect it without relying on console text.
        if (typeof document !== 'undefined' && document.body) {
            document.body.dataset.postprocessing = 'skipped'
        }
        debugInfo('[three-engine] postprocessing skipped on mobile viewport (performance mode)')
    }

    // Dev-only: expose engine handle for the Spector.js frame-capture bridge.
    // Lets SpectorInspector force a render call before captureContext() so
    // Spector's frame-finder always sees an in-flight draw. Tree-shaken from
    // production by the import.meta.env.DEV guard (Vite dead-code-eliminates
    // the false branch during the production build).
    if (import.meta.env.DEV && typeof window !== 'undefined') {
        ;(window as unknown as { __semanticEngine?: unknown }).__semanticEngine = {
            get renderer() {
                return webglContext.renderer
            },
            get scene() {
                return webglContext.scene
            },
            get camera() {
                return webglContext.camera
            },
            get canvas() {
                return webglContext.renderer?.domElement ?? null
            },
            renderOnce: () => {
                if (webglContext.renderer && webglContext.scene && webglContext.camera) {
                    webglContext.renderer.render(webglContext.scene, webglContext.camera)
                }
            }
        }
    }

    return true
}

export function onWindowResize() {
    const container = document.getElementById('canvas-container')
    const camera = webglContext.camera || _state?.camera
    const renderer = webglContext.renderer || _state?.renderer
    if (!container || !camera || !renderer) return

    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight

    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    _ppModule?.resizePostProcessing(width, height)
}

/**
 * Cancel the render loop and tear down scene graph resources.
 * NOTE: This is a LIGHTER teardown. The `deinit()` function additionally calls
 * disposeNodeVisualsPort() and disposeMyceliumPort() to release tracked textures
 * and mycelium GPU resources. Call deinit() after cancelAnimate() for full cleanup.
 * The WebGL context-lost handler (line 701) currently only calls cancelAnimate();
 * tracked textures will leak until context GC — known issue, see smell-accounting W1-M2.
 */
function pauseRenderLoopTimers(options: { clearRestoreTimer?: boolean } = {}): void {
    if (_rafId !== null) {
        window.cancelAnimationFrame(_rafId)
        _rafId = null
    }
    if (options.clearRestoreTimer && _webglRestoreTimer) {
        window.clearTimeout(_webglRestoreTimer)
        _webglRestoreTimer = null
    }
    if (_idleFrameTimerId !== null) {
        window.clearTimeout(_idleFrameTimerId)
        _idleFrameTimerId = null
    }
}

export function cancelAnimate() {
    pauseRenderLoopTimers({ clearRestoreTimer: true })
    // Dispose all registered event listeners and timers via the central
    // registry.  Replaces the previous per-handler null-check dance.
    _sceneRegistry?.disposeAll()
    _sceneRegistry = null
    // Remove mapButton click listener (defensive cleanup)
    if (_mapButtonClickHandler) {
        const mapBtn = document.querySelector('.webgl-fallback-map')
        if (mapBtn) {
            mapBtn.removeEventListener('click', _mapButtonClickHandler as EventListener)
        }
        _mapButtonClickHandler = null
    }
    const contextWasLost = _webglContextLost
    _webglContextLost = false
    const renderer = _state?.renderer
    const scene = _state?.scene
    const camera = _state?.camera
    if (!contextWasLost && renderer && scene && camera) {
        try {
            renderer.render(scene, camera)
        } catch (error) {
            debugWarn('[three-engine] renderer.render failed (context likely lost):', error)
        }
    }
    if (_state?.controls && typeof _state.controls.dispose === 'function') {
        try {
            _state.controls.dispose()
        } catch (error) {
            debugWarn('[three-engine] controls already disposed:', error)
        }
    }
    if (_state) {
        _state.scene = null
        _state.camera = null
        _state.controls = null
    }
    try {
        disposeObject3D(scene)
    } catch (error) {
        debugWarn('[three-engine] disposeObject3D already cleaned up:', error)
    }
    _focusAnchor?.disposeFocusAnchorIndicator()
    // Dispose postprocessing composer BEFORE renderer.dispose() so the
    // composer's GL framebuffer/texture resources release cleanly while the
    // underlying WebGL context is still valid.
    try {
        _ppModule?.disposePostProcessing()
    } catch (ppErr) {
        debugWarn('[three-engine] postprocessing dispose failed:', ppErr)
    }
    if (renderer) {
        renderer.dispose()
        const canvas = renderer.domElement
        try {
            canvas?.parentNode?.removeChild(canvas)
        } catch (error) {
            debugWarn('[three-engine] canvas already removed from DOM:', error)
        }
    }
    if (_state) {
        _state.renderer = null
        _state.pointsMesh = null
        _state.pointsMaterial = null
        _state.nodeSporeMesh = null
        _state.nodeSporeHitMesh = null
        _state.nodeSporeMaterial = null
    }
    webglContext.scene = null
    webglContext.camera = null
    webglContext.renderer = null
    webglContext.controls = null
    webglContext.pointsMesh = null
    webglContext.pointsMaterial = null
    webglContext.nodeSporeMesh = null
    webglContext.nodeSporeHitMesh = null
    webglContext.nodeSporeMaterial = null
    _lastHoveredNode = null
    _hoverEmissiveFlash = 0
}

export function deinit() {
    cancelAnimate()
    _cameraControls?.cancelFocusCameraAnimation()
    _loadingUi?.cancelLoadingHide()
    _threeSearchAnimations?.disposeHeroAnimation()
    if (_state) {
        _state.sceneRevealActive = false
        _state.sceneRevealCameraStart = null
        _state.sceneRevealCameraEnd = null
        if (_state.inspectedStrandGroup) {
            _state.inspectedStrandGroup = null
        }
    }
    disposeNodeVisualsPort()
    disposeMyceliumPort()
    _threeInteractionVisuals?.disposeInteractionVisuals()
    _audioScape?.disposeAudio()
    _eventBindings?.disposeEventListeners()
    // Reset module-cache flag so _ensureModules() re-reads fresh references on
    // subsequent initThreeJS() calls (W1-M1).
    _loaded = false
}

export function animate() {
    // Clear the RAF id at the start of every callback so book-keeping
    // stays correct across frames. Without this, the first scheduled
    // callback would see _rafId != null and exit, killing the loop.
    _rafId = null

    if (_circuitBreakerTripped) {
        return
    }
    if (_webglContextLost) {
        return
    }
    // Pause the steady-state RAF loop when the document is not visible.
    // This lets Lighthouse find an idle period so the perf score becomes
    // measurable.  The loop resumes via the visibilitychange listener
    // registered in initThreeJS.
    if (typeof document !== 'undefined' && document.hidden) {
        return
    }
    if (!webglContext.renderer || !webglContext.scene || !webglContext.camera) {
        return
    }
    if (_state?.currentView !== 'galaxy' && !_state?.forceAnimate) {
        return
    }

    try {
        const frameStart = performance.now()
        const frameNow = frameStart
        const sceneNeedsContinuous = sceneNeedsContinuousFrame(frameNow)
        scheduleNextAnimationFrame(sceneNeedsContinuous)
        const sceneFrameMs = _state?.scenePerformanceDiagnostics?.lastFrameAt
            ? Math.min(250, Math.max(0, frameNow - _state.scenePerformanceDiagnostics.lastFrameAt))
            : 0
        _withStateMutation?.(() => {
            if (_state?.scenePerformanceDiagnostics) _state.scenePerformanceDiagnostics.lastFrameAt = frameNow
        })

        _cameraControls?.updateAutoRotateSoftResume(frameNow)
        _cameraControls?.focusCameraAssistIsActive(frameNow)
        if (webglContext.controls) {
            webglContext.controls.update()
        }

        const updateStart = performance.now()
        const revealProgress = _sceneReveal?.getSceneRevealProgress(frameNow) ?? 0
        const pointsRevealProgress = easeOutQuint(Math.min(1, Math.max(0, revealProgress / 0.7)))
        const cameraRevealProgress = easeInOutCubic(Math.min(1, Math.max(0, revealProgress)))

        let anyNodeMoved = false
        if (_state?.nodePositions && _state?.targetPositions) {
            const lerpFactor = _state.nodesAreSettling ? 0.14 : 0.08
            _state.nodePositions.forEach((pos: NodePosition, i: number) => {
                const target = _state!.targetPositions[i]
                if (!target) return
                const dx = target.x - pos.x
                const dy = target.y - pos.y
                const dz = target.z - pos.z
                if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001 || Math.abs(dz) > 0.0001) {
                    pos.x += dx * lerpFactor
                    pos.y += dy * lerpFactor
                    pos.z += dz * lerpFactor
                    setNodeSporeInstanceMatrixPort(i)
                    anyNodeMoved = true
                }
            })

            if (!_state) return
            if (_focusPocket?.applyFocusPocketBreathing(frameNow, _state.nodePositions)) {
                _state.focusPocketMotionByIndex.forEach((_motion: number, idx: number) => {
                    setNodeSporeInstanceMatrixPort(idx)
                    if (webglContext.nodeSporeHitMesh && _state.navState?.focusPocketIndices?.includes(idx)) {
                        setNodeSporeInstanceMatrixPort(idx, webglContext.nodeSporeHitMesh)
                    }
                })
                anyNodeMoved = true
            }

            if (anyNodeMoved) {
                if (webglContext.nodeSporeMesh) webglContext.nodeSporeMesh.instanceMatrix.needsUpdate = true
                if (webglContext.nodeSporeHitMesh) webglContext.nodeSporeHitMesh.instanceMatrix.needsUpdate = true
                if (_state) _state.myceliumDirty = true
            }
        }

        if (
            _state?.sceneRevealActive &&
            _state?.sceneRevealCameraStart &&
            _state?.sceneRevealCameraEnd &&
            _state?.focusedNode === null
        ) {
            webglContext.camera.position.lerpVectors(
                _state.sceneRevealCameraStart,
                _state.sceneRevealCameraEnd,
                cameraRevealProgress
            )
            if (webglContext.controls) {
                webglContext.controls.target.set(0, 0, 0)
            }
            if (revealProgress >= 1) {
                _withStateMutation?.(() => {
                    if (!_state) return
                    _state.sceneRevealActive = false
                    _state.sceneRevealCameraStart = null
                    _state.sceneRevealCameraEnd = null
                })
                _sceneReveal?.setSceneRevealDataset(false)
                _cameraControls?.scheduleAutoRotateResume(1200)
            }
        }

        if (webglContext.pointsMaterial) {
            const isFocused = Number.isFinite(_state?.focusedNode)
            const isSemanticDive = _state?.semanticDiveMode === true || (_state?.trailDepth ?? 0) >= 2
            const pointsOpacityScale = isSemanticDive ? 0.06 : isFocused ? 0.46 : 1.0
            const pointsSizeScale = isSemanticDive ? 0.36 : isFocused ? 0.8 : 1.0
            webglContext.pointsMaterial.opacity =
                0.32 * (SCENE_ATMOSPHERE.pointOpacityScale ?? 1) * pointsRevealProgress * pointsOpacityScale
            webglContext.pointsMaterial.size =
                CONFIG.POINTS_MATERIAL_BASE_SIZE * (1.06 + pointsRevealProgress * 0.46) * pointsSizeScale
            if (webglContext.pointsMaterial.userData.shader) {
                webglContext.pointsMaterial.userData.shader.uniforms.uRevealProgress.value = pointsRevealProgress
            }
        }

        if (webglContext.scene.fog && 'density' in webglContext.scene.fog) {
            ;(webglContext.scene.fog as FogExp2).density = (SCENE_ATMOSPHERE.fogDensity ?? 0.62) * pointsRevealProgress
        }
        if (webglContext.nodeSporeMaterial) {
            const isSemanticDive = _state?.semanticDiveMode === true || (_state?.trailDepth ?? 0) >= 2
            const focusBoost = isSemanticDive ? 0.22 : 1.0
            const targetSporeOpacity = (SCENE_ATMOSPHERE.sporeOpacity ?? 0.5) * pointsRevealProgress * focusBoost
            webglContext.nodeSporeMaterial.opacity +=
                (targetSporeOpacity - webglContext.nodeSporeMaterial.opacity) * 0.12
        }

        const hoveredNode = _state?.hoverHighlightIndex ?? -1
        const focusedNode = _state?.focusedNode ?? null

        // ── Hover emissive flash (spore material) ───────────────────────────────
        const hasHover = Number.isFinite(hoveredNode) && hoveredNode >= 0
        const lastHadHover = _lastHoveredNode !== null && Number.isFinite(_lastHoveredNode) && _lastHoveredNode >= 0
        if (hasHover !== lastHadHover || (hasHover && hoveredNode !== _lastHoveredNode)) {
            _hoverEmissiveFlash = 1.0
        }
        _lastHoveredNode = hoveredNode
        if (_hoverEmissiveFlash > 0.001 && webglContext.nodeSporeMaterial) {
            const baseIntensity = 0.34
            const flashPeak = 1.8
            const targetIntensity = baseIntensity + (flashPeak - baseIntensity) * _hoverEmissiveFlash
            ;(webglContext.nodeSporeMaterial as MeshPhongMaterial).emissiveIntensity = targetIntensity
            _hoverEmissiveFlash *= 0.92
            if (_hoverEmissiveFlash < 0.005) {
                _hoverEmissiveFlash = 0
                ;(webglContext.nodeSporeMaterial as MeshPhongMaterial).emissiveIntensity = baseIntensity
            }
        }

        const threadsVisible = shouldRenderThreads()
        if (webglContext.myceliumGroup) {
            webglContext.myceliumGroup.visible = threadsVisible
        }
        const prefersReduced =
            typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        const basePulseSpeed = prefersReduced ? 0.0 : 0.015
        const windSpeed = _state?.weather?.wind_speed_10m ?? 8.0
        const pulseIncrement = basePulseSpeed * (0.6 + windSpeed / 15.0)
        if (_state) _state.pulsePhase = (_state.pulsePhase + pulseIncrement) % (Math.PI * 2)

        const threadRevealProgress = easeOutQuint(Math.min(1.0, Math.max(0.0, (pointsRevealProgress - 0.25) / 0.5)))
        const graphProfile = getMyceliumPresentationProfilePort() as ReturnType<
            typeof getMyceliumPresentationProfilePort
        >
        const semanticDiveThreadScale = _state?.semanticDiveMode === true || (_state?.trailDepth ?? 0) >= 2 ? 0.42 : 1
        if (threadsVisible) {
            if (webglContext.myceliumCoreLines)
                (webglContext.myceliumCoreLines.material as Material).opacity =
                    (getThreadPulseOpacityPort(
                        graphProfile.core,
                        Math.sin(_state?.pulsePhase ?? 0),
                        graphProfile.pulse,
                        threadRevealProgress
                    ) ?? 0) * semanticDiveThreadScale
            if (webglContext.myceliumWispyLines)
                (webglContext.myceliumWispyLines.material as Material).opacity =
                    (getThreadPulseOpacityPort(
                        graphProfile.wispy,
                        Math.sin((_state?.pulsePhase ?? 0) * 0.7),
                        graphProfile.pulse * 0.36,
                        threadRevealProgress
                    ) ?? 0) * semanticDiveThreadScale
            if (webglContext.myceliumBridgeLines)
                (webglContext.myceliumBridgeLines.material as Material).opacity =
                    (getThreadPulseOpacityPort(
                        graphProfile.bridge,
                        Math.sin((_state?.pulsePhase ?? 0) * 0.45),
                        graphProfile.pulse * 0.28,
                        threadRevealProgress
                    ) ?? 0) * semanticDiveThreadScale
        } else {
            if (webglContext.myceliumCoreLines) (webglContext.myceliumCoreLines.material as Material).opacity = 0
            if (webglContext.myceliumWispyLines) (webglContext.myceliumWispyLines.material as Material).opacity = 0
            if (webglContext.myceliumBridgeLines) (webglContext.myceliumBridgeLines.material as Material).opacity = 0
        }

        if (webglContext.pointsMaterial?.userData?.shader) {
            const shader = webglContext.pointsMaterial.userData.shader
            const hasHover = Number.isFinite(hoveredNode) && hoveredNode >= 0
            const targetBoost = hasHover ? 1.5 : 1.0
            shader.uniforms.uHoverBoost.value += (targetBoost - shader.uniforms.uHoverBoost.value) * 0.2
            if (hasHover && _state?.nodePositions[hoveredNode]) {
                const hoverPos = _state.nodePositions[hoveredNode]
                shader.uniforms.uHoverNodePos.value.set(hoverPos.x, hoverPos.y, hoverPos.z)
            }
        }

        if (sceneNeedsContinuous) {
            updateInteractionVisuals(frameNow, hoveredNode, focusedNode)
            updateCorridorNodeGlow(frameNow)
            updateSearchCorridorAnimation(frameNow)

            try {
                _inspectedStrand?.updateInspectedStrandOverlayFrame(frameNow)
                updateRouteTraceOverlayFrame(frameNow)
                updateArrivalHandoffOverlayFrame(frameNow)
            } catch (overlayErr) {
                debugWarn('overlay update threw:', overlayErr)
            }
        }

        // Note: _focusPocket.applyFocusPocketBreathing(...) is already called inside
        // the node-position lerp block above (around L951) where its boolean return
        // drives per-pocket instance-matrix updates. A second invocation here would
        // re-write pocket positions without ever pushing them to the GPU buffers,
        // doubling the per-frame breathing cost (50-200ms in QA). Removed per
        // W15-T1 focus-deadlock diagnosis (tmp/w15-focus-deadlock-diagnosis.md).

        if (sceneNeedsContinuous && shouldRenderThreads()) {
            updateMyceliumThreads()
        }
        if (sceneNeedsContinuous) {
            _cameraControls?.applySemanticCentroidCamera(frameNow)
            _clusterLabels?.updateClusterLabels()
        }

        const updateEnd = performance.now()
        const renderStart = performance.now()

        if (webglContext.renderer && webglContext.scene && webglContext.camera) {
            // Premium mode: render through EffectComposer. When premium mode is off
            // (or composer is not yet initialized), renderPostProcessing() returns
            // false and we fall through to the vanilla renderer.render() path.
            const pp = _ppModule
            const renderedViaComposer = pp ? pp.renderPostProcessing() : false
            if (!renderedViaComposer) {
                webglContext.renderer.render(webglContext.scene, webglContext.camera)
            }

            _withStateMutation?.(() => {
                if (!_state?.scenePerformanceDiagnostics) return
                _state.scenePerformanceDiagnostics.drawCalls = webglContext.renderer!.info.render.calls
                _state.scenePerformanceDiagnostics.triangles = webglContext.renderer!.info.render.triangles
            })
        }

        const renderEnd = performance.now()

        sampleScenePerformance(
            sceneFrameMs,
            {
                updateMs: updateEnd - updateStart,
                renderMs: renderEnd - renderStart
            },
            _state
        )
    } catch (err) {
        if (import.meta.env.DEV) console.error('[three-engine] Unhandled exception in animate loop:', err)
        _circuitBreakerTripped = true
    }
}
