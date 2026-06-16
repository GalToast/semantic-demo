/**
 * journey-canvas-interaction.ts — TypeScript shadow of journey-canvas-interaction.js
 * Canvas pointer event bindings for thread walking and field-node focus.
 */
import { state } from '@lib/engine/state-bridge'
import { isPointVisible } from './utils/geo-data.ts'
import { focusOnNode } from '@lib/engine/camera-choreography'
import { noteSceneInteraction } from '@lib/engine/camera-controls-restore-bridge'
import { releaseFocusCameraAssist } from '@lib/engine/camera-controls-core'
import {
    initJourneyCanvasInteractionAdapter,
    isThreadCandidateVisibleOnCanvas,
    canvasInteractionAdapter,
    getNearestCanvasThreadCandidate,
    getCanvasFieldNodeClickRadius
} from './journey-canvas-hit-test.ts'
import { findNearestCanvasFieldNode } from './journey-canvas-node-picking.ts'
import { clearCanvasFieldHover, setCanvasFieldHover } from './journey-canvas-hover.ts'

export { initJourneyCanvasInteractionAdapter, isThreadCandidateVisibleOnCanvas }

const CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS: number = 5200

/** AbortController shared by canvas interaction listeners for clean teardown. */
let _canvasInteractionAbort: AbortController | null = null

interface CanvasHoverCandidate {
    index?: number
    screenX?: number
    screenY?: number
    source?: string
    reason?: string
    [key: string]: unknown
}

export function ensureCanvasNodeInteractionBindings(): void {
    const canvas = (state.renderer as any)?.domElement as HTMLCanvasElement | undefined
    if (!canvas || (canvas.dataset as any).threadInteractionBound === 'true') return
    ;(canvas.dataset as any).threadInteractionBound = 'true'

    // Create a dedicated AbortController so all listeners can be removed in bulk.
    _canvasInteractionAbort = new AbortController()
    const signal = _canvasInteractionAbort.signal

    let suppressNextCanvasClick = false

    const isUiPointerTarget = (target: EventTarget | null): boolean =>
        !!(target as Element | null)?.closest?.(
            [
                'button',
                'a',
                'input',
                'textarea',
                'select',
                '.info-panel',
                '.focus-stage-card',
                '.summary-card',
                '.controls',
                '.view-toggle',
                '.journey-compass',
                '.legend-panel',
                '.weather-widget',
                '.share-toggle'
            ].join(',')
        )

    const isPrimaryPointerRelease = (event: PointerEvent | MouseEvent): boolean =>
        !Number.isFinite(event.button) || event.button <= 0

    const walkCanvasThreadFromPointerEvent = (event: PointerEvent | MouseEvent): boolean => {
        if ((state as any).currentView !== 'galaxy' || !Number.isFinite((state as any).navState.focusedIndex))
            return false
        let candidate: CanvasHoverCandidate | null = null
        const stable = (state as any).stableCanvasHover as CanvasHoverCandidate | null
        const stableIsThreadNeighbor =
            stable &&
            Number.isFinite(stable.index) &&
            stable.index !== (state as any).navState.focusedIndex &&
            isPointVisible(stable.index!, (state as any).points, null, (state as any).activeFilters) &&
            ((state as any).navState.threadCandidates || []).some((item: any) => item && item.index === stable.index)
        if (stableIsThreadNeighbor) {
            const stableDistance = Math.hypot(
                (stable!.screenX ?? (event as any).clientX) - (event as any).clientX,
                (stable!.screenY ?? (event as any).clientY) - (event as any).clientY
            )
            if (stableDistance <= 96) {
                const threadCandidate = ((state as any).navState.threadCandidates || []).find(
                    (item: any) => item && item.index === stable!.index
                )
                candidate = {
                    ...threadCandidate,
                    ...stable,
                    reason: threadCandidate?.reason || stable!.reason || 'hovered 3D related node',
                    source: stable!.source || 'stable-hover'
                }
            }
        }
        if (
            !candidate &&
            (document.body.dataset as any).threadInspectSurface === 'canvas' &&
            Number.isFinite((state as any).inspectedThreadIndex)
        ) {
            candidate = ((state as any).navState.threadCandidates || []).find(
                (item: any) => item && item.index === (state as any).inspectedThreadIndex
            ) || { index: (state as any).inspectedThreadIndex, reason: 'inspected 3D related node' }
        }
        if (!candidate) candidate = getNearestCanvasThreadCandidate(event as any, 96) as CanvasHoverCandidate | null
        if (!candidate) return false
        event.preventDefault()
        ;(state as any).lastCanvasNodePick = candidate
        ;(state as any).lastCanvasNodeFocusPick = candidate
        ;(canvasInteractionAdapter as any).walkThreadNeighbor(candidate.index!, {
            fromCanvasNode: true,
            surface: 'canvas',
            reason: candidate.reason || 'direct 3D related node'
        })
        return true
    }

    const focusCanvasFieldNodeFromPointerEvent = (event: PointerEvent | MouseEvent): boolean => {
        if ((state as any).currentView !== 'galaxy') return false
        const stable = (state as any).stableCanvasHover as CanvasHoverCandidate | null
        const stableIsValid =
            stable &&
            Number.isFinite(stable.index) &&
            isPointVisible(stable.index!, (state as any).points, null, (state as any).activeFilters)
        const candidate = stableIsValid
            ? { ...stable, source: (stable as any).source || 'stable-hover' }
            : findNearestCanvasFieldNode(event)
        if (!candidate) return false
        ;(state as any).lastCanvasNodePick = candidate
        ;(state as any).lastCanvasNodeFocusPick = candidate
        event.preventDefault()
        releaseFocusCameraAssist('field-click')
        noteSceneInteraction((state as any).AUTO_ROTATE_MANUAL_IDLE_MS)
        return focusOnNode((candidate as any).index, {
            fromCanvasNode: true,
            revealCard: true,
            historyMode: 'push'
        })
    }

    canvas.addEventListener(
        'pointermove',
        (event: PointerEvent) => {
            if ((state as any).currentView !== 'galaxy') {
                clearCanvasFieldHover(canvas)
                return
            }
            noteSceneInteraction((state as any).AUTO_ROTATE_MANUAL_IDLE_MS)
            if (Number.isFinite((state as any).navState.focusedIndex)) {
                const candidate = getNearestCanvasThreadCandidate(event)
                if (candidate) {
                    setCanvasFieldHover(candidate as any, canvas)
                    ;(canvasInteractionAdapter as any).inspectThreadNeighbor((candidate as any).index, {
                        surface: 'canvas'
                    })
                    return
                } else if ((document.body.dataset as any).threadInspectSurface === 'canvas') {
                    ;(canvasInteractionAdapter as any).scheduleCanvasThreadInspectionClear(
                        CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS
                    )
                }
            }
            const fieldCandidate = findNearestCanvasFieldNode(event, getCanvasFieldNodeClickRadius(event) + 4)
            setCanvasFieldHover(fieldCandidate as any, canvas)
        },
        { signal }
    )

    canvas.addEventListener(
        'pointerleave',
        () => {
            if ((document.body.dataset as any).threadInspectSurface === 'canvas') {
                ;(canvasInteractionAdapter as any).scheduleCanvasThreadInspectionClear(
                    CANVAS_THREAD_INSPECTION_CLEAR_DELAY_MS
                )
            }
            clearCanvasFieldHover(canvas, { force: true })
        },
        { signal }
    )

    canvas.addEventListener(
        'pointerup',
        (event: PointerEvent) => {
            if (isPrimaryPointerRelease(event) && walkCanvasThreadFromPointerEvent(event)) {
                suppressNextCanvasClick = true
            }
        },
        { signal }
    )

    canvas.addEventListener(
        'click',
        (event: MouseEvent) => {
            if (suppressNextCanvasClick) {
                suppressNextCanvasClick = false
                event.preventDefault()
                return
            }
            if (walkCanvasThreadFromPointerEvent(event)) return
            focusCanvasFieldNodeFromPointerEvent(event)
        },
        { signal }
    )

    if ((document.documentElement.dataset as any).canvasHoverDocumentClearBound !== 'true') {
        ;(document.documentElement.dataset as any).canvasHoverDocumentClearBound = 'true'
        document.addEventListener(
            'pointermove',
            (event: PointerEvent) => {
                const activeCanvas = (state as any).renderer?.domElement as HTMLCanvasElement | undefined
                if (
                    !activeCanvas ||
                    event.target === activeCanvas ||
                    activeCanvas.contains(event.target as Node | null)
                )
                    return
                if ((state as any).hoverHighlightIndex === -1 && !(state as any).stableCanvasHover) return
                clearCanvasFieldHover(activeCanvas, { force: true })
            },
            true
        )
    }

    if ((document.documentElement.dataset as any).threadCanvasDocumentWalkBound !== 'true') {
        ;(document.documentElement.dataset as any).threadCanvasDocumentWalkBound = 'true'
        document.addEventListener(
            'pointerup',
            (event: PointerEvent) => {
                if (!isPrimaryPointerRelease(event) || isUiPointerTarget(event.target)) return
                if (event.target === canvas) return
                if (walkCanvasThreadFromPointerEvent(event)) return
                focusCanvasFieldNodeFromPointerEvent(event)
            },
            true
        )
    }
}

/**
 * Remove all canvas node interaction bindings added by ensureCanvasNodeInteractionBindings().
 * Aborts the shared AbortController (which removes all canvas listeners registered with
 * the signal) and clears the guard flag so the next ensureCanvasNodeInteractionBindings()
 * call re-binds cleanly.
 */
export function removeCanvasNodeInteractionBindings(): void {
    if (_canvasInteractionAbort) {
        _canvasInteractionAbort.abort()
        _canvasInteractionAbort = null
    }
    const canvas = (state.renderer as any)?.domElement as HTMLCanvasElement | undefined
    if (canvas) {
        ;(canvas.dataset as any).threadInteractionBound = 'false'
    }
}
