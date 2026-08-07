/**
 * @lib/journey/thread-inspector-render.ts — Thread inspection DOM rendering
 *
 * Split from thread-inspector.ts (Wave70). Contains ONLY renderThreadInspection
 * and its pointer-guard / surface-event-guard helpers. Imports state types and
 * scheduleCanvasThreadInspectionClear from the state module (circular reference
 * resolved at call time in ESM).
 */

import { appState } from '@lib/state/app.svelte.ts'
import { getFocusedIndex } from '@lib/stores/index.svelte.ts'
import { updateThreadInspector } from '@lib/stores/focus.svelte.ts'
import {
    syncInspectedStrandOverlay,
    updateInspectedStrandOverlay,
    setInspectedStrandOverlayUpdater
} from '@lib/engine/journey-webgl-lazy'

// Circular import — resolved at call time in ESM; state functions call
// renderThreadInspection back.
import {
    getThreadInspectionState,
    scheduleCanvasThreadInspectionClear
} from './thread-inspector-state'
import type { InspectorElement, ThreadInspectionOptions, ThreadInspectionState } from './thread-inspector-state'

// Register the WebGL update callback
setInspectedStrandOverlayUpdater(updateInspectedStrandOverlay)

// Tracks the DOM element the pointer-guard listeners are currently bound to.
// renderThreadInspection is called from ~6 call sites per render; the old code
// removed + re-added the listeners on every call, and because the cleanup also
// deleted the `pointerGuardBound` dataset flag, the re-bind path always ran
// (2× remove + 2× add per render). Binding once per element identity kills the
// churn.
let lastPointerGuardElement: InspectorElement | null = null

export function renderThreadInspection(
    index: number | null = appState.focusState.inspectedThreadIndex,
    options: ThreadInspectionOptions = {}
): ThreadInspectionState | null {
    const inspector = document.getElementById('focus-thread-inspector') as InspectorElement | null
    const inspectionState = getThreadInspectionState(index, options)
    // syncInspectedStrandOverlay's underlying impl handles null gracefully
    // (it short-circuits via `inspectionState?.active`). Cast through
    // `unknown` because ThreadInspectionState has fields beyond the
    // narrower InspectionState that the function expects; this is a
    // type-safe equivalent of the prior `as any` cast.
    syncInspectedStrandOverlay(inspectionState as unknown as Parameters<typeof syncInspectedStrandOverlay>[0], {
        surface: options.surface ?? undefined
    })

    // NOTE: body.dataset.threadInspectSurface write removed — parity-attrs.svelte.ts
    // derives it from focus.threadInspector.active + source. updateThreadInspector()
    // below sets focus.threadInspector.source, so the mirror produces the same value.

    // Notify Svelte focus store reactively
    updateThreadInspector({
        active: !!inspectionState?.active,
        source: options.surface || 'none',
        inspectedIndex: index,
        pinnedIndex: appState.focusState.pinnedThreadIndex,
        pointerInside: appState.focusState.threadInspectorPointerInside,
        segmentCount: inspectionState?.strandVisual.segmentCount || 0,
        braidCount: inspectionState?.strandVisual.braidCount || 0,
        endpointCount: inspectionState?.strandVisual.endpointCount || 0
    })

    if (!inspector) return inspectionState

    // Clean up pointer guards — but ONLY when the bound element changes.
    // The inspector node is a stable singleton (getElementById of the same
    // id), so on every subsequent render we skip the remove/re-add churn
    // entirely.
    const inspectorEl = inspector as HTMLElement & {
        _pointerEnterListener?: ((e: PointerEvent) => void) | null
        _pointerLeaveListener?: ((e: PointerEvent) => void) | null
    }
    if (inspector !== lastPointerGuardElement) {
        const prevBound = lastPointerGuardElement
        if (prevBound) {
            prevBound.removeEventListener('pointerenter', prevBound._pointerEnterListener!)
            prevBound.removeEventListener('pointerleave', prevBound._pointerLeaveListener!)
            delete prevBound._pointerEnterListener
            delete prevBound._pointerLeaveListener
            delete prevBound.dataset.pointerGuardBound
        }
        lastPointerGuardElement = inspector

        inspector.dataset.pointerGuardBound = 'true'
        const pointerEnter = (): void => {
            appState.focusState.threadInspectorPointerInside = true
            const clearTimerId = appState.canvasThreadInspectionClearTimer
            if (clearTimerId) {
                window.clearTimeout(clearTimerId)
                {
                    appState.canvasThreadInspectionClearTimer = null
                }
            }
        }
        const pointerLeave = (): void => {
            appState.focusState.threadInspectorPointerInside = false
            if (
                typeof document !== 'undefined' &&
                document.body.dataset.threadInspectSurface === 'canvas' &&
                appState.focusState.pinnedThreadIndex === null
            ) {
                scheduleCanvasThreadInspectionClear(1800)
            }
        }
        inspectorEl._pointerEnterListener = pointerEnter
        inspectorEl._pointerLeaveListener = pointerLeave
        inspector.addEventListener('pointerenter', pointerEnter)
        inspector.addEventListener('pointerleave', pointerLeave)
    }

    if (!inspector.dataset.surfaceEventGuardBound) {
        inspector.dataset.surfaceEventGuardBound = 'true'
        const stopSurfaceEvent = (event: Event): void => {
            event.stopPropagation()
            event.stopImmediatePropagation?.()
        }
        for (const eventName of [
            'pointerdown',
            'pointerup',
            'mousedown',
            'mouseup',
            'click',
            'touchstart',
            'touchend'
        ]) {
            inspector.addEventListener(eventName, stopSurfaceEvent)
        }
    }

    if (inspectionState?.active && appState.canvasThreadInspectionClearTimer) {
        window.clearTimeout(appState.canvasThreadInspectionClearTimer)
        {
            appState.canvasThreadInspectionClearTimer = null
        }
    }

    inspector.classList.toggle('active', !!inspectionState?.active)
    inspector.classList.toggle('from-canvas', !!inspectionState?.active && inspectionState.surface === 'canvas')
    inspector.classList.toggle('is-pinned', !!inspectionState?.pinned)

    if (inspectionState?.active && inspectionState.relationshipRole) {
        inspector.dataset.relationshipRole = inspectionState.relationshipRole
    } else {
        delete inspector.dataset.relationshipRole
    }
    inspector.setAttribute('aria-hidden', inspectionState?.active ? 'false' : 'true')

    const titleEl = document.getElementById('focus-thread-inspector-title')
    const copyEl = document.getElementById('focus-thread-inspector-copy')
    const metaEl = document.getElementById('focus-thread-inspector-meta')
    const pinBtn = document.getElementById('btn-thread-pin') as HTMLButtonElement | null
    const followBtn = document.getElementById('btn-thread-follow') as HTMLButtonElement | null
    const clearBtn = document.getElementById('btn-thread-clear') as HTMLButtonElement | null

    if (titleEl) titleEl.textContent = inspectionState?.title ?? null
    if (copyEl) {
        // aria-live so screen readers announce thread changes (the panel only
        // sets aria-hidden=true when inactive, and the copy is replaced
        // wholesale — aria-atomic matches the MapSummary.svelte live-region
        // convention so the full new copy is announced).
        copyEl.setAttribute('aria-live', 'polite')
        copyEl.setAttribute('aria-atomic', 'true')
        copyEl.textContent = inspectionState?.copy ?? null
    }
    if (metaEl) metaEl.textContent = inspectionState?.meta ?? null

    // PR-T2: button textContent is owned by the Svelte component
    // (ThreadInspector.svelte), which renders the same logic via
    // {@const pinText/followText} derived from focusStore +
    // viewport.isCompact + strandContinuityPhase. The previous version
    // overwrote the Svelte-rendered text imperatively, which produced
    // a brief flash of the static 'Pin/Follow/Clear' before the
    // 'Pin Connection/Follow Connection/Current/Following' text landed.
    // The Svelte component now renders the correct text from the
    // initial paint, so this renderer only updates attributes that
    // Svelte can't easily derive (disabled, aria-pressed, aria-label,
    // aria-disabled, aria-busy).
    if (pinBtn) {
        pinBtn.disabled = !inspectionState?.active
        pinBtn.setAttribute('aria-pressed', String(!!inspectionState?.pinned))
    }
    if (followBtn) {
        const followTargetsCurrent =
            !!inspectionState?.active &&
            Number.isFinite(inspectionState?.index) &&
            inspectionState?.index === getFocusedIndex()
        followBtn.disabled =
            !inspectionState?.active || !!followTargetsCurrent || inspectionState?.journeyPhase === 'exploring'
        followBtn.setAttribute('aria-disabled', String(followBtn.disabled))
        followBtn.setAttribute('aria-busy', String(inspectionState?.journeyPhase === 'exploring'))
        followBtn.setAttribute(
            'aria-label',
            inspectionState?.journeyPhase === 'exploring'
                ? 'Following this connection'
                : followTargetsCurrent
                  ? 'This connection is the current path stop'
                  : 'Follow this connection as the next path stop'
        )
    }
    if (clearBtn) {
        clearBtn.disabled = !inspectionState?.active && appState.focusState.pinnedThreadIndex === null
        clearBtn.setAttribute('aria-disabled', String(clearBtn.disabled))
        clearBtn.setAttribute(
            'aria-label',
            appState.focusState.pinnedThreadIndex !== null ? 'Clear pinned connection' : 'Clear connection preview'
        )
    }

    if (typeof document !== 'undefined') {
        document
            .querySelectorAll<HTMLElement>('.focus-stage-neighbor-pill.is-inspected')
            .forEach((item) => item.classList.remove('is-inspected'))
        document
            .querySelectorAll<HTMLElement>('.focus-stage-neighbor-pill.is-pinned')
            .forEach((item) => item.classList.remove('is-pinned'))
        document
            .querySelectorAll<HTMLElement>('.focus-stage-neighbor-pill.is-exploring')
            .forEach((item) => item.classList.remove('is-exploring'))
        if (inspectionState?.active) {
            const railItem = document.querySelector<HTMLElement>(
                `.focus-stage-neighbor-pill[data-index="${inspectionState.index}"]`
            )
            railItem?.classList.add('is-inspected')
            railItem?.classList.toggle('is-pinned', inspectionState.pinned)
            railItem?.classList.toggle('is-exploring', inspectionState.journeyPhase === 'exploring')
        }
    }
    return inspectionState
}
