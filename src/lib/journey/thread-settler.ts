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
import { navStore, dispatchNavTransition, writeNavStateMirror, setFocusedIndex } from '@lib/stores/navigation.svelte'
import { appState } from '@lib/state/app.svelte.ts'
import { getBusinessRecords } from '@lib/data-store'

import {
    getCurrentTrailFocusIndex,
    isBoundedNeighborhoodActive,
    primeBoundedSemanticNeighborhoodForTraversal,
    getBoundedNeighborhoodWalkCandidate,
    getNextWalkCandidateForIndex,
    setTrailFromSeed
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
import { setThreadCandidates } from '@lib/stores/journey.svelte'
import { debugWarn } from '@lib/utils/debug'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * THE single writer for appState.focusedNode (single-writer contract,
 * 2026-08-07 — sprawl backlog #5). thread-settler semantically owns the
 * focused node: it sets it while walking threads. The reset-to-null paths in
 * url-state (clearExplorationFocusSelection) and main.ts (test-compat proxy)
 * route through this helper instead of writing appState directly.
 *
 * appState.focusedNode is a top-level alias over navState.focusedIndex (the
 * canonical nav field, also written by the nav funnel writeNavStateMirror
 * alongside this alias — see walkThreadNeighbor); the alias setter already
 * normalizes non-finite values to null.
 */
export function setFocusedNode(index: number | null): void {
    // Route through the canonical focused-index writer so the Svelte navStore
    // mirror, drift baseline, and (when changed) focus events stay in sync. The
    // bare `appState.focusedNode = index` alias door wrote navState.focusedIndex
    // without mirror notification. The alias setter normalizes non-finite to
    // null, so preserve that contract before delegating.
    setFocusedIndex(Number.isFinite(index) ? Number(index) : null)
}

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
        return 'Nearby business.'
    }

    if (candidate.relationshipRole) {
        const roleLabels: Record<string, string> = {
            core_peer: 'A similar local business',
            upstream: 'A local input-type business',
            downstream: 'A local customer-type business',
            complement: 'A business that complements this one',
            same_market: 'Another business in the same local market',
            bridge: 'A business that links different parts of the market',
            geo_echo: 'A similar business in another nearby town',
            peer: 'A similar local business'
        }
        const label = roleLabels[candidate.relationshipRole]
        if (label) return label
    }

    if (candidate.sameCity) return 'A nearby business in the same local market'
    if (candidate.source === 'semantic') return 'A related local business'
    return 'A nearby business'
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
            core_peer: 'similar local business',
            upstream: 'local input-type business',
            downstream: 'local customer-type business',
            complement: 'complements this business',
            same_market: 'same local market',
            bridge: 'links market areas',
            geo_echo: 'nearby in another town',
            peer: 'similar local business'
        }
        const label = roleLabels[candidate.relationshipRole]
        if (label) return label
        return candidate.relationshipRole
    }

    if (candidate.sameCity) return 'In the same local market'
    if (candidate.source === 'semantic') return 'Related local business'
    if (candidate.sameStatus) return 'Same local market'

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
        if (index === focusedIndex && appState.navState?.mode === 'trail' && !options.fromCanvasNode) {
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

        {
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
        }

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
            surface: appState.navState.surface === 'focus-search' ? 'focus-search' : 'focus',
            trailDepth: Math.max(1, Number(appState.trailDepth) || 0),
            walkHistoryIndices: nextHistory,
            lastTraversalReason: reason
        })
        {
            setFocusedNode(index)
            appState.focusState.inspectedThreadIndex = null
            appState.focusState.pinnedThreadIndex = null
        }

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
                surface: appState.navState.surface === 'focus-search' ? 'focus-search' : 'focus',
                trailDepth: Math.max(1, Number(appState.trailDepth) || 0),
                walkHistoryIndices: reassertHistory,
                lastTraversalReason: reason
            })
            {
                setFocusedNode(index)
                appState.focusState.selectedPoint = (point ||
                    appState.focusState.selectedPoint ||
                    null) as unknown as typeof appState.focusState.selectedPoint
                appState.focusState.inspectedThreadIndex = null
                appState.focusState.pinnedThreadIndex = null
            }
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
            `Moving along the trail to ${formatBusinessName(targetPoint?.name || 'the next stop')}.`
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

                // Stale-Next fix (2026-08-24): walking A→B leaves navState.threadCandidates
                // pointing at A's neighbors (whose [0] IS B), so the walk HUD "Next:" line and
                // the NEXT STOP badge kept showing the stop we just came from until some other
                // trigger recomputed them. Recompute for the arrived stop now: setTrailFromSeed
                // writes ONLY candidate/trail-seed fields (mode/surface/trailDepth untouched)
                // and setThreadCandidates mirrors them into the journey store so the
                // journeySnapshot-derived HUD actually re-runs (nav-mirror writes alone do not
                // notify the journey writable). Skip when the walk preserved a bounded
                // neighborhood — those candidate sets are intentionally stable.
                if (!preserveNeighborhood) {
                    try {
                        setTrailFromSeed(capturedIndex)
                        setThreadCandidates((appState.navState.threadCandidates ?? []).map((c) => c.index))
                    } catch (e) {
                        debugWarn('[thread-settler] arrival candidate rebuild failed', e)
                    }
                }

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
