/**
 * @lib/journey/thread-inspector-state.ts — Thread inspection types and state/logic functions
 *
 * Split from thread-inspector.ts (Wave70). Contains all types and the 8
 * state/logic functions. Imports renderThreadInspection from the render
 * module (circular reference resolved at call time in ESM).
 */

import { appState } from '@lib/state/app.svelte.ts'
import { getBusinessRecords, getFocusedIndex } from '@lib/stores/index.svelte.ts'
import { focusStore } from '@lib/stores/focus.svelte.ts'
import { formatBusinessName, stripTerminalPunctuation } from '@lib/utils/dom-formatters'
import { getRelationshipRoleLabel, normalizeRelationshipRole } from '@lib/utils/relationship-roles'
import { truncateMicrocopy } from '@lib/journey/text-helpers'
import { setStrandContinuityState, clearStrandContinuityState } from '@lib/utils/strand-continuity'
import type { ThreadCandidateRef } from '@lib/types/state'
import { focusOnNode } from '@lib/engine/camera-controls'
import { focusOnPoint } from '@lib/orchestration/lifecycle'
import { syncFocusStage } from '@lib/journey/selected-card'
import { syncSemanticDiveUi } from '@lib/journey/semantic-dive'
import { updateJourneyCompass } from '@lib/orchestration/compass-controller'
import { showExperienceToast } from '@lib/orchestration/toast'
import { dispatchNavTransition, NAV_TRANSITION_ACTIONS, writeNavStateMirror } from '@lib/stores/navigation.svelte.ts'
import {
    summarizeNeighborReason,
    getInsideRelationshipLabel,
    setTimer,
    clearTimer,
    cancelAllThreadTimers
} from '@lib/journey/thread-settler'
import { subscribe, EVENTS } from '@lib/orchestration/event-bus'
import { withStateMutation } from '@lib/state/with-state-mutation'

// Circular import — resolved at call time in ESM; render calls
// scheduleCanvasThreadInspectionClear and getThreadInspectionState back.
import { renderThreadInspection } from './thread-inspector-render'

// ── Types ──────────────────────────────────────────────────────────────────

/** HTMLElement extension that carries the private pointer-event listeners
 *  we attach when binding/unbinding the canvas thread inspection overlay.
 *  Used to avoid `as any` casts when reading/writing `_pointerEnterListener`
 *  and `_pointerLeaveListener` on the inspector DOM node. */
export interface InspectorElement extends HTMLElement {
    _pointerEnterListener?: EventListener
    _pointerLeaveListener?: EventListener
}

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
    index: number | null = appState.focusState.inspectedThreadIndex,
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

    const candidateObj: ThreadCandidateRef = (
        candidate && typeof candidate === 'object' ? candidate : { index: candidateIndex ?? 0, source: '', reason: '' }
    ) as ThreadCandidateRef
    const reason = active ? summarizeNeighborReason(candidateObj) : ''
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
    const pinned = active && appState.focusState.pinnedThreadIndex === candidateIndex
    const journeyPhase =
        active && appState.strandContinuityState.targetIndex === candidateIndex
            ? appState.strandContinuityState.phase
            : pinned
              ? 'pinned'
              : active
                ? 'preview'
                : 'idle'
    const cleanReason = stripTerminalPunctuation(reason)
    const displayReason = active && reason.includes('...') ? getInsideRelationshipLabel(candidateObj) : cleanReason
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
            active: !!appState.focusState.inspectedStrandDiagnostics.active,
            source: appState.focusState.inspectedStrandDiagnostics.source || 'none',
            segmentCount: appState.focusState.inspectedStrandDiagnostics.segmentCount || 0,
            braidCount: appState.focusState.inspectedStrandDiagnostics.braidCount || 0,
            endpointCount: appState.focusState.inspectedStrandDiagnostics.endpointCount || 0
        },
        threadSource: appState.navState.threadSource || null
    }
}

export function inspectThreadNeighbor(
    index: number,
    options: ThreadInspectionOptions = {}
): ThreadInspectionState | null {
    if (appState.focusState.pinnedThreadIndex !== null && !options.force) {
        return renderThreadInspection(appState.focusState.pinnedThreadIndex, { surface: 'pinned', pinned: true })
    }
    appState.focusState.inspectedThreadIndex = Number.isFinite(index) ? index : null
    focusStore.update((s) => ({
        ...s,
        inspectedStrandIndex: appState.focusState.inspectedThreadIndex,
        pinnedThreadIndex: appState.focusState.pinnedThreadIndex,
        threadInspector: {
            ...s.threadInspector,
            inspectedIndex: appState.focusState.inspectedThreadIndex,
            pinnedIndex: appState.focusState.pinnedThreadIndex,
            active: appState.focusState.inspectedThreadIndex !== null
        }
    }))
    if (Number.isFinite(appState.focusState.inspectedThreadIndex) && !options.preserveJourney) {
        setStrandContinuityState('preview', {
            targetIndex: appState.focusState.inspectedThreadIndex,
            fromIndex: getFocusedIndex(),
            reason: options.surface || 'inspect'
        })
    }
    return renderThreadInspection(appState.focusState.inspectedThreadIndex, options)
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
            appState.canvasThreadInspectionClearTimer = null
        })
        appState.canvasThreadInspectionClearTimer = null
    }

    appState.focusState.pinnedThreadIndex = index
    appState.focusState.inspectedThreadIndex = index
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
            appState.canvasThreadInspectionClearTimer = null
        })
        appState.canvasThreadInspectionClearTimer = null
    }
    appState.focusState.pinnedThreadIndex = null
    appState.focusState.inspectedThreadIndex = null
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
        if (appState.focusState.threadInspectorPointerInside || appState.focusState.pinnedThreadIndex !== null) return
        if (typeof document !== 'undefined' && document.body.dataset.threadInspectSurface === 'canvas') {
            clearThreadInspection()
        }
    }, delay)
    appState.canvasThreadInspectionClearTimer = id as unknown as ReturnType<typeof setTimeout>
}

export function clearThreadInspection(options: ThreadInspectionOptions = {}): ThreadInspectionState | null {
    if (clearingThreadInspection) {
        appState.focusState.pinnedThreadIndex = null
        appState.focusState.inspectedThreadIndex = null
        appState.focusState.threadInspectorPointerInside = false
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
                appState.canvasThreadInspectionClearTimer = null
            })
            appState.canvasThreadInspectionClearTimer = null
        }
        if (options.force) {
            appState.focusState.pinnedThreadIndex = null
            appState.focusState.inspectedThreadIndex = null
            appState.focusState.threadInspectorPointerInside = false
            focusStore.update((s) => ({
                ...s,
                inspectedStrandIndex: null,
                pinnedThreadIndex: null,
                threadInspector: { ...s.threadInspector, active: false }
            }))
            syncFocusStage(appState.focusState.selectedPoint)
            syncSemanticDiveUi()
            if (!options.preserveJourney) clearStrandContinuityState('force-clear')
            cancelAllThreadTimers()
        }
        if (appState.focusState.pinnedThreadIndex !== null && !options.force) {
            return renderThreadInspection(appState.focusState.pinnedThreadIndex, { surface: 'pinned', pinned: true })
        }
        if (!options.preserveJourney && appState.strandContinuityState.phase === 'preview') {
            clearStrandContinuityState('preview-clear')
            cancelAllThreadTimers()
        }
        appState.focusState.inspectedThreadIndex = null
        appState.focusState.threadInspectorPointerInside = false
        focusStore.update((s) => ({
            ...s,
            inspectedStrandIndex: null,
            pinnedThreadIndex: appState.focusState.pinnedThreadIndex,
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

    const candidateObj: ThreadCandidateRef = (
        candidate && typeof candidate === 'object' ? candidate : { index, source: '', reason: '' }
    ) as ThreadCandidateRef
    const reason =
        summarizeNeighborReason(candidateObj) || candidateObj.reason || options.reason || 'nearby business relationship'
    cancelAllThreadTimers()
    appState.focusState.pinnedThreadIndex = null
    appState.focusState.inspectedThreadIndex = index
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
    })
    renderThreadInspection(index, { force: true, surface: options.surface || 'explore' })
    writeNavStateMirror({ lastTraversalReason: reason })
    if (appState.currentView === 'map') {
        focusOnPoint(targetPoint)
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
            syncFocusStage(pointAtArrival || appState.focusState.selectedPoint || null)
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
            syncFocusStage(pointAtSettle || appState.focusState.selectedPoint || null)
        }
    })
    return { targetIndex: index, fromIndex: fromIndex ?? null, reason }
}
