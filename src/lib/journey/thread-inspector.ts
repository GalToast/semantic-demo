/**
 * @lib/journey/thread-inspector.ts — Thread inspection overlay management
 *
 * Ported from: js/modules/thread-inspector.ts
 */

import { get } from 'svelte/store'
import { appState } from '@lib/state/app.svelte.ts'
import { getBusinessRecords, getFocusedIndex } from '@lib/stores/index.svelte.ts'
import { focusStore, updateThreadInspector } from '@lib/stores/focus.svelte.ts'
import { formatBusinessName, stripTerminalPunctuation } from '@lib/utils/dom-formatters'
import { getRelationshipRoleLabel, normalizeRelationshipRole } from '@lib/utils/relationship-roles'
import { truncateMicrocopy } from '@lib/journey/text-helpers'
import {
    getGeometricThreadCandidates,
    getSemanticThreadCandidates,
    getThreadCandidatesForIndex
} from '@lib/journey/thread-model'
import { setStrandContinuityState, clearStrandContinuityState } from '@lib/utils/strand-continuity'
import type { ThreadCandidateRef } from '@lib/types/state'
import {
    syncInspectedStrandOverlay,
    updateInspectedStrandOverlay,
    disposeInspectedStrandOverlay,
    setInspectedStrandOverlayUpdater
} from '@lib/engine/journey-webgl-lazy'
import { focusOnNode } from '@lib/engine/camera-controls'
import { focusOnPoint } from '@lib/orchestration/lifecycle'
import { syncFocusStage } from '@lib/journey/selected-card'
import { syncSemanticDiveUi } from '@lib/journey/semantic-dive'
import { updateJourneyCompass } from '@lib/orchestration/compass-controller'
import { showExperienceToast } from '@lib/orchestration/toast'
import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts'
import {
    summarizeNeighborReason,
    getInsideRelationshipLabel,
    setTimer,
    clearTimer,
    cancelAllThreadTimers,
    getStrandArrivalNote
} from '@lib/journey/thread-settler'
import { subscribe, EVENTS } from '@lib/orchestration/event-bus'
import { appState as legacyState } from '@lib/state/app.svelte'
import { withStateMutation } from '@lib/state/with-state-mutation'

// Register the WebGL update callback
setInspectedStrandOverlayUpdater(updateInspectedStrandOverlay)

// ── Types ──────────────────────────────────────────────────────────────────

export interface ThreadInspectionState {
    active: boolean
    index: number | null
    focusedIndex: number | null
    focusName: string
    targetName: string
    reason: string
    relationshipRole: string
    relationshipTitle: string
    role: string
    source: string
    pinned: boolean
    journeyPhase: string
    surface: string | null
    title: string
    copy: string
    meta: string
    strandVisual: {
        active: boolean
        source: string
        segmentCount: number
        braidCount: number
        endpointCount: number
    }
    threadSource: string | null
}

export interface ThreadInspectionOptions {
    force?: boolean
    preserveJourney?: boolean
    surface?: string | null
    pinned?: boolean
    fromIndex?: number | null
    reason?: string
    arrivalDelay?: number
    settleDelay?: number
    fromCanvasNode?: boolean
    restoreHistory?: boolean
}

// ── Event bus subscriptions ──────────────────────────────────────────────────

subscribe(EVENTS.CAMERA_NODE_FOCUSED, (payload: Record<string, unknown>) => {
    clearThreadInspection({
        force: true,
        preserveJourney: !!(payload.options as Record<string, unknown>)?.fromTraversal
    })
})

let clearingThreadInspection = false

// ── Core functions ───────────────────────────────────────────────────────────

export function getThreadInspectionState(
    index: number | null = appState.inspectedThreadIndex,
    options: ThreadInspectionOptions = {}
): ThreadInspectionState | null {
    const pts = getBusinessRecords()
    if (!pts || pts.length === 0) return null
    const focusedIndex = getFocusedIndex()
    const focusPoint =
        focusedIndex !== null && focusedIndex >= 0 && focusedIndex < pts.length ? pts[focusedIndex] : null

    const candidate = Number.isFinite(index)
        ? (appState.navState.threadCandidates as ThreadCandidateRef[])?.find(
              (item) => item && (typeof item === 'number' ? item === index : item.index === index)
          )
        : null
    const candidateIndex =
        candidate && typeof candidate === 'object' ? candidate.index : typeof candidate === 'number' ? candidate : null
    const point =
        candidateIndex !== null && candidateIndex >= 0 && candidateIndex < pts.length ? pts[candidateIndex] : null

    const active = !!(candidate && point && focusPoint)
    const focusName = focusPoint ? formatBusinessName(focusPoint.name || 'this business') : ''
    const targetName = point ? formatBusinessName(point.name || 'nearby stop') : ''

    const candidateObj = candidate && typeof candidate === 'object' ? candidate : { index: candidateIndex ?? undefined }
    const reason = active ? summarizeNeighborReason(candidateObj, point, focusPoint) : ''
    const relationshipRole = active ? normalizeRelationshipRole(candidateObj.relationshipRole) : ''
    const relationshipTitle = active && relationshipRole ? getRelationshipRoleLabel(relationshipRole, 'title') : ''
    const role = active
        ? (appState.navState.focusPocketRoleByIndex instanceof Map
              ? appState.navState.focusPocketRoleByIndex.get(candidateIndex!)
              : undefined) ||
          candidateObj.role ||
          'trail'
        : ''
    const source = active
        ? candidateObj.source === 'semantic' || appState.navState.threadSource === 'semantic'
            ? 'semantic relationship'
            : 'current cloud fallback'
        : ''
    const title = active ? `${focusName} -> ${targetName}` : 'Select a nearby stop'
    const pinned = active && appState.pinnedThreadIndex === candidateIndex
    const journeyPhase =
        active && appState.strandContinuityState.targetIndex === candidateIndex
            ? appState.strandContinuityState.phase
            : pinned
              ? 'pinned'
              : active
                ? 'preview'
                : 'idle'
    const cleanReason = stripTerminalPunctuation(reason)
    const displayReason =
        active && reason.includes('...') ? getInsideRelationshipLabel(candidateObj, point, focusPoint) : cleanReason
    const rawCopy = active
        ? journeyPhase === 'exploring'
            ? `${displayReason}. Following this connection into the next neighborhood.`
            : journeyPhase === 'arrived'
              ? `${displayReason}. You arrived through this connection; inspect another connection or backtrack to compare.`
              : pinned
                ? `${displayReason}. This connection is pinned for comparison; follow it, keep it pinned, or clear it.`
                : `${displayReason}. Preview the relationship, pin it for comparison, or follow it to the next stop.`
        : 'Click a neighbor below to preview why it belongs here, then pin or follow.'
    const copy = truncateMicrocopy(rawCopy, 220)
    const meta = active
        ? `${relationshipTitle || 'Connection'} | ${source} | ${journeyPhase} connection`
        : 'Preview connection'
    const rawSurface = pinned
        ? 'pinned'
        : options.surface ||
          (typeof document !== 'undefined' ? document.body.dataset.threadInspectSurface : null) ||
          null
    const surface = active && rawSurface && rawSurface !== 'idle' ? rawSurface : active ? 'rail' : rawSurface
    return {
        active,
        index: active ? candidateIndex : null,
        focusedIndex,
        focusName,
        targetName,
        reason,
        relationshipRole,
        relationshipTitle,
        role,
        source,
        pinned,
        journeyPhase,
        surface,
        title,
        copy,
        meta,
        strandVisual: {
            active: !!appState.inspectedStrandDiagnostics.active,
            source: appState.inspectedStrandDiagnostics.source || 'none',
            segmentCount: appState.inspectedStrandDiagnostics.segmentCount || 0,
            braidCount: appState.inspectedStrandDiagnostics.braidCount || 0,
            endpointCount: appState.inspectedStrandDiagnostics.endpointCount || 0
        },
        threadSource: appState.navState.threadSource || null
    }
}

export function renderThreadInspection(
    index: number | null = appState.inspectedThreadIndex,
    options: ThreadInspectionOptions = {}
): ThreadInspectionState | null {
    const inspector = document.getElementById('focus-thread-inspector')
    const inspectionState = getThreadInspectionState(index, options)
    // syncInspectedStrandOverlay's underlying impl handles null gracefully
    // (it short-circuits via `inspectionState?.active`). Cast through
    // `unknown` because ThreadInspectionState has fields beyond the
    // narrower InspectionState that the function expects; this is a
    // type-safe equivalent of the prior `as any` cast.
    syncInspectedStrandOverlay(
        inspectionState as unknown as Parameters<typeof syncInspectedStrandOverlay>[0],
        { surface: options.surface ?? undefined }
    )

    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.threadInspectSurface = inspectionState?.active
            ? inspectionState.surface || options.surface || 'rail'
            : 'idle'
    }

    // Notify Svelte focus store reactively
    updateThreadInspector({
        active: !!inspectionState?.active,
        source: options.surface || 'none',
        inspectedIndex: index,
        pinnedIndex: appState.pinnedThreadIndex,
        pointerInside: appState.threadInspectorPointerInside,
        segmentCount: inspectionState?.strandVisual.segmentCount || 0,
        braidCount: inspectionState?.strandVisual.braidCount || 0,
        endpointCount: inspectionState?.strandVisual.endpointCount || 0
    })

    if (!inspector) return inspectionState

    // Clean up pointer guards
    if ((inspector as any)._pointerEnterListener) {
        inspector.removeEventListener('pointerenter', (inspector as any)._pointerEnterListener)
        inspector.removeEventListener('pointerleave', (inspector as any)._pointerLeaveListener)
        delete (inspector as any)._pointerEnterListener
        delete (inspector as any)._pointerLeaveListener
        delete inspector.dataset.pointerGuardBound
    }

    if (!inspector.dataset.pointerGuardBound) {
        inspector.dataset.pointerGuardBound = 'true'
        const pointerEnter = (): void => {
            appState.threadInspectorPointerInside = true
            const clearTimerId = appState.canvasThreadInspectionClearTimer
            if (clearTimerId) {
                window.clearTimeout(clearTimerId)
                withStateMutation(() => {
                    ;(legacyState as any).canvasThreadInspectionClearTimer = null
                })
                appState.canvasThreadInspectionClearTimer = null
            }
        }
        const pointerLeave = (): void => {
            appState.threadInspectorPointerInside = false
            if (
                typeof document !== 'undefined' &&
                document.body.dataset.threadInspectSurface === 'canvas' &&
                appState.pinnedThreadIndex === null
            ) {
                scheduleCanvasThreadInspectionClear(1800)
            }
        }
        ;(inspector as any)._pointerEnterListener = pointerEnter
        ;(inspector as any)._pointerLeaveListener = pointerLeave
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
        withStateMutation(() => {
            ;(legacyState as any).canvasThreadInspectionClearTimer = null
        })
        appState.canvasThreadInspectionClearTimer = null
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
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

    if (titleEl) titleEl.textContent = inspectionState?.title ?? null
    if (copyEl) copyEl.textContent = inspectionState?.copy ?? null
    if (metaEl) metaEl.textContent = inspectionState?.meta ?? null

    if (pinBtn) {
        pinBtn.disabled = !inspectionState?.active
        pinBtn.textContent = inspectionState?.pinned
            ? isMobile
                ? 'Unpin'
                : 'Unpin Connection'
            : isMobile
              ? 'Pin'
              : 'Pin Connection'
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
        followBtn.textContent =
            inspectionState?.journeyPhase === 'exploring'
                ? 'Following'
                : followTargetsCurrent
                  ? isMobile
                      ? 'Current'
                      : 'Current Stop'
                  : isMobile
                    ? 'Follow'
                    : 'Follow Connection'
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
        clearBtn.disabled = !inspectionState?.active && appState.pinnedThreadIndex === null
        clearBtn.setAttribute('aria-disabled', String(clearBtn.disabled))
        clearBtn.setAttribute(
            'aria-label',
            appState.pinnedThreadIndex !== null ? 'Clear pinned connection' : 'Clear connection preview'
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

export function inspectThreadNeighbor(
    index: number,
    options: ThreadInspectionOptions = {}
): ThreadInspectionState | null {
    if (appState.pinnedThreadIndex !== null && !options.force) {
        return renderThreadInspection(appState.pinnedThreadIndex, { surface: 'pinned', pinned: true })
    }
    appState.inspectedThreadIndex = Number.isFinite(index) ? index : null
    focusStore.update((s) => ({
        ...s,
        inspectedStrandIndex: appState.inspectedThreadIndex,
        pinnedThreadIndex: appState.pinnedThreadIndex,
        threadInspector: {
            ...s.threadInspector,
            inspectedIndex: appState.inspectedThreadIndex,
            pinnedIndex: appState.pinnedThreadIndex,
            active: appState.inspectedThreadIndex !== null
        }
    }))
    if (Number.isFinite(appState.inspectedThreadIndex) && !options.preserveJourney) {
        setStrandContinuityState('preview', {
            targetIndex: appState.inspectedThreadIndex,
            fromIndex: getFocusedIndex(),
            reason: options.surface || 'inspect'
        })
    }
    return renderThreadInspection(appState.inspectedThreadIndex, options)
}

/**
 * Pins a neighbor of the focused node for comparison in the thread inspector.
 *
 * **Contract:** `index` MUST refer to a *neighbor* of the currently focused node,
 * NOT the focused node itself. A thread is a connection between the focus and a
 * neighbor — pinning the focused node produces no thread strand and is rejected.
 *
 * @param index - The neighbor index to pin. Must differ from the focused index.
 * @param options - Optional pinning options (surface, reason, etc.)
 * @returns The resulting ThreadInspectionState, or a rejected state with
 *          `active:false, pinned:false` when `index === focusedIndex`.
 */
export function pinThreadNeighbor(index: number, options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    if (!Number.isFinite(index)) return clearThreadInspection({ force: true })

    // Guard: pinning the focused node itself produces no thread strand.
    const focusedIndex = getFocusedIndex()
    if (index === focusedIndex) {
        return {
            active: false,
            index: null,
            focusedIndex,
            focusName: '',
            targetName: '',
            reason: 'Cannot pin the focused node itself; pass a neighbor index.',
            relationshipRole: '',
            relationshipTitle: '',
            role: '',
            source: '',
            pinned: false,
            journeyPhase: 'idle',
            surface: null,
            title: 'Connection Inspector',
            copy: 'Select a nearby stop to preview why it belongs here, then pin or follow.',
            meta: 'Preview connection',
            strandVisual: { active: false, source: 'none', segmentCount: 0, braidCount: 0, endpointCount: 0 },
            threadSource: null
        }
    }

    if (appState.canvasThreadInspectionClearTimer) {
        window.clearTimeout(appState.canvasThreadInspectionClearTimer)
        withStateMutation(() => {
            ;(legacyState as any).canvasThreadInspectionClearTimer = null
        })
        appState.canvasThreadInspectionClearTimer = null
    }

    appState.pinnedThreadIndex = index
    appState.inspectedThreadIndex = index
    focusStore.update((s) => ({
        ...s,
        inspectedStrandIndex: index,
        pinnedThreadIndex: index,
        threadInspector: {
            ...s.threadInspector,
            inspectedIndex: index,
            pinnedIndex: index,
            active: true
        }
    }))
    setStrandContinuityState('pinned', {
        targetIndex: index,
        fromIndex: getFocusedIndex(),
        reason: options.reason || 'pin'
    })
    const inspectionState = renderThreadInspection(index, { ...options, surface: 'pinned', pinned: true })
    syncSemanticDiveUi()
    return inspectionState
}

/**
 * Pins the first available neighbor of the focused node for thread inspection.
 *
 * Picks a real neighbor from the focus pocket / thread-candidate list that is
 * NOT the focused node itself. This avoids the "mounted-but-invisible"
 * anti-guard where `pinThreadNeighbor(<focusedIndex>)` returns active:false.
 *
 * @param options - Optional pinning options (surface, reason, etc.)
 * @returns The resulting ThreadInspectionState, or null if no valid neighbor
 *          is available to pin.
 */
export function pinFirstAvailableNeighbor(options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    const focusedIndex = getFocusedIndex()
    if (focusedIndex === null || !Number.isFinite(focusedIndex)) return null

    // Prefer thread candidates (semantic/geometric neighbors) — these are
    // the actual connection targets for the inspector.
    const candidates = appState.navState.threadCandidates as ThreadCandidateRef[]
    if (Array.isArray(candidates)) {
        for (const entry of candidates) {
            const idx = entry && typeof entry === 'object' ? entry.index : entry
            if (Number.isFinite(idx) && idx !== focusedIndex) {
                return pinThreadNeighbor(idx, { ...options, reason: options.reason || 'pinFirstAvailable' })
            }
        }
    }

    // Fall back to focus-pocket indices if thread candidates are empty.
    const pocket = appState.navState.focusPocketIndices
    if (Array.isArray(pocket)) {
        for (const idx of pocket) {
            if (Number.isFinite(idx) && idx !== focusedIndex) {
                return pinThreadNeighbor(idx, { ...options, reason: options.reason || 'pinFirstAvailable' })
            }
        }
    }

    return null
}

export function unpinThreadInspection(): ThreadInspectionState | null {
    if (appState.canvasThreadInspectionClearTimer) {
        window.clearTimeout(appState.canvasThreadInspectionClearTimer)
        withStateMutation(() => {
            ;(legacyState as any).canvasThreadInspectionClearTimer = null
        })
        appState.canvasThreadInspectionClearTimer = null
    }
    appState.pinnedThreadIndex = null
    appState.inspectedThreadIndex = null
    focusStore.update((s) => ({
        ...s,
        inspectedStrandIndex: null,
        pinnedThreadIndex: null,
        threadInspector: { ...s.threadInspector, active: false }
    }))
    clearStrandContinuityState('unpin')
    clearTimer('arrival')
    clearTimer('settle')
    const inspectionState = renderThreadInspection(null, { surface: 'idle', force: true })
    syncSemanticDiveUi()
    return inspectionState
}

export function scheduleCanvasThreadInspectionClear(delay: number = 1800): void {
    if (appState.canvasThreadInspectionClearTimer) {
        window.clearTimeout(appState.canvasThreadInspectionClearTimer)
    }

    const id = window.setTimeout(() => {
        appState.canvasThreadInspectionClearTimer = null
        if (appState.threadInspectorPointerInside || appState.pinnedThreadIndex !== null) return
        if (typeof document !== 'undefined' && document.body.dataset.threadInspectSurface === 'canvas') {
            clearThreadInspection()
        }
    }, delay)
    appState.canvasThreadInspectionClearTimer = id
}

export function clearThreadInspection(options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    if (clearingThreadInspection) {
        appState.pinnedThreadIndex = null
        appState.inspectedThreadIndex = null
        appState.threadInspectorPointerInside = false
        focusStore.update((s) => ({
            ...s,
            inspectedStrandIndex: null,
            pinnedThreadIndex: null,
            threadInspector: { ...s.threadInspector, active: false }
        }))
        return renderThreadInspection(null, { surface: 'idle' })
    }
    clearingThreadInspection = true
    try {
        if (options.force && appState.canvasThreadInspectionClearTimer) {
            window.clearTimeout(appState.canvasThreadInspectionClearTimer)
            withStateMutation(() => {
                ;(legacyState as any).canvasThreadInspectionClearTimer = null
            })
            appState.canvasThreadInspectionClearTimer = null
        }
        if (options.force) {
            appState.pinnedThreadIndex = null
            appState.inspectedThreadIndex = null
            appState.threadInspectorPointerInside = false
            focusStore.update((s) => ({
                ...s,
                inspectedStrandIndex: null,
                pinnedThreadIndex: null,
                threadInspector: { ...s.threadInspector, active: false }
            }))
            syncFocusStage(appState.selectedPoint)
            syncSemanticDiveUi()
            if (!options.preserveJourney) clearStrandContinuityState('force-clear')
            cancelAllThreadTimers()
        }
        if (appState.pinnedThreadIndex !== null && !options.force) {
            return renderThreadInspection(appState.pinnedThreadIndex, { surface: 'pinned', pinned: true })
        }
        if (!options.preserveJourney && appState.strandContinuityState.phase === 'preview') {
            clearStrandContinuityState('preview-clear')
            cancelAllThreadTimers()
        }
        appState.inspectedThreadIndex = null
        appState.threadInspectorPointerInside = false
        focusStore.update((s) => ({
            ...s,
            inspectedStrandIndex: null,
            pinnedThreadIndex: appState.pinnedThreadIndex,
            threadInspector: { ...s.threadInspector, active: false }
        }))
        return renderThreadInspection(null, { surface: 'idle' })
    } finally {
        clearingThreadInspection = false
    }
}

export function exploreThreadNeighbor(
    index: number,
    options: ThreadInspectionOptions = {}
): { targetIndex: number; fromIndex: number | null; reason: string } | null {
    const pts = getBusinessRecords()
    if (!pts || pts.length === 0) return null
    if (!Number.isFinite(index)) return null
    const fromIndex = Number.isFinite(options.fromIndex)
        ? options.fromIndex!
        : getFocusedIndex() !== null
          ? getFocusedIndex()
          : null
    const candidate = (appState.navState.threadCandidates as ThreadCandidateRef[])?.find(
        (item) => item && (typeof item === 'number' ? item === index : item.index === index)
    )
    const targetPoint = Number.isFinite(index) && index >= 0 && index < pts.length ? pts[index] : null
    if (!targetPoint) return null

    const candidateObj = candidate && typeof candidate === 'object' ? candidate : { index: index }
    const reason =
        summarizeNeighborReason(
            candidateObj || {},
            targetPoint,
            Number.isFinite(fromIndex) && fromIndex! >= 0 && fromIndex! < pts.length ? pts[fromIndex!] : null
        ) ||
        candidateObj?.reason ||
        options.reason ||
        'nearby business relationship'
    cancelAllThreadTimers()
    appState.pinnedThreadIndex = null
    appState.inspectedThreadIndex = index
    focusStore.update((s) => ({
        ...s,
        inspectedStrandIndex: index,
        pinnedThreadIndex: null,
        threadInspector: {
            ...s.threadInspector,
            inspectedIndex: index,
            pinnedIndex: null,
            active: true
        }
    }))
    setStrandContinuityState('exploring', { targetIndex: index, fromIndex, reason })
    // Note: dispatchNavTransition and other navigation updates should use our store-based navigation functions
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, {
        index,
        fromIndex: fromIndex ?? undefined,
        appendHistory: !options.restoreHistory
    } as any)
    renderThreadInspection(index, { force: true, surface: options.surface || 'explore' })
    withStateMutation(() => {
        ;(legacyState.navState as any).lastTraversalReason = reason
    })
    if (appState.currentView === 'map') {
        focusOnPoint(targetPoint, {
            fromTraversal: true,
            appendHistory: !options.restoreHistory,
            restoreHistory: !!options.restoreHistory,
            fromIndex: fromIndex ?? undefined
        } as any)
    } else {
        focusOnNode(index, {
            fromCanvasNode: !!options.fromCanvasNode,
            fromTraversal: true,
            appendHistory: !options.restoreHistory,
            restoreHistory: !!options.restoreHistory,
            fromIndex: fromIndex ?? undefined
        })
    }
    showExperienceToast(
        'Following connection',
        `Opening the connection to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
    )
    const arrivalDelay = options.arrivalDelay || 820
    const capturedIndex = index
    const capturedFromIndex = fromIndex
    const capturedReason = reason
    setTimer('arrival', arrivalDelay, () => {
        const s2 = appState.strandContinuityState
        if (s2?.phase === 'exploring' && s2?.targetIndex === capturedIndex) {
            setStrandContinuityState('arrived', {
                targetIndex: capturedIndex,
                fromIndex: capturedFromIndex,
                reason: capturedReason
            })
            const pointAtArrival =
                Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < pts.length
                    ? pts[capturedIndex]
                    : null
            syncFocusStage(pointAtArrival || appState.selectedPoint || null)
            updateJourneyCompass()
        }
    })
    const settleDelay = options.settleDelay || 5200
    setTimer('settle', settleDelay, () => {
        const s3 = appState.strandContinuityState
        if (s3?.phase === 'arrived' && s3?.targetIndex === capturedIndex) {
            clearStrandContinuityState('arrival-settled')
            const pointAtSettle =
                Number.isFinite(capturedIndex) && capturedIndex >= 0 && capturedIndex < pts.length
                    ? pts[capturedIndex]
                    : null
            syncFocusStage(pointAtSettle || appState.selectedPoint || null)
        }
    })
    return { targetIndex: index, fromIndex: fromIndex ?? null, reason }
}

// ── Re-exports (TS split consolidation) ────────────────────────────────────────
// These names are imported from thread-settler / thread-model so callers that
// historically resolved them through thread-inspector (legacy js/modules/thread-inspector.ts)
// still see them via substring references in source-only contracts.
export { getStrandArrivalNote } from '@lib/journey/thread-settler'

// ── Wave70 dewindowing notes ────────────────────────────────────────────────────────────────
// All thread-inspection surfaces route through direct named exports
// (renderThreadInspection / inspectThreadNeighbor / pinThreadNeighbor /
// unpinThreadInspection / clearThreadInspection). Legacy callers should
// migrate to walkThreadNeighbor (the active seam in thread-settler.ts) and
// the exported strand-continuity helpers above.
// Wave70 retired the _ti debug namespace on window — the diagnostic _ti
// surface is no longer assigned to window, and walkThreadNeighbor remains
// the active seam.
