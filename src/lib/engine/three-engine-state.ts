/**
 * @lib/engine/three-engine-state.ts — Singleton state object for three-engine-core
 *
 * Phase 0 of the decomposition plan (docs/three-engine-decomposition-plan.md).
 * Consolidates all module-level mutable state from three-engine-core.ts into a
 * single singleton `engineState` object. All `_xxx` references in the core file
 * become `engineState.xxx`.
 *
 * The lazy module cache (`ensureModules()`) lives here because it writes
 * directly to the cached module refs.
 */

import type { AppState } from '@lib/state/app.svelte'
import type { DisposableRegistry } from '@lib/utils/disposable-registry'
import type { SceneStaticSnapshot } from '@lib/engine/renderer/scene-static-tracker'
export type PostProcessingModule = {
    initPostProcessing: typeof import('@lib/engine/three-postprocessing').initPostProcessing
    renderPostProcessing: typeof import('@lib/engine/three-postprocessing').renderPostProcessing
    disposePostProcessing: typeof import('@lib/engine/three-postprocessing').disposePostProcessing
    resizePostProcessing: typeof import('@lib/engine/three-postprocessing').resizePostProcessing
}

// ── Legacy Module Type Contracts ──────────────────────────────────────────────

interface WithStateMutationFn {
    (fn: () => void): void
}

interface WindowWithDevGlobals extends Window {
    __LEGACY_APP_STATE__?: AppState | undefined
    __refreshTestCompatState__?: () => void
}

type ViewControllerModule = typeof import('@lib/orchestration/view-controller')
type ClusterLabelsModule = typeof import('@lib/ui/cluster-labels')
type FocusPocketModule = typeof import('@lib/journey/focus-pocket')
type SceneRevealModule = typeof import('./scene-reveal')
type CameraControlsModule = typeof import('@lib/engine/camera-controls')
type MapStateModule = typeof import('@lib/engine/map-state')
type UiFeedbackModule = typeof import('@lib/ui/ui-feedback') &
    // PR-D7 merged in the Svelte toastOrchMod to expose showExperienceToast
    // after the legacy DOM-direct implementation was retired from ui-feedback.
    { showExperienceToast(title: string, message?: string): void }
type MapFlatteningModule = typeof import('../utils/map-flattening-layout')
type WebGLRestoreModule = {
    setWebGLContextRestoreHandler: (fn: (() => Promise<unknown> | unknown) | null) => void
    restoreWebGLContext: () => Promise<boolean>
}
type InspectedStrandModule = typeof import('@lib/journey/inspected-strand-overlay-adapter')
type FocusAnchorModule = typeof import('@lib/journey/focus-anchor-indicator')
type ThreeSearchAnimationsModule = typeof import('./three-search-animations')
type AudioScapeModule = typeof import('@lib/audio/audio-scape')
type LoadingUiModule = typeof import('../ui/loading')
type ThreeInteractionVisualsModule = typeof import('./three-interaction-visuals')

// ── State Interface ──────────────────────────────────────────────────────────

export interface ThreeEngineState {
    // Lazy module cache (set by ensureModules)
    ppModule: PostProcessingModule | null
    ppLoading: Promise<PostProcessingModule> | null
    withStateMutation: WithStateMutationFn | null
    // Engine restore/retry coordination flag (set by initThreeJS bootstrap)
    renderLoopStartPending: boolean
    viewController: ViewControllerModule | null
    clusterLabels: ClusterLabelsModule | null
    focusPocket: FocusPocketModule | null
    sceneReveal: SceneRevealModule | null
    cameraControls: CameraControlsModule | null
    mapState: MapStateModule | null
    uiFeedback: UiFeedbackModule | null
    mapFlattening: MapFlatteningModule | null
    webglRestore: WebGLRestoreModule | null
    inspectedStrand: InspectedStrandModule | null
    focusAnchor: FocusAnchorModule | null
    threeSearchAnimations: ThreeSearchAnimationsModule | null
    audioScape: AudioScapeModule | null
    loadingUi: LoadingUiModule | null
    threeInteractionVisuals: ThreeInteractionVisualsModule | null
    state: AppState | null
    loaded: boolean

    // Render-loop bookkeeping
    rafId: number | null
    idleFrameTimerId: number | null
    webglContextLost: boolean
    /** T3-1: set true by the C6 (webglcontextrestored) handler so the
     *  orchestration layer knows a full GPU resource re-init is needed
     *  after a context loss event. Checked at the top of initThreeJS(). */
    webglNeedsRestoreReinit: boolean
    circuitBreakerTripped: boolean
    webglRestoreTimer: number | null
    lastHoveredNode: number | null
    hoverEmissiveFlash: number
    sceneRegistry: DisposableRegistry | null
    mapButtonClickHandler: ((event: MouseEvent) => void) | null

    // W49-H: camera-matrix-delta snapshot for the conditional render-skip.
    // Reset by the dispose path so a fresh engine mount gets a non-stale baseline.
    // null → no baseline yet (first frame always renders). Shape mirrors
    // SceneStaticSnapshot (cameraPos/cameraQuat) so shouldSkipNextRender's
    // shape compare against the W49-H refactor doesn't silently disagree.
    lastCameraSnapshot: SceneStaticSnapshot | null
    /** W49-H: consecutive frames skipped because the camera scene was static. */
    consecutiveSkippedFrames: number
    /** W49-H: total render-skip opportunities since engine init. */
    renderSkipOpportunities: number
}

// ── WebGL context restore handler (inlined from webgl-restore-adapter.ts) ────

let _webglRestoreHandler: (() => Promise<unknown> | unknown) | null = null

// ── Singleton Instance ───────────────────────────────────────────────────────

export const engineState: ThreeEngineState = {
    // Lazy module cache
    renderLoopStartPending: false,
    ppModule: null,
    ppLoading: null,
    withStateMutation: null,
    viewController: null,
    clusterLabels: null,
    focusPocket: null,
    sceneReveal: null,
    cameraControls: null,
    mapState: null,
    uiFeedback: null,
    mapFlattening: null,
    webglRestore: null,
    inspectedStrand: null,
    focusAnchor: null,
    threeSearchAnimations: null,
    audioScape: null,
    loadingUi: null,
    threeInteractionVisuals: null,
    state: null,
    loaded: false,

    // Render-loop bookkeeping
    rafId: null,
    idleFrameTimerId: null,
    webglContextLost: false,
    webglNeedsRestoreReinit: false,
    circuitBreakerTripped: false,
    webglRestoreTimer: null,
    lastHoveredNode: null,
    hoverEmissiveFlash: 0,
    sceneRegistry: null,
    mapButtonClickHandler: null,

    // W49-H: initialize the camera-snapshot tracker.
    lastCameraSnapshot: null,
    consecutiveSkippedFrames: 0,
    renderSkipOpportunities: 0
}

// ── Module Bootstrap ─────────────────────────────────────────────────────────

import { legacyState } from '@lib/state/app.svelte'
import * as viewControllerMod from '@lib/orchestration/view-controller'
import * as mapStateMod from '@lib/engine/map-state'
import * as uiFeedbackMod from '@lib/ui/ui-feedback'
import * as toastOrchMod from '@lib/orchestration/toast'
import * as mapFlatteningMod from '../utils/map-flattening-layout'
import * as focusAnchorMod from '@lib/journey/focus-anchor-indicator'
import * as audioScapeMod from '@lib/audio/audio-scape'
import * as loadingUiMod from '../ui/loading'
import * as clusterLabelsMod from '@lib/ui/cluster-labels'
import * as focusPocketMod from '@lib/journey/focus-pocket'
import * as sceneRevealMod from './scene-reveal'
import * as cameraControlsMod from '@lib/engine/camera-controls'
import * as inspectedStrandMod from '@lib/journey/inspected-strand-overlay-adapter'
import * as threeSearchAnimationsMod from './three-search-animations'
import * as threeInteractionVisualsMod from './three-interaction-visuals'
import { debugError } from '@lib/utils/debug'

export function ensureModules(): void {
    if (engineState.loaded) return
    try {
        engineState.state = legacyState
        if (typeof window !== 'undefined') {
            ;(window as WindowWithDevGlobals).__LEGACY_APP_STATE__ = legacyState
            ;(window as WindowWithDevGlobals).__refreshTestCompatState__?.()
        }
        engineState.withStateMutation = (fn: () => void) => fn()
        engineState.viewController = viewControllerMod
        engineState.clusterLabels = clusterLabelsMod
        engineState.focusPocket = focusPocketMod
        engineState.sceneReveal = sceneRevealMod
        engineState.cameraControls = cameraControlsMod
        engineState.mapState = mapStateMod
        engineState.uiFeedback = { ...uiFeedbackMod, ...toastOrchMod }
        engineState.mapFlattening = mapFlatteningMod
        engineState.webglRestore = {
            setWebGLContextRestoreHandler(fn: (() => Promise<unknown> | unknown) | null): void {
                _webglRestoreHandler = typeof fn === 'function' ? fn : null
            },
            restoreWebGLContext(): Promise<boolean> {
                if (!_webglRestoreHandler) return Promise.resolve(false)
                return Promise.resolve(_webglRestoreHandler()).then(() => true)
            }
        }
        engineState.inspectedStrand = inspectedStrandMod
        engineState.focusAnchor = focusAnchorMod
        engineState.threeSearchAnimations = threeSearchAnimationsMod
        engineState.audioScape = audioScapeMod
        engineState.loadingUi = loadingUiMod
        engineState.threeInteractionVisuals = threeInteractionVisualsMod
        engineState.loaded = true
    } catch (err) {
        debugError('[three-engine] Failed to load legacy modules:', err)
    }
}
