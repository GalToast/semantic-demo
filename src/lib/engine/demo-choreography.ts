/**
 * @lib/engine/demo-choreography.ts — Demo choreography state machine, focus setup, reset, and timed phase chain
 *
 * Port of js/modules/micro-demo-choreography.js
 *
 * This module is a **pure side-effecting helper** — it drives DOM, camera, and
 * animation via the legacy engine. It does NOT own the demo phase state; it
 * reads/writes module-level scratch for its own bookkeeping (node index,
 * cancellation flag, timer handles) and delegates authoritative phase state
 * to the Svelte demo store (`src/lib/stores/demo.ts`) where appropriate by the
 * caller. The JS-side `_demoPhase`, `_demoNodeIndex`, `_demoTimers`,
 * `_demoCancelled` module variables are preserved here as private scratch so
 * that the external contract (exports) stays identical.
 *
 * Known issue (Phase 4 fix): the caller's `startMicroDemo()` retry loop has a
 * race condition. This port preserves the existing behavior — the fix is owned
 * by a separate migration wave.
 */

import type { DemoPhase } from '@lib/types/state'
import { appState } from '@lib/state/app.svelte'
import { animateCameraToNode } from '@lib/engine/camera-choreography'
import { setAutoRotateSuspended } from '@lib/engine/camera-controls-restore-bridge'
const cameraControlsStaticModule = { animateCameraToNode, setAutoRotateSuspended }
import * as focusPocketStaticModule from '@lib/journey/focus-pocket'
import * as lifecycleStaticModule from '@lib/engine/lifecycle-bridge'
import * as journeyCompassStaticModule from '@lib/engine/journey-compass-controller-bridge'
import { applyPointFilterColors } from '@lib/journey/point-color'
import { updateSelectedBusiness } from '@lib/journey/selected-card'
import * as panelBindingsStaticModule from '@lib/ui/panel-bindings'
import * as microDemoGuardsStaticModule from '@lib/demo/guards'
import * as microDemoCameraStaticModule from '@lib/demo/camera'
import * as microDemoUiStaticModule from '@lib/demo/ui'

// ── Legacy Module Type Contracts ──────────────────────────────────────────────
//
// Minimal interfaces for the subset of legacy functions this module calls.
// Dynamic imports return the full module; we narrow via typed references.

interface CameraControlsModule {
    animateCameraToNode(
        index: number,
        options?: {
            transitionStyle?: string
            duration?: number
            verticalLift?: number
            distance?: number
        }
    ): void
    setAutoRotateSuspended(suspended: boolean): void
}

interface FocusPocketModule {
    applyLocalNeighborhoodFocus(index: number): void
    clearFocusPocketIndices(): void
    clearFocusPocketMeta(): void
}

interface LifecycleModule {
    refreshCompositionState(): void
    updateExplorationUi(): void
    resetNodePositions(): void
}

interface JourneyCompassModule {
    updateJourneyCompass(phase?: string): void
}

interface JourneyModule {
    updateSelectedBusiness: typeof updateSelectedBusiness
    applyPointFilterColors: typeof applyPointFilterColors
}

interface PanelBindingsModule {
    setInfoPanelOpen(open: boolean): void
}

interface MicroDemoGuardsModule {
    recordCompletion(): void
}

interface MicroDemoCameraModule {
    captureOverviewCameraSnapshot(): void
    animateCameraToOverview(duration?: number): void
}

interface MicroDemoUiModule {
    showVeil(overlay?: boolean): void
    hideVeil(): void
    showPill(text: string, onCancel: (reason: string) => void): void
    removePill(): void
    showEndToast(): void
    bindInputInterceptor(onIntercept: (reason: string) => void): void
    unbindInputInterceptor(): void
    injectMicroDemoStyles(): void
}

// ── Phase Constants ──────────────────────────────────────────────────────────

export const PHASE: Record<DemoPhase, DemoPhase> = {
    IDLE: 'IDLE',
    GLIDING: 'GLIDING',
    ARRIVED: 'ARRIVED',
    CARD_VISIBLE: 'CARD_VISIBLE',
    PULLBACK: 'PULLBACK',
    WIDE_VIEW: 'WIDE_VIEW',
    RETURNING: 'RETURNING',
    COMPLETE: 'COMPLETE',
    CANCELLED: 'CANCELLED'
}

// ── Module-level Scratch State ────────────────────────────────────────────────
// These mirror the JS module variables. The authoritative demo phase lives in
// the Svelte demo store; these are scratch bookkeeping for the choreography
// module's own guard checks and timer lifecycle.

let _demoPhase: DemoPhase = PHASE.IDLE
let _demoNodeIndex: number | null = null
let _demoTimers: number[] = []
let _demoCancelled = false

// ── Exported Accessors ────────────────────────────────────────────────────────

export function getDemoPhase(): DemoPhase {
    return _demoPhase
}

export function getDemoNodeIndex(): number | null {
    return _demoNodeIndex
}

export function isDemoCancelled(): boolean {
    return _demoCancelled
}

export function setDemoNodeIndex(idx: number | null): void {
    _demoNodeIndex = idx
}

export function clearDemoTimers(): void {
    for (const t of _demoTimers) {
        window.clearTimeout(t)
    }
    _demoTimers = []
}

export function resetRetryState(): void {
    _demoPhase = PHASE.IDLE
    _demoNodeIndex = null
    _demoCancelled = false
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

async function loadCameraControls(): Promise<CameraControlsModule> {
    return cameraControlsStaticModule as unknown as CameraControlsModule
}

async function loadFocusPocket(): Promise<FocusPocketModule> {
    return focusPocketStaticModule as unknown as FocusPocketModule
}

async function loadLifecycle(): Promise<LifecycleModule> {
    return lifecycleStaticModule as unknown as LifecycleModule
}

async function loadJourneyCompass(): Promise<JourneyCompassModule> {
    return journeyCompassStaticModule as unknown as JourneyCompassModule
}

async function loadJourney(): Promise<JourneyModule> {
    return { updateSelectedBusiness, applyPointFilterColors }
}

async function loadPanelBindings(): Promise<PanelBindingsModule> {
    return panelBindingsStaticModule as unknown as PanelBindingsModule
}

async function loadMicroDemoGuards(): Promise<MicroDemoGuardsModule> {
    return microDemoGuardsStaticModule as unknown as MicroDemoGuardsModule
}

async function loadMicroDemoCamera(): Promise<MicroDemoCameraModule> {
    return microDemoCameraStaticModule as unknown as MicroDemoCameraModule
}

async function loadMicroDemoUi(): Promise<MicroDemoUiModule> {
    return microDemoUiStaticModule as unknown as MicroDemoUiModule
}

// ── demoReset ─────────────────────────────────────────────────────────────────
// Resets all demo-related state and UI chrome back to overview.

async function demoReset(): Promise<void> {
    const [focusPocket, lifecycle, compass, _journey, panel] = await Promise.all([
        loadFocusPocket(),
        loadLifecycle(),
        loadJourneyCompass(),
        loadJourney(),
        loadPanelBindings()
    ])

    appState.selectedPoint = null
    // navState is a TRACKED_SUB_KEY; batch mutations under withMutation
    // to avoid the production Proxy throwing on direct sub-property writes.
    appState.withMutation(() => {
        appState.navState.mode = 'overview'
        appState.navState.focusedIndex = null
        appState.navState.trailSeedIndex = null
        appState.navState.trailNeighborIndices = []
        appState.navState.trailCursor = -1
        appState.navState.walkHistoryIndices = []
    })

    focusPocket.clearFocusPocketIndices()
    focusPocket.clearFocusPocketMeta()

    appState.focusCameraAssistActive = false
    appState.focusCameraOffset = null
    appState.focusTransitionMode = 'idle'
    document.body.dataset.focusTransition = ''
    document.body.dataset.focusTransitionPhase = ''

    if (appState.controls) appState.controls.enabled = true

    updateSelectedBusiness(null)
    applyPointFilterColors()
    lifecycle.refreshCompositionState()
    compass.updateJourneyCompass()
    panel.setInfoPanelOpen(true)
}

// ── demoFocusSetup ────────────────────────────────────────────────────────────
// Enters focus mode on the given demo node.

async function demoFocusSetup(demoNode: number): Promise<void> {
    const [focusPocket, lifecycle, compass, _journey] = await Promise.all([
        loadFocusPocket(),
        loadLifecycle(),
        loadJourneyCompass(),
        loadJourney()
    ])

    const point = appState.points?.[demoNode] ?? null
    appState.selectedPoint = point
    // navState is a TRACKED_SUB_KEY; batch mutations under withMutation.
    appState.withMutation(() => {
        appState.navState.mode = 'focus'
        appState.navState.focusedIndex = demoNode
        appState.navState.walkHistoryIndices = [demoNode]
    })

    updateSelectedBusiness(point, { revealCard: true })
    applyPointFilterColors()
    lifecycle.updateExplorationUi()
    compass.updateJourneyCompass('focus')
    lifecycle.refreshCompositionState()
    lifecycle.resetNodePositions()

    if (typeof focusPocket.applyLocalNeighborhoodFocus === 'function') {
        focusPocket.applyLocalNeighborhoodFocus(demoNode)
    }
}

// ── cleanup ───────────────────────────────────────────────────────────────────
// Tears down all demo DOM artifacts and resets scratch state.

async function cleanup(): Promise<void> {
    const ui = await loadMicroDemoUi()
    document.body.removeAttribute('data-demo-active')
    clearDemoTimers()
    ui.hideVeil()
    ui.removePill()
    ui.unbindInputInterceptor()
    _demoPhase = PHASE.IDLE
    _demoNodeIndex = null
    _demoCancelled = false
}

// ── endDemo ───────────────────────────────────────────────────────────────────

async function endDemo(notifyEvent: string, shouldRecordCompletion: boolean): Promise<void> {
    const camera = await loadCameraControls()
    const guards = await loadMicroDemoGuards()

    await cleanup()
    camera.setAutoRotateSuspended(false)
    if (shouldRecordCompletion) guards.recordCompletion()
    document.dispatchEvent(new CustomEvent(notifyEvent))
}

// ── runDemo ───────────────────────────────────────────────────────────────────
// Launches the full choreography: veil → glide → arrive → card → pullback →
// wide → return → complete. All phases are timed via setTimeout.

export async function runDemo(cancelMicroDemo: (reason: string) => void): Promise<void> {
    // Pre-load all modules needed directly in this function.
    // demoFocusSetup and demoReset load their own dependencies internally.
    const [camera, microDemoCamera, ui, panel] = await Promise.all([
        loadCameraControls(),
        loadMicroDemoCamera(),
        loadMicroDemoUi(),
        loadPanelBindings()
    ])

    ui.injectMicroDemoStyles()
    document.body.dataset.demoActive = 'true'
    _demoPhase = PHASE.GLIDING
    _demoCancelled = false

    microDemoCamera.captureOverviewCameraSnapshot()
    camera.setAutoRotateSuspended(true)
    if (appState.controls) appState.controls.enabled = false

    ui.showVeil(true)
    ui.showPill('Demo -- watch it works', (reason: string) => cancelMicroDemo(reason))
    ui.bindInputInterceptor((reason: string) => cancelMicroDemo(reason))

    const demoNode = _demoNodeIndex as number

    // 50ms — glow highlight
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            document.dispatchEvent(
                new CustomEvent('micro-demo-node-highlight', {
                    detail: { index: demoNode, phase: 'glow' }
                })
            )
        }, 50)
    )

    // 100ms — start camera glide (1200ms animation, arrives at ~1400ms)
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            camera.animateCameraToNode(demoNode, {
                transitionStyle: 'focus',
                duration: 1200,
                verticalLift: 0.05,
                distance: 0.45
            })
            document.dispatchEvent(
                new CustomEvent('micro-demo-node-highlight', {
                    detail: { index: demoNode, phase: 'gliding' }
                })
            )
        }, 100)
    )

    // 1400ms — arrived, setup focus (GLIDING_MS)
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            _demoPhase = PHASE.ARRIVED
            // Fire-and-forget: demoFocusSetup is async but caller does not need to await.
            void demoFocusSetup(demoNode)
            document.body.dataset.focusOrigin = 'micro-demo'
            document.dispatchEvent(
                new CustomEvent('micro-demo-node-highlight', {
                    detail: { index: demoNode, phase: 'arrived' }
                })
            )
        }, 1400)
    )

    // 1520ms — card visible (GLIDING_MS + ARRIVED_HOLD_MS)
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            _demoPhase = PHASE.CARD_VISIBLE
            document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'))
        }, 1520)
    )

    // 2520ms — second name pulse (midway through CARD_VISIBLE)
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'))
        }, 2520)
    )

    // 3320ms — pullback (GLIDING_MS + ARRIVED_HOLD_MS + CARD_VISIBLE_MS)
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            _demoPhase = PHASE.PULLBACK
            camera.animateCameraToNode(demoNode, {
                transitionStyle: 'focus',
                duration: 1200,
                distance: 1.8,
                verticalLift: 0.12
            })
        }, 3320)
    )

    // 4520ms — wide view (above + PULLBACK_MS)
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            _demoPhase = PHASE.WIDE_VIEW
            document.dispatchEvent(
                new CustomEvent('micro-demo-node-highlight', {
                    detail: { index: demoNode, phase: 'wide_view' }
                })
            )
            panel.setInfoPanelOpen(false)
        }, 4520)
    )

    // 4870ms — returning to overview (above + WIDE_VIEW_HOLD_MS)
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            _demoPhase = PHASE.RETURNING
            // Fire-and-forget: demoReset is async but caller does not need to await.
            void demoReset()
            microDemoCamera.animateCameraToOverview(1000)
            document.dispatchEvent(
                new CustomEvent('micro-demo-node-highlight', {
                    detail: { index: demoNode, phase: 'cleanup' }
                })
            )
        }, 4870)
    )

    // 5870ms — complete (above + RETURNING_MS)
    _demoTimers.push(
        window.setTimeout(() => {
            if (_demoCancelled) return
            _demoPhase = PHASE.COMPLETE
            ui.showEndToast()
            // Fire-and-forget: endDemo is async but the demo is complete at this point.
            void endDemo('demo-complete', true)
        }, 5870)
    )
}

// ── cancelChoreography ────────────────────────────────────────────────────────

export async function cancelChoreography(reason: string = 'user-input'): Promise<boolean> {
    if (_demoPhase === PHASE.IDLE || _demoPhase === PHASE.COMPLETE || _demoCancelled) {
        return false
    }

    const microDemoCamera = await loadMicroDemoCamera()

    _demoCancelled = true
    _demoPhase = PHASE.CANCELLED
    clearDemoTimers()
    await demoReset()

    if (appState.camera && appState.controls && (reason === 'escape-key' || reason === 'user-input')) {
        microDemoCamera.animateCameraToOverview(800)
    }

    const shouldRecord = reason === 'user-input' || reason === 'escape-key' || reason === 'skip-button'
    await endDemo('demo-cancelled', shouldRecord)
    return true
}

// ── isMicroDemoRunning ────────────────────────────────────────────────────────

export function isMicroDemoRunning(): boolean {
    return _demoPhase !== PHASE.IDLE && _demoPhase !== PHASE.COMPLETE && _demoPhase !== PHASE.CANCELLED
}
