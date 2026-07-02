/**
 * @lib/journey/canvas-interaction.ts — Canvas pointer event bindings for thread walking and field-node focus
 *
 * Port of
 *
 * Re-exports core adapters from extracted modules and owns canvas DOM event binding lifecycle.
 */
import { appState } from '@lib/state/app.svelte'
import { focusOnNode as _focusOnNode, noteSceneInteraction, releaseFocusCameraAssist } from '@lib/engine/camera-controls'
import {
    initJourneyCanvasInteractionAdapter,
    isThreadCandidateVisibleOnCanvas,
    canvasInteractionAdapter,
    getCanvasFieldNodeClickRadius
} from './canvas-hit-test'
import { findNearestCanvasFieldNode } from './canvas-node-picking'
import { clearCanvasFieldHover, setCanvasFieldHover } from './canvas-hover'
import type { HoverCandidate } from './canvas-hover'
import { showExperienceToast } from '@lib/orchestration/toast'
import { prefersReducedMotion } from '@lib/utils/environment'

// F3: Track whether the empty-click hint has been shown this session so
// users aren't spammed with toasts.
let _emptyClickHintShown = false

// Drag detection state for orbit cursor feedback
let _dragState: { startX: number; startY: number; isDragging: boolean } | null = null
const DRAG_THRESHOLD_PX = 4

function setCanvasDragCursor(canvas: HTMLCanvasElement, isDragging: boolean): void {
    canvas.style.cursor = isDragging ? 'grabbing' : ''
}

/** Show a brief pulse ring at the click position to confirm node selection. */
function showClickPulse(x: number, y: number): void {
    if (prefersReducedMotion()) return
    const pulse = document.createElement('div')
    pulse.className = 'click-pulse-ring'
    pulse.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        width: 8px; height: 8px; margin: -4px 0 0 -4px;
        border-radius: 50%; pointer-events: none; z-index: 9998;
        border: 2px solid rgba(78, 205, 196, 0.8);
        box-shadow: 0 0 8px rgba(78, 205, 196, 0.4);
    `
    document.body.appendChild(pulse)
    requestAnimationFrame(() => {
        pulse.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out'
        pulse.style.transform = 'scale(6)'
        pulse.style.opacity = '0'
    })
    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
    setTimeout(() => pulse.remove(), 550)
}

export { initJourneyCanvasInteractionAdapter, isThreadCandidateVisibleOnCanvas }

/** AbortController shared by canvas interaction listeners for clean teardown. */
let _canvasInteractionAbort: AbortController | null = null

export function ensureCanvasNodeInteractionBindings(): void {
    const canvas = appState.renderer?.domElement
    if (!canvas || canvas.dataset.threadInteractionBound === 'true') return
    canvas.dataset.threadInteractionBound = 'true'

    _canvasInteractionAbort = new AbortController()
    const signal = _canvasInteractionAbort.signal

    canvas.addEventListener(
        'pointermove',
        (ev) => {
            const pointer = ev as PointerEvent
            const radius = getCanvasFieldNodeClickRadius(pointer)
            const candidate = findNearestCanvasFieldNode(pointer, radius)
            if (candidate?.index != null && Number.isFinite(candidate.index)) {
                setCanvasFieldHover(
                    {
                        index: candidate.index,
                        screenX: candidate.screenX,
                        screenY: candidate.screenY,
                        source: candidate.source,
                        reason: candidate.source || ''
                    } satisfies HoverCandidate,
                    canvas
                )
                noteSceneInteraction()
                releaseFocusCameraAssist('canvasHover')
                if (isThreadCandidateVisibleOnCanvas(candidate.index)) {
                    const { walkThreadNeighbor, inspectThreadNeighbor } = canvasInteractionAdapter
                    const threadOk = walkThreadNeighbor(candidate.index, { force: true })
                    if (threadOk) {
                        inspectThreadNeighbor(candidate.index)
                    }
                }
            } else {
                clearCanvasFieldHover(canvas)
            }
        },
        { signal, passive: true }
    )

    canvas.addEventListener(
        'pointerout',
        () => {
            clearCanvasFieldHover(canvas)
        },
        { signal, passive: true }
    )

    canvas.addEventListener(
        'click',
        (ev) => {
            const pointer = ev as PointerEvent
            const radius = getCanvasFieldNodeClickRadius(pointer)
            const candidate = findNearestCanvasFieldNode(pointer, radius)
            if (candidate?.index != null && Number.isFinite(candidate.index)) {
                showClickPulse(pointer.clientX, pointer.clientY)
                const { walkThreadNeighbor, summarizeNeighborReason } = canvasInteractionAdapter
                // walkThreadNeighbor sets up thread state and internally calls
                // focusOnNode for galaxy view. It returns WalkResult|null but
                // always performs the navigation work.
                walkThreadNeighbor(candidate.index, { force: true, fromCanvasNode: true })
                const reason = summarizeNeighborReason(candidate as unknown as Record<string, unknown>)
                setCanvasFieldHover(
                    {
                        index: candidate.index,
                        screenX: candidate.screenX,
                        screenY: candidate.screenY,
                        source: candidate.source,
                        reason: reason || candidate.source || ''
                    } satisfies HoverCandidate,
                    canvas
                )
                noteSceneInteraction()
                releaseFocusCameraAssist('canvasHover')
            } else if (!_emptyClickHintShown) {
                // F3: First empty-space click → gentle hint to guide the user
                _emptyClickHintShown = true
                showExperienceToast('Explore the mycelium', 'Tap a glowing node to focus on a business.')
            }
            ev.preventDefault()
        },
        { signal }
    )

    // ── Orbit drag cursor feedback ───────────────────────────────────────
    canvas.addEventListener(
        'pointerdown',
        (ev) => {
            _dragState = { startX: ev.clientX, startY: ev.clientY, isDragging: false }
        },
        { signal, passive: true }
    )

    canvas.addEventListener(
        'pointermove',
        (ev) => {
            if (!_dragState) return
            const dx = ev.clientX - _dragState.startX
            const dy = ev.clientY - _dragState.startY
            if (!_dragState.isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
                _dragState.isDragging = true
                setCanvasDragCursor(canvas, true)
            }
        },
        { signal, passive: true }
    )

    const endDrag = () => {
        if (_dragState?.isDragging) {
            setCanvasDragCursor(canvas, false)
        }
        _dragState = null
    }

    canvas.addEventListener('pointerup', endDrag, { signal, passive: true })
    canvas.addEventListener('pointercancel', endDrag, { signal, passive: true })
    window.addEventListener('pointerup', endDrag, { signal, passive: true })
}

export function disposeCanvasNodeInteractionBindings(): void {
    if (_canvasInteractionAbort) {
        _canvasInteractionAbort.abort()
        _canvasInteractionAbort = null
    }
    const canvas = appState.renderer?.domElement
    if (canvas) {
        delete canvas.dataset.threadInteractionBound
    }
}
