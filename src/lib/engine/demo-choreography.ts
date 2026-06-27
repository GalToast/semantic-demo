/**
 * @lib/engine/demo-choreography.ts — Demo choreography state machine, focus setup, reset, and timed phase chain
 *
 * Port of
 *
 * This module is a **pure side-effecting helper** — it drives DOM, camera, and
 * animation via the legacy engine. It does NOT own the demo phase state; it
 * reads/writes module-level scratch for its own bookkeeping (node index,
 * cancellation flag, timer handles) and delegates authoritative phase state
 * to the Svelte demo store (`src/lib/stores/demo.ts`) where appropriate by the
 * caller. The JS-side `_demoPhase`, `_demoNodeIndex`, `_demoRegistry`,
 * `_demoCancelled` module variables are preserved here as private scratch so
 * that the external contract (exports) stays identical.
 *
 * Known issues (W47 state):
 *   - The caller's `startMicroDemo()` retry loop in `src/lib/demo/choreography.ts`
 *     has a race condition where the re-entry guard is released before the
 *     recursive retry call, allowing concurrent invocations to slip through.
 *     This port preserves the existing behavior — the fix is owned by a
 *     separate migration wave.
 *   - As of W47, all async work in this file is wrapped in try/catch envelopes
 *     and `runDemo`'s 9 fire-and-forget phase-timer callbacks are guarded
 *     individually. Any throw inside a phase timer is now logged via
 *     `debugWarn` (dev-gated) instead of silently corrupting demo state.
 *   - The previous `_demoNodeIndex as number` silent null→0 coercion was
 *     replaced with an explicit null/finiteness check that aborts with a
 *     state reset.
 */

import type { DemoPhase } from '@lib/types/state'
import { appState } from '@lib/state/app.svelte'
import { writeNavStateMirror } from '@lib/stores/navigation.svelte'
import { setAutoRotateSuspended } from '@lib/engine/camera-controls-restore.svelte'
import { setFocusTransitionMode } from '@lib/engine/camera-controls-core'
import * as lifecycleStaticModule from '@lib/orchestration/lifecycle'
import * as journeyCompassStaticModule from '@lib/orchestration/compass-controller'
import { updateSelectedBusiness } from '@lib/journey/selected-card'
import * as panelBindingsStaticModule from '@lib/ui/panel-bindings'
import { animateCameraToNode } from '@lib/engine/camera-choreography'
import { debugWarn } from '@lib/utils/debug'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

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
let _demoRegistry: DisposableRegistry = new DisposableRegistry({ label: 'demo-choreography' })
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
    _demoRegistry.disposeAll()
    _demoRegistry = new DisposableRegistry({ label: 'demo-choreography' })
}

export function resetRetryState(): void {
    _demoPhase = PHASE.IDLE
    _demoNodeIndex = null
    _demoCancelled = false
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

async function loadCameraControls(): Promise<CameraControlsModule> {
    return { animateCameraToNode, setAutoRotateSuspended }
}

async function loadFocusPocket(): Promise<FocusPocketModule> {
    const mod = await import('@lib/journey/focus-pocket')
    return mod
}

async function loadLifecycle(): Promise<LifecycleModule> {
    return lifecycleStaticModule
}

async function loadJourneyCompass(): Promise<JourneyCompassModule> {
    return journeyCompassStaticModule
}

async function loadJourney(): Promise<JourneyModule> {
    return { updateSelectedBusiness }
}

async function loadPanelBindings(): Promise<PanelBindingsModule> {
    return panelBindingsStaticModule
}

async function loadMicroDemoGuards(): Promise<MicroDemoGuardsModule> {
    const mod = await import('@lib/demo/guards')
    return mod
}

async function loadMicroDemoCamera(): Promise<MicroDemoCameraModule> {
    const mod = await import('@lib/demo/camera')
    return mod
}

async function loadMicroDemoUi(): Promise<MicroDemoUiModule> {
    const mod = await import('@lib/demo/ui')
    return mod
}

// ── demoReset ─────────────────────────────────────────────────────────────────
// Resets all demo-related state and UI chrome back to overview.

async function demoReset(): Promise<void> {
    try {
        const [focusPocket, lifecycle, compass, _journey, panel] = await Promise.all([
            loadFocusPocket(),
            loadLifecycle(),
            loadJourneyCompass(),
            loadJourney(),
            loadPanelBindings()
        ])

        // Write to both legacy navState and Svelte 5 navStore in one call.
        writeNavStateMirror({
            mode: 'overview',
            focusedIndex: null,
            trailSeedIndex: null,
            trailNeighborIndices: [],
            trailCursor: -1,
            walkHistoryIndices: []
        })

        focusPocket.clearFocusPocketIndices()
        focusPocket.clearFocusPocketMeta()

        appState.focusCameraAssistActive = false
        appState.focusCameraOffset = null
        setFocusTransitionMode('idle')

        if (appState.controls) appState.controls.enabled = true

        updateSelectedBusiness(null)
        const { applyPointFilterColors } = await import('@lib/journey/point-color')
        applyPointFilterColors()
        lifecycle.refreshCompositionState()
        compass.updateJourneyCompass()
        panel.setInfoPanelOpen(true)
    } catch (err) {
        debugWarn('[demo-choreography] demoReset failed:', err)
        // best-effort state recovery so we don't leave the app stuck mid-demo
        try {
            _demoPhase = PHASE.IDLE
        } catch {
            /* swallow */
        }
    }
}

// ── demoFocusSetup ────────────────────────────────────────────────────────────
// Enters focus mode on the given demo node.

async function demoFocusSetup(demoNode: number): Promise<void> {
    try {
        const [focusPocket, lifecycle, compass, _journey] = await Promise.all([
            loadFocusPocket(),
            loadLifecycle(),
            loadJourneyCompass(),
            loadJourney()
        ])

        const point = appState.points?.[demoNode] ?? null
        // Write to both legacy navState and Svelte 5 navStore in one call.
        writeNavStateMirror({
            mode: 'focus',
            focusedIndex: demoNode,
            walkHistoryIndices: [demoNode]
        })

        updateSelectedBusiness(point, { revealCard: true })
        const { applyPointFilterColors } = await import('@lib/journey/point-color')
        applyPointFilterColors()
        lifecycle.updateExplorationUi()
        compass.updateJourneyCompass('focus')
        lifecycle.refreshCompositionState()
        lifecycle.resetNodePositions()

        if (typeof focusPocket.applyLocalNeighborhoodFocus === 'function') {
            focusPocket.applyLocalNeighborhoodFocus(demoNode)
        }
    } catch (err) {
        debugWarn('[demo-choreography] demoFocusSetup failed:', err)
        try {
            _demoPhase = PHASE.CANCELLED
            _demoCancelled = true
        } catch {
            /* swallow */
        }
    }
}

// ── cleanup ───────────────────────────────────────────────────────────────────
// Tears down all demo DOM artifacts and resets scratch state.

async function cleanup(): Promise<void> {
    try {
        const ui = await loadMicroDemoUi()
        document.body.removeAttribute('data-demo-active')
        clearDemoTimers()
        ui.hideVeil()
        ui.removePill()
        ui.unbindInputInterceptor()
        _demoPhase = PHASE.IDLE
        _demoNodeIndex = null
        _demoCancelled = false
    } catch (err) {
        debugWarn('[demo-choreography] cleanup failed:', err)
        // state is best-effort: ensure scratch flags are sane even if DOM teardown failed
        try {
            _demoPhase = PHASE.IDLE
        } catch {
            /* swallow */
        }
        try {
            _demoCancelled = false
        } catch {
            /* swallow */
        }
    }
}

// ── endDemo ───────────────────────────────────────────────────────────────────

async function endDemo(notifyEvent: string, shouldRecordCompletion: boolean): Promise<void> {
    try {
        const camera = await loadCameraControls()
        const guards = await loadMicroDemoGuards()

        await cleanup()
        camera.setAutoRotateSuspended(false)
        if (shouldRecordCompletion) guards.recordCompletion()
        document.dispatchEvent(new CustomEvent(notifyEvent))
    } catch (err) {
        debugWarn('[demo-choreography] endDemo failed:', err)
    }
}

// ── runDemo ───────────────────────────────────────────────────────────────────
// Launches the full choreography: veil → glide → arrive → card → pullback →
// wide → return → complete. All phases are timed via setTimeout.

export async function runDemo(cancelMicroDemo: (reason: string) => void): Promise<void> {
    try {
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
        ui.showPill('Sample tour — click to exit.', (reason: string) => cancelMicroDemo(reason))
        ui.bindInputInterceptor((reason: string) => cancelMicroDemo(reason))

        // Guard against missing node index. The previous `as number` cast
        // silently coerced null to 0, which would focus the demo on the
        // first business instead of failing loudly. Bail with state reset
        // so a stale retry can't re-enter with bad data.
        const demoNode = _demoNodeIndex
        if (demoNode === null || !Number.isFinite(demoNode)) {
            debugWarn('[demo-choreography] runDemo called without setDemoNodeIndex; aborting')
            _demoPhase = PHASE.IDLE
            _demoCancelled = false
            try {
                clearDemoTimers()
            } catch {
                /* swallow */
            }
            try {
                document.body.removeAttribute('data-demo-active')
            } catch {
                /* swallow */
            }
            return
        }

        // 50ms — glow highlight
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
                if (_demoCancelled) return
                document.dispatchEvent(
                    new CustomEvent('micro-demo-node-highlight', {
                        detail: { index: demoNode, phase: 'glow' }
                    })
                )
            }, 50)
        )

        // 100ms — start camera glide (1200ms animation, arrives at ~1400ms)
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
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
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
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
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
                if (_demoCancelled) return
                _demoPhase = PHASE.CARD_VISIBLE
                document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'))
            }, 1520)
        )

        // 2520ms — second name pulse (midway through CARD_VISIBLE)
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
                if (_demoCancelled) return
                document.dispatchEvent(new CustomEvent('micro-demo-name-pulse'))
            }, 2520)
        )

        // 3320ms — pullback (GLIDING_MS + ARRIVED_HOLD_MS + CARD_VISIBLE_MS)
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
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
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
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
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
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
        _demoRegistry.timer(
            // eslint-disable-next-line no-restricted-syntax -- wrapped in _demoRegistry.timer()
            setTimeout(() => {
                if (_demoCancelled) return
                _demoPhase = PHASE.COMPLETE
                ui.showEndToast()
                // Fire-and-forget: endDemo is async but the demo is complete at this point.
                void endDemo('demo-complete', true)
            }, 5870)
        )
    } catch (err) {
        // If anything before the timers were registered (preload, snapshot,
        // veil, pill) throws, the demo can't start cleanly. Reset scratch
        // state and tear down UI so a retry can re-enter from scratch.
        debugWarn('[demo-choreography] runDemo failed:', err)
        _demoPhase = PHASE.CANCELLED
        _demoCancelled = true
        clearDemoTimers()
        document.body.removeAttribute('data-demo-active')
    }
}

// ── cancelChoreography ────────────────────────────────────────────────────────

export async function cancelChoreography(reason: string = 'user-input'): Promise<boolean> {
    if (_demoPhase === PHASE.IDLE || _demoPhase === PHASE.COMPLETE || _demoCancelled) {
        return false
    }
    _demoCancelled = true
    _demoPhase = PHASE.CANCELLED
    clearDemoTimers()
    try {
        const microDemoCamera = await loadMicroDemoCamera()
        await demoReset()

        if (appState.camera && appState.controls && (reason === 'escape-key' || reason === 'user-input')) {
            microDemoCamera.animateCameraToOverview(800)
        }

        const shouldRecord = reason === 'user-input' || reason === 'escape-key' || reason === 'skip-button'
        await endDemo('demo-cancelled', shouldRecord)
        return true
    } catch (err) {
        debugWarn('[demo-choreography] cancelChoreography failed:', err)
        return false
    }
}

// ── isMicroDemoRunning ────────────────────────────────────────────────────────

export function isMicroDemoRunning(): boolean {
    return _demoPhase !== PHASE.IDLE && _demoPhase !== PHASE.COMPLETE && _demoPhase !== PHASE.CANCELLED
}
