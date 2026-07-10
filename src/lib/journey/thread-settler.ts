/**
 * @lib/journey/thread-settler.ts — Thread walk traversal, neighbor timers, inspection settle flow
 *
 * Ported from:
 *
 * Uses StrandContinuityManager for all timer management.
 * Fixes Bug #6: Race between walkThreadNeighbor and stale arrival callbacks.
 */

import { get } from 'svelte/store'
import type { BusinessRecord } from '@lib/types/business'
import { formatBusinessName } from '@lib/utils/dom-formatters'
import { getStrandContinuityManager } from '@lib/utils/strand-continuity'

import { NAV_TRANSITION_ACTIONS } from '@lib/navigation-actions'
import { navStore, dispatchNavTransition, writeNavStateMirror } from '@lib/stores/navigation.svelte'
import { appState } from '@lib/state/app.svelte.ts'
import { getBusinessRecords } from '@lib/data-store'

import { withStateMutation } from '@lib/state/with-state-mutation'
import {
    getCurrentTrailFocusIndex,
    isBoundedNeighborhoodActive,
    primeBoundedSemanticNeighborhoodForTraversal,
    getBoundedNeighborhoodWalkCandidate,
    getNextWalkCandidateForIndex
} from '@lib/journey/neighborhood'
import { setStrandContinuityState, clearStrandContinuityState } from '@lib/utils/strand-continuity'
import { focusOnNode } from '@lib/engine/camera-controls'
import { focusOnPoint } from '@lib/orchestration/lifecycle'
import { inspectThreadNeighbor, clearThreadInspection } from './thread-inspector-state'
import { renderThreadInspection } from './thread-inspector-render'
import type { ThreadInspectionState } from './thread-inspector-state'
import { syncFocusStage } from '@lib/journey/selected-card'
import { syncSemanticDiveUi } from '@lib/journey/semantic-dive'
import { updateJourneyCompass } from '@lib/orchestration/compass-controller'
import { showExperienceToast } from '@lib/orchestration/toast'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WalkOptions {
    fromIndex?: number
    fromCanvasNode?: boolean
    fromTraversal?: boolean
    preserveNeighborhood?: boolean
    appendHistory?: boolean
    restoreHistory?: boolean
    surface?: string
    reason?: string
    arrivalDelay?: number
    settleDelay?: number
    expandNeighborhood?: boolean
}

export interface WalkResult {
    targetIndex: number
    fromIndex: number | null
    reason: string
}

export interface PreviewInsideOptions {
    force?: boolean
    [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function copyFiniteIndexHistory(value: unknown): number[] {
    if (!value || typeof (value as { length?: unknown }).length !== 'number') return []
    const length = Math.max(0, Number((value as { length: number }).length) || 0)
    const history: number[] = []
    for (let i = 0; i < length; i += 1) {
        const index = Number((value as Record<number, unknown>)[i])
        if (Number.isFinite(index)) history.push(index)
    }
    return history
}

// ── Timer Helpers ────────────────────────────────────────────────────────────

// Module-level timer hooks allow initJourneyTimerAdapter to inject test
// doubles (jsdom contracts often need deterministic timers). The defaults
// delegate to the strand-continuity manager.
let _setTimer: (purpose: string, ms: number, callback: () => void) => void = (
    purpose: string,
    ms: number,
    callback: () => void
) => {
    const manager = getStrandContinuityManager()
    manager.setTimer(purpose, ms, callback)
}
let _clearTimer: (purpose: string) => void = (purpose: string) => {
    const manager = getStrandContinuityManager()
    manager.clearTimer(purpose)
}

export function setTimer(purpose: string, ms: number, callback: () => void): void {
    _setTimer(purpose, ms, callback)
}

export function clearTimer(purpose: string): void {
    _clearTimer(purpose)
}

export function cancelAllThreadTimers(): void {
    const manager = getStrandContinuityManager()
    manager.cancelAll()
}

export interface JourneyTimerAdapterDeps {
    setTimer?: (purpose: string, ms: number, callback: () => void) => void
    clearTimer?: (purpose: string) => void
}

export function initJourneyTimerAdapter(deps: JourneyTimerAdapterDeps = {}): void {
    if (deps.setTimer) _setTimer = deps.setTimer
    if (deps.clearTimer) _clearTimer = deps.clearTimer
}

// ── Neighbor Reason Summaries ─────────────────────────────────────────────────

export function summarizeNeighborReason(
    candidate: {
        index?: number
        reason?: string
        threadType?: string
        source?: string
        relationshipRole?: string
        roleReason?: string
        sameCity?: boolean
        sameStatus?: boolean
    } = {}
): string {
    if (!candidate || Object.keys(candidate).length === 0) {
        return 'Nearby cloud stop.'
    }

    if (candidate.relationshipRole) {
        if (candidate.roleReason) {
            const match = candidate.roleReason.match(/^(?:candidate looks like an |acts as an |serves as an )(.+)$/i)
            if (match) return `An ${match[1]}`
            return candidate.roleReason.charAt(0).toUpperCase() + candidate.roleReason.slice(1)
        }
        const roleLabels: Record<string, string> = {
            upstream: 'An input provider',
            downstream: 'A downstream consumer',
            peer: 'A peer in the network'
        }
        const label = roleLabels[candidate.relationshipRole]
        if (label) return label
    }

    if (candidate.reason && candidate.reason.includes('close semantic neighbor')) {
        if (candidate.sameCity) return 'Same-city relationship grounded in shared record language'
        return 'Deep record relationship grounded in shared record language'
    }

    if (candidate.sameCity && candidate.reason?.includes('semantic neighbor')) {
        return 'Same-city relationship grounded in semantic link'
    }

    if (candidate.reason) return candidate.reason

    if (candidate.threadType === 'approximate_projected_neighbor') return 'approximate cloud projection neighbor'
    if (candidate.source === 'semantic') return 'semantic business relationship'
    return 'nearby business relationship'
}

export function getInsideRelationshipLabel(
    candidate: {
        index?: number
        reason?: string
        threadType?: string
        source?: string
        relationshipRole?: string
        sameCity?: boolean
        sameStatus?: boolean
    } = {}
): string {
    if (!candidate || Object.keys(candidate).length === 0) return 'Nearby connection'

    if (candidate.relationshipRole) {
        const roleLabels: Record<string, string> = {
            upstream: 'serves trail',
            downstream: 'served by trail',
            peer: 'trail peer'
        }
        const label = roleLabels[candidate.relationshipRole]
        if (label) return label
        return candidate.relationshipRole
    }

    if (candidate.sameCity) return 'On the same trail'
    if (candidate.source === 'semantic') return 'related connection'
    if (candidate.sameStatus) return 'Same trail layer'

    return 'Nearby connection'
}

export function getStrandArrivalNote(): string {
    const manager = getStrandContinuityManager()
    const state = manager.state
    if (state.phase === 'arrived') {
        return `Arrived at ${state.reason || 'the next stop'}.`
    }
    return ''
}

// ── ThreadSettler Class ──────────────────────────────────────────────────────

export class ThreadSettler {
    private manager = getStrandContinuityManager()
    private callbacks: {
        onWalk?: (index: number, options: WalkOptions) => void
        onFocus?: (point: BusinessRecord | null) => void
        onCompassUpdate?: () => void
        onSemanticDiveSync?: () => void
        onShowToast?: (title: string, message: string) => void
    } = {}

    setCallbacks(cb: ThreadSettler['callbacks']): void {
        this.callbacks = { ...this.callbacks, ...cb }
    }

    walkThreadNeighbor(index: number, options: WalkOptions = {}): WalkResult | null {
        if (!Number.isFinite(index)) return null
        // Guard: re-walking the same focused index from canvas hover is redundant
        // and can saturate the main thread when many pointermove events fire in
        // quick succession. Clicks/traversal still run so the user can re-select a
        // focused node if they explicitly click it again.
        const focusedIndex = get(navStore).focusedIndex
        if (
            index === focusedIndex &&
            appState.navState?.mode === 'trail' &&
            !options.fromCanvasNode
        ) {
            return null
        }
        const fromIndex = Number.isFinite(options.fromIndex)
            ? (options.fromIndex as number)
            : getCurrentTrailFocusIndex(focusedIndex)

        const nav = get(navStore)
        const candidate = (nav.threadCandidates || []).find((item: { index: number }) => item.index === index)
        const records = getBusinessRecords()
        const targetPoint: BusinessRecord | null =
            index >= 0 && index < records.length ? (records[index] ?? null) : null
        const reason =
            options.reason ||
            summarizeNeighborReason(candidate && typeof candidate === 'object' ? candidate : {}) ||
            (candidate && typeof candidate === 'object' ? candidate.reason : null) ||
            'nearby business relationship'

        withStateMutation(() => {
            appState.focusState.pinnedThreadIndex = null
            appState.focusState.inspectedThreadIndex = null
            // H4 fix (Jul-10 bugsweep): suppress logic was inverted — it set
            // the debounce on !fromCanvasNode (hover) and checked it on
            // fromCanvasNode (click), so every click <1200ms after hover was
            // silently dropped. Correct intent: after a click/traversal we
            // debounce hover re-focus; clicks must always succeed.
            if (options.fromCanvasNode || options.fromTraversal) {
                appState.suppressCanvasFocusUntil =
                    typeof performance !== 'undefined' ? performance.now() + 1200 : Date.now() + 1200
            }
        })

        appState.focusState.pinnedThreadIndex = null
        appState.focusState.inspectedThreadIndex = null

        cancelAllThreadTimers()
        setStrandContinuityState('exploring', { targetIndex: index, fromIndex, reason })
        this.manager.setPhase('exploring', { targetIndex: index, fromIndex, reason })

        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, {
            index,
            fromIndex: fromIndex ?? undefined,
            appendHistory: !options.restoreHistory
        })
        renderThreadInspection(null, { force: true, surface: 'idle' })

        writeNavStateMirror({ lastTraversalReason: reason })

        const preserveNeighborhood =
            appState.currentView === 'galaxy' && isBoundedNeighborhoodActive() && !options.expandNeighborhood

        if (appState.currentView === 'map') {
            focusOnPoint(targetPoint)
        } else {
            focusOnNode(index, {
                fromCanvasNode: !!options.fromCanvasNode,
                fromTraversal: true,
                preserveNeighborhood,
                appendHistory: !options.restoreHistory,
                restoreHistory: !!options.restoreHistory,
                fromIndex: fromIndex ?? undefined
            })
        }

        const nextHistory = copyFiniteIndexHistory(appState.navState.walkHistoryIndices)
        if (typeof fromIndex === 'number' && Number.isFinite(fromIndex) && nextHistory.length === 0) {
            nextHistory.push(fromIndex)
        }
        if (nextHistory[nextHistory.length - 1] !== index) {
            nextHistory.push(index)
        }
        writeNavStateMirror({
            focusedIndex: index,
            mode: 'trail',
            surface: 'focus',
            trailDepth: Math.max(1, Number(appState.navState.trailDepth) || 0),
            walkHistoryIndices: nextHistory,
            lastTraversalReason: reason
        })
        withStateMutation(() => {
            appState.focusedNode = index
            appState.trailDepth = Math.max(1, Number(appState.trailDepth) || 0)
            appState.focusState.inspectedThreadIndex = null
            appState.focusState.pinnedThreadIndex = null
        })

        const reassertThreadTarget = (): void => {
            const point = index >= 0 && index < records.length ? records[index] : null
            const reassertHistory = copyFiniteIndexHistory(appState.navState.walkHistoryIndices)
            if (typeof fromIndex === 'number' && Number.isFinite(fromIndex) && reassertHistory.length === 0) {
                reassertHistory.push(fromIndex)
            }
            if (reassertHistory[reassertHistory.length - 1] !== index) reassertHistory.push(index)
            writeNavStateMirror({
                focusedIndex: index,
                mode: 'trail',
                surface: 'focus',
                trailDepth: Math.max(1, Number(appState.navState.trailDepth) || 0),
                walkHistoryIndices: reassertHistory,
                lastTraversalReason: reason
            })
            withStateMutation(() => {
                appState.focusedNode = index
                appState.focusState.selectedPoint = (point ||
                    appState.focusState.selectedPoint ||
                    null) as unknown as typeof appState.focusState.selectedPoint
                appState.trailDepth = Math.max(1, Number(appState.trailDepth) || 0)
                appState.focusState.inspectedThreadIndex = null
                appState.focusState.pinnedThreadIndex = null
            })
            syncFocusStage(point || appState.focusState.selectedPoint || null)
            syncSemanticDiveUi()
            updateJourneyCompass()
        }

        setTimer('reassert-early', 120, reassertThreadTarget)
        setTimer('reassert-late', 420, reassertThreadTarget)
        clearThreadInspection({ preserveJourney: true })
        syncSemanticDiveUi()
        updateJourneyCompass()

        showExperienceToast(
            'Following connection',
            `Moving along the semantic trail to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
        )

        const capturedIndex = index
        const capturedFromIndex = fromIndex
        const capturedReason = reason

        this.manager.setTimer('arrival', options.arrivalDelay || 820, () => {
            const recordsList = getBusinessRecords()
            if (recordsList.length === 0) return
            const managerState = this.manager.state
            if (managerState.phase === 'exploring' && managerState.targetIndex === capturedIndex) {
                this.manager.clearTimer('arrival')
                setStrandContinuityState('arrived', {
                    targetIndex: capturedIndex,
                    fromIndex: capturedFromIndex,
                    reason: capturedReason
                })
                this.manager.setPhase('arrived', {
                    targetIndex: capturedIndex,
                    fromIndex: capturedFromIndex,
                    reason: capturedReason
                })

                const pointAtArrival =
                    capturedIndex >= 0 && capturedIndex < recordsList.length ? recordsList[capturedIndex] : null
                syncFocusStage(pointAtArrival || appState.focusState.selectedPoint || null)
                updateJourneyCompass()

                if (appState.semanticDiveMode) {
                    this.previewInsideNextThread({ force: true })
                    syncSemanticDiveUi()
                } else {
                    clearThreadInspection({ force: true, preserveJourney: true })
                }
            }
        })

        this.manager.setTimer('settle', options.settleDelay || 5200, () => {
            const recordsList = getBusinessRecords()
            if (recordsList.length === 0) return
            const managerState = this.manager.state
            if (managerState.phase === 'arrived' && managerState.targetIndex === capturedIndex) {
                this.manager.clearTimer('settle')
                clearStrandContinuityState('arrival-settled')
                this.manager.setPhase('idle', { reason: 'arrival-settled' })

                const pointAtSettle =
                    capturedIndex >= 0 && capturedIndex < recordsList.length ? recordsList[capturedIndex] : null
                syncFocusStage(pointAtSettle || appState.focusState.selectedPoint || null)
            }
        })

        return { targetIndex: capturedIndex, fromIndex: capturedFromIndex, reason: capturedReason }
    }

    traverseNeighbor(step: number): void {
        const currentIndex = getCurrentTrailFocusIndex(get(navStore).focusedIndex)
        if (currentIndex === null || currentIndex === undefined) return
        if (!primeBoundedSemanticNeighborhoodForTraversal(currentIndex)) return

        if (step < 0) {
            const previousCandidate = getBoundedNeighborhoodWalkCandidate(-1, currentIndex, { commit: true })
            if (previousCandidate) {
                this.walkThreadNeighbor(previousCandidate.index, {
                    fromIndex: currentIndex,
                    surface: 'neighborhood-loop',
                    reason: previousCandidate.reason || 'previous stop in this bounded neighborhood'
                })
                return
            }
            const walkHistory = copyFiniteIndexHistory(get(navStore).walkHistoryIndices)
            if (walkHistory.length <= 1) return
            const previousIndex = walkHistory[walkHistory.length - 2]
            if (typeof previousIndex !== 'number' || !Number.isFinite(previousIndex)) return
            dispatchNavTransition(NAV_TRANSITION_ACTIONS.BACKTRACK, {
                step: -1,
                fromIndex: currentIndex,
                targetIndex: previousIndex,
                restoreHistory: true
            })
            this.walkThreadNeighbor(previousIndex, {
                fromIndex: currentIndex,
                restoreHistory: true,
                surface: 'backtrack',
                reason: 'backtracked to the previous business in your walk'
            })
            return
        }

        const nextCandidate = getNextWalkCandidateForIndex(currentIndex, {
            requireSemantic: appState.currentView === 'galaxy',
            requireOnCanvas: appState.currentView === 'galaxy',
            commitNeighborhood: true
        })
        if (!nextCandidate) {
            showExperienceToast('End of path', 'No more connected neighbors are ready.')
            return
        }
        this.walkThreadNeighbor(nextCandidate.index, {
            fromIndex: currentIndex,
            surface: isBoundedNeighborhoodActive() ? 'neighborhood-loop' : 'walk',
            reason: nextCandidate.reason || 'nearby business relationship'
        })
    }

    previewInsideNextThread(options: PreviewInsideOptions = {}): ThreadInspectionState | null {
        if (!appState.semanticDiveMode || appState.currentView !== 'galaxy') return null
        const currentIndex = getCurrentTrailFocusIndex(get(navStore).focusedIndex)
        if (currentIndex === null || !Number.isFinite(currentIndex)) return null
        const nextCandidate =
            getNextWalkCandidateForIndex(currentIndex!, {
                requireSemantic: true,
                requireOnCanvas: true,
                commitNeighborhood: false
            }) ||
            getNextWalkCandidateForIndex(currentIndex!, {
                requireSemantic: false,
                requireOnCanvas: false,
                commitNeighborhood: false
            })
        if (!nextCandidate || !Number.isFinite(nextCandidate.index)) return null
        return inspectThreadNeighbor(nextCandidate.index, {
            ...options,
            force: true,
            preserveJourney: true,
            surface: 'inside-cue'
        })
    }

    clearAllTimers(): void {
        this.manager.cancelAll()
    }
}

// ── Functional Exports ───────────────────────────────────────────────────────

let _threadSettler: ThreadSettler | null = null
export function getThreadSettler(): ThreadSettler {
    if (!_threadSettler) _threadSettler = new ThreadSettler()
    return _threadSettler
}

export function walkThreadNeighbor(index: number, options: WalkOptions = {}): WalkResult | null {
    return getThreadSettler().walkThreadNeighbor(index, options)
}

export function traverseNeighbor(step: number): void {
    getThreadSettler().traverseNeighbor(step)
}

export function previewInsideNextThread(options: PreviewInsideOptions = {}): ThreadInspectionState | null {
    return getThreadSettler().previewInsideNextThread(options)
}
