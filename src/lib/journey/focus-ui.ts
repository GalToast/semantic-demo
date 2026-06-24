/**
 * @lib/journey/focus-ui.ts — Focus stage UI update utilities
 *
 * Ported from: js/modules/journey-focus-ui.ts
 */

import { get } from 'svelte/store'
import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { formatBusinessName, escapeHtml, cleanOptionalValue } from '@lib/utils/dom-formatters'
import { isCompactFocusStageViewport } from '@lib/utils/ui-presentation'
import { isPointVisible } from '@lib/utils/geo-data'
import { truncateMicrocopy } from '@lib/journey/text-helpers'
import { setStrandContinuityState } from '@lib/utils/strand-continuity'
import { summarizeNeighborReason, walkThreadNeighbor } from '@lib/journey/thread-settler'
import { inspectThreadNeighbor, pinThreadNeighbor, clearThreadInspection } from '@lib/journey/thread-inspector'
import { getCurrentTrailFocusIndex, getNextWalkCandidateForIndex } from '@lib/journey/neighborhood'
import { ensureCanvasNodeInteractionBindings } from '@lib/journey/canvas-interaction'
import { focusOnNode } from '@lib/engine/camera-controls'
import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts'
import {
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics
} from '@lib/engine/journey-webgl-lazy'
import { isCompactLandscape, isUltraCompactPortrait } from '@lib/utils/environment'
import { getRelationshipRoleLabel, normalizeRelationshipRole } from '@lib/utils/relationship-roles'
import type { RelationshipRole } from '@lib/utils/relationship-roles'
import type { BusinessRecord } from '@lib/types/business'
import type { NavState, StrandContinuityState } from '@lib/types/state'
import { appState } from '@lib/state/app.svelte'
const state = appState as any

export function isCondensedFocusStageViewport(): boolean {
    return appState.currentView === 'galaxy' && (isCompactLandscape() || isUltraCompactPortrait())
}

function supportsHoverPreview(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(hover: hover) and (pointer: fine)').matches
    )
}

function shouldUseSingleNeighborFocusRail(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false
    const surface = document.body?.dataset?.panelSurface
    if (surface !== 'focus' && surface !== 'focus-search') return false
    if (document.body?.dataset?.focusPanelMode === 'field-node') return false
    const threadSurface = document.body?.dataset?.threadInspectSurface
    if (threadSurface && threadSurface !== 'idle') return false
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches
}

function shouldSuppressSelectedBusinessNeighborRail(): boolean {
    if (typeof document === 'undefined') return false
    const surface = document.body?.dataset?.panelSurface
    if (surface !== 'focus' && surface !== 'focus-search') return false
    if (document.body?.dataset?.focusPanelMode === 'field-node') return false
    const threadSurface = document.body?.dataset?.threadInspectSurface
    if (threadSurface && threadSurface !== 'idle') return false
    const shortLandscapeFocusViewport =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 900px) and (max-height: 420px) and (orientation: landscape)').matches
    return appState.currentView === 'galaxy' && (isCompactLandscape() || shortLandscapeFocusViewport)
}

export function hasColdDegradedSemanticFallback(): boolean {
    return false
}

export function shouldUseFloatingFocusJourneyOnly(): boolean {
    return false
}

export function initFocusNeighborRailSubscriptions(): void {
    const sync = () => updateFocusNeighborRail()
    subscribeKeyed('focus-neighbor-rail:camera-node-focused', EVENTS.CAMERA_NODE_FOCUSED, sync)
    subscribeKeyed('focus-neighbor-rail:search-success', EVENTS.SEARCH_SUCCESS, sync)
    subscribeKeyed('focus-neighbor-rail:search-cleared', EVENTS.SEARCH_CLEARED, sync)
    subscribeKeyed('focus-neighbor-rail:filter-changed', EVENTS.FILTER_CHANGED, sync)
    subscribeKeyed('focus-neighbor-rail:view-changed', EVENTS.VIEW_CHANGED, sync)
    subscribeKeyed('focus-neighbor-rail:state-reset', EVENTS.STATE_RESET, sync)
    subscribeKeyed('focus-neighbor-rail:composition-updated', EVENTS.COMPOSITION_UPDATED, sync)
    subscribeKeyed('focus-neighbor-rail:exploration-depth-changed', EVENTS.EXPLORATION_DEPTH_CHANGED, sync)
}

export function updateFocusNeighborRail(): void {
    const rail = document.getElementById('focus-stage-neighbors')
    const list = document.getElementById('focus-stage-neighbor-list')
    const countEl = document.getElementById('focus-stage-neighbor-count')
    if (!rail || !list) return

    const threadInspectSurface = document.body?.dataset?.threadInspectSurface
    const threadInspectorOwnsSurface = !!threadInspectSurface && threadInspectSurface !== 'idle'
    if (threadInspectorOwnsSurface) {
        rail.classList.remove('active')
        rail.hidden = true
        rail.setAttribute('aria-hidden', 'true')
        list.textContent = ''
        if (countEl) countEl.textContent = '0 visible neighbors'
        return
    }

    rail.hidden = false
    rail.setAttribute('aria-hidden', 'false')

    if (!Number.isFinite(appState.navState?.focusedIndex) || hasColdDegradedSemanticFallback()) {
        rail.classList.remove('active')
        list.textContent = ''
        if (countEl) countEl.textContent = '0 visible neighbors'
        clearThreadInspection({
            force: true,
            preserveJourney: ['exploring', 'arrived'].includes(
                (appState.strandContinuityState as StrandContinuityState).phase
            )
        })
        return
    }

    if (shouldSuppressSelectedBusinessNeighborRail()) {
        rail.classList.remove('active')
        rail.hidden = true
        rail.setAttribute('aria-hidden', 'true')
        list.textContent = ''
        if (countEl) countEl.textContent = '0 visible neighbors'
        return
    }

    const candidateLimit = shouldUseSingleNeighborFocusRail()
        ? 1
        : isCondensedFocusStageViewport()
          ? 2
          : isCompactFocusStageViewport()
            ? 4
            : 5
    const nav = appState.navState!
    const candidates = (nav.threadCandidates || [])
        .filter((candidate: any) => candidate && candidate.index !== nav.focusedIndex)
        .filter((candidate: any) => isPointVisible(candidate.index, appState.points!, null, appState.activeFilters))
        .slice(0, candidateLimit)

    if (!candidates.length) {
        rail.classList.remove('active')
        list.replaceChildren()
        const emptyState = document.createElement('div')
        emptyState.className = 'empty-state'
        emptyState.textContent = 'No neighboring stops found in this area.'
        list.appendChild(emptyState)
        if (countEl) countEl.textContent = '0 visible neighbors'
        clearThreadInspection({
            force: true,
            preserveJourney: ['exploring', 'arrived'].includes(
                (appState.strandContinuityState as StrandContinuityState).phase
            )
        })
        return
    }

    list.textContent = ''
    if (countEl) {
        const source = candidates.length === 1 ? 'neighbor' : 'neighbors'
        countEl.textContent = `${candidates.length} visible ${source}`
    }

    candidates.forEach((candidate: any, order: number) => {
        const points = appState.points!
        const point =
            Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < points.length
                ? (points[candidate.index] as any)
                : null
        const button = document.createElement('button')
        button.className = 'focus-stage-neighbor-pill' + (order === 0 ? ' is-next-stop' : '')
        button.type = 'button'
        button.tabIndex = 0
        button.dataset.index = String(candidate.index)
        button.dataset.role = (nav as any).focusPocketRoleByIndex?.get(candidate.index) || 'trail'
        const relationshipRole = normalizeRelationshipRole(candidate.relationshipRole)
        button.dataset.relationshipRole = relationshipRole
        button.dataset.reason = candidate.reason || 'semantic neighbor'
        const name = formatBusinessName(point?.name || 'Nearby business')
        const city = cleanOptionalValue(point?.city) || 'Montgomery County'
        const focusIdx = nav.focusedIndex
        const focusPoint =
            Number.isFinite(focusIdx) && focusIdx! >= 0 && focusIdx! < points.length ? (points[focusIdx!] as any) : null
        const reason = summarizeNeighborReason(candidate, point, focusPoint)
        const relationshipLabel = getRelationshipRoleLabel(relationshipRole, 'rail')
        const relationshipTitle = getRelationshipRoleLabel(relationshipRole, 'title')
        const reasonLabel = isCompactFocusStageViewport()
            ? truncateMicrocopy(reason, 58)
            : `${truncateMicrocopy(reason, 72)} | ${city}`
        const ariaLabel =
            order === 0 ? `Next stop: ${name}. ${relationshipTitle}.` : `Explore ${name}: ${relationshipTitle}.`
        button.setAttribute('aria-label', ariaLabel)
        const nextStopBadge = order === 0 ? '<span class="focus-stage-neighbor-next-stop-badge">Next stop</span>' : ''
        button.replaceChildren()

        const mainSpan = document.createElement('span')
        mainSpan.className = 'focus-stage-neighbor-main'

        const indexSpan = document.createElement('span')
        indexSpan.className = 'focus-stage-neighbor-index'
        indexSpan.textContent = String(order + 1).padStart(2, '0')
        mainSpan.appendChild(indexSpan)

        const copySpan = document.createElement('span')
        copySpan.className = 'focus-stage-neighbor-copy'

        const nameSpan = document.createElement('span')
        nameSpan.className = 'focus-stage-neighbor-name'
        nameSpan.textContent = name

        const roleSpan = document.createElement('span')
        roleSpan.className = 'focus-stage-neighbor-role'
        roleSpan.textContent = relationshipLabel
        nameSpan.appendChild(roleSpan)

        if (order === 0) {
            const badge = document.createElement('span')
            badge.className = 'focus-stage-neighbor-next-stop-badge'
            badge.textContent = 'Next stop'
            nameSpan.appendChild(badge)
        }

        copySpan.appendChild(nameSpan)

        const reasonSpan = document.createElement('span')
        reasonSpan.className = 'focus-stage-neighbor-reason'
        reasonSpan.textContent = reasonLabel
        copySpan.appendChild(reasonSpan)

        mainSpan.appendChild(copySpan)

        const actionsSpan = document.createElement('span')
        actionsSpan.className = 'focus-stage-neighbor-actions'
        actionsSpan.setAttribute('aria-label', 'Strand actions')

        const inspectBtn = document.createElement('button')
        inspectBtn.className = 'focus-stage-neighbor-action'
        inspectBtn.type = 'button'
        inspectBtn.dataset.neighborAction = 'inspect'
        inspectBtn.setAttribute('aria-label', 'Inspect connection')
        inspectBtn.textContent = 'Inspect'
        actionsSpan.appendChild(inspectBtn)

        const pinBtn = document.createElement('button')
        pinBtn.className = 'focus-stage-neighbor-action primary'
        pinBtn.type = 'button'
        pinBtn.dataset.neighborAction = 'pin'
        pinBtn.setAttribute('aria-label', 'Pin connection')
        pinBtn.textContent = 'Pin'
        actionsSpan.appendChild(pinBtn)

        button.appendChild(mainSpan)
        button.appendChild(actionsSpan)
        list.appendChild(button)
    })

    let hoverIntentTimer: ReturnType<typeof setTimeout> | null = null
    const cancelHoverIntent = () => {
        if (hoverIntentTimer) {
            clearTimeout(hoverIntentTimer)
            hoverIntentTimer = null
        }
    }

    list.querySelectorAll('[data-index]').forEach((button: Element) => {
        const btn = button as HTMLButtonElement
        const prefersExplicitPreview = (): boolean => {
            try {
                return new URLSearchParams(window.location.search || '').has('productqa')
            } catch {
                return false
            }
        }
        const scheduleInspect = () => {
            cancelHoverIntent()
            hoverIntentTimer = setTimeout(() => {
                const nextIndex = Number(btn.dataset.index)
                if (!Number.isFinite(nextIndex)) return
                inspectThreadNeighbor(nextIndex)
            }, 80)
        }

        const walkToIndex = () => {
            cancelHoverIntent()
            const nextIndex = Number(btn.dataset.index)
            if (!Number.isFinite(nextIndex)) return
            walkThreadNeighbor(nextIndex, {
                surface: 'rail',
                reason: btn.dataset.reason || 'nearby business relationship'
            })
        }
        const inspectIndex = () => {
            cancelHoverIntent()
            const nextIndex = Number(btn.dataset.index)
            if (!Number.isFinite(nextIndex)) return
            setStrandContinuityState('preview', {
                targetIndex: nextIndex,
                fromIndex: appState.navState?.focusedIndex ?? null,
                reason: 'rail-inspect'
            })
            inspectThreadNeighbor(nextIndex, { force: true, surface: 'rail' })
        }

        btn.addEventListener('mouseenter', scheduleInspect)
        btn.addEventListener('focus', scheduleInspect)
        btn.addEventListener('pointerup', (event: PointerEvent) => {
            if (prefersExplicitPreview()) {
                inspectIndex()
                return
            }
            if (supportsHoverPreview()) return
            if ((event.target as HTMLElement)?.closest?.('[data-neighbor-action]')) return
            inspectIndex()
        })

        btn.addEventListener('mouseleave', () => {
            cancelHoverIntent()
            if (!supportsHoverPreview()) return
            clearThreadInspection()
        })

        btn.addEventListener('blur', () => {
            cancelHoverIntent()
            if (!supportsHoverPreview()) return
            clearThreadInspection()
        })

        btn.onclick = (event: MouseEvent) => {
            if ((event.target as HTMLElement)?.closest?.('[data-neighbor-action]')) return
            if (prefersExplicitPreview()) {
                inspectIndex()
                return
            }
            if (!supportsHoverPreview()) {
                inspectIndex()
                return
            }
            walkToIndex()
        }

        btn.onkeydown = (event: KeyboardEvent) => {
            if ((event.target as HTMLElement)?.closest?.('[data-neighbor-action]')) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            if (!supportsHoverPreview()) {
                inspectIndex()
                return
            }
            walkToIndex()
        }

        btn.querySelectorAll('[data-neighbor-action]').forEach((actionButton: Element) => {
            const actionBtn = actionButton as HTMLButtonElement
            actionBtn.addEventListener('focus', scheduleInspect)
            actionBtn.onclick = (event: MouseEvent) => {
                event.preventDefault()
                event.stopPropagation()
                const nextIndex = Number(btn.dataset.index)
                if (!Number.isFinite(nextIndex)) return
                if (actionBtn.dataset.neighborAction === 'pin') {
                    pinThreadNeighbor(nextIndex, { surface: 'pinned' })
                } else {
                    setStrandContinuityState('preview', {
                        targetIndex: nextIndex,
                        fromIndex: appState.navState?.focusedIndex ?? null,
                        reason: 'rail-inspect'
                    })
                    inspectThreadNeighbor(nextIndex, { force: true, surface: 'rail' })
                }
            }
        })
    })

    rail.classList.add('active')
}

function updateWalkBreadcrumb(hasFocus: boolean = false): void {
    const breadcrumb = document.getElementById('walk-breadcrumb')
    if (!breadcrumb) return

    const points = appState.points!
    const history = ((appState.navState?.walkHistoryIndices || []) as number[])
        .filter((index: number) => Number.isFinite(index) && points[index])
        .filter(
            (index: number, order: number, list: number[]) => list.indexOf(index) === order || order === list.length - 1
        )

    if (!hasFocus || history.length <= 1) {
        breadcrumb.hidden = true
        breadcrumb.classList.remove('visible')
        breadcrumb.textContent = ''
        return
    }

    breadcrumb.hidden = false
    breadcrumb.classList.add('visible')
    breadcrumb.replaceChildren()

    const labelSpan = document.createElement('span')
    labelSpan.className = 'walk-breadcrumb-label'
    labelSpan.textContent = 'Trail'
    breadcrumb.appendChild(labelSpan)

    history.forEach((index: number, order: number) => {
        if (order > 0) {
            const sep = document.createElement('span')
            sep.className = 'walk-breadcrumb-sep'
            sep.setAttribute('aria-hidden', 'true')
            sep.textContent = '/'
            breadcrumb.appendChild(sep)
        }
        const point = points[index]
        const name = formatBusinessName(point?.name || 'Stop')
        const isCurrent = order === history.length - 1
        const chip = document.createElement('button')
        chip.className = `walk-breadcrumb-chip${isCurrent ? ' current' : ''}`
        chip.type = 'button'
        chip.dataset.walkIndex = String(index)
        chip.dataset.walkOrder = String(order)
        if (isCurrent) chip.setAttribute('aria-current', 'step')
        chip.setAttribute('aria-label', isCurrent ? `Current stop: ${name}` : `Return to ${name}`)
        chip.textContent = name

        if (!isCurrent) {
            chip.onclick = () => {
                const targetIndex = Number(chip.dataset.walkIndex)
                const targetOrder = Number(chip.dataset.walkOrder)
                if (!Number.isFinite(targetIndex) || !Number.isFinite(targetOrder)) return
                dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, {
                    index: targetIndex,
                    restoreHistoryIndices: history.slice(0, targetOrder + 1),
                    appendHistory: false
                })
                focusOnNode(targetIndex, {
                    fromTraversal: true,
                    restoreHistory: true,
                    historyMode: 'push'
                } as any)
            }
        }

        breadcrumb.appendChild(chip)
    })
}

export function updateTraversalUi(): void {
    const controlsEl = document.getElementById('trail-controls')
    const contextEl = document.getElementById('trail-context')
    const prevBtn = document.getElementById('btn-prev-node') as HTMLButtonElement | null
    const nextBtn = document.getElementById('btn-next-node') as HTMLButtonElement | null
    const focusJourneyEl = document.getElementById('focus-stage-journey')
    const focusPrevBtn = document.getElementById('btn-focus-prev') as HTMLButtonElement | null
    const focusNextBtn = document.getElementById('btn-focus-next') as HTMLButtonElement | null
    const focusProgressEl = document.getElementById('focus-stage-progress')
    const focusNextEl = document.getElementById('focus-stage-next')
    const focusRouteEl = document.getElementById('focus-stage-route')
    const focusCenterBtn = document.getElementById('btn-focus-center') as HTMLButtonElement | null
    const points = appState.points!
    const nav = appState.navState!
    const currentFocusPoint =
        appState.currentView === 'map'
            ? appState.selectedPoint
            : Number.isFinite(nav.focusedIndex)
              ? (points[nav.focusedIndex!] ?? null)
              : null
    const hasFocus = !!currentFocusPoint
    const neighborCount = nav.trailNeighborIndices?.length ?? 0
    const coldDegradedNoRail = hasColdDegradedSemanticFallback()

    if (
        !controlsEl ||
        !contextEl ||
        !prevBtn ||
        !nextBtn ||
        !focusJourneyEl ||
        !focusPrevBtn ||
        !focusNextBtn ||
        !focusProgressEl
    )
        return

    controlsEl.classList.toggle(
        'active',
        hasFocus && (appState.currentView === 'map' || !shouldUseFloatingFocusJourneyOnly())
    )
    contextEl.classList.toggle('active', hasFocus)
    focusJourneyEl.classList.toggle('active', hasFocus && appState.currentView === 'galaxy')
    if (focusCenterBtn) {
        focusCenterBtn.setAttribute('aria-disabled', String(!hasFocus))
        focusCenterBtn.title = hasFocus
            ? 'Recenter camera on this business'
            : 'Select a business to recenter the camera on it'
    }
    ensureCanvasNodeInteractionBindings()

    if (!hasFocus) {
        updateWalkBreadcrumb(false)
        focusProgressEl.textContent = 'Pick a business, then explore its nearby neighbors.'
        if (focusNextEl) focusNextEl.textContent = 'Choose a nearby business to continue the path.'
        if (focusRouteEl) focusRouteEl.dataset.state = 'idle'
        updateFocusNeighborRail()
        removeFocusSemanticOverlay()
        resetFocusThreadDiagnostics('no-focus')
        return
    }

    const canGoBack = (nav.walkHistoryIndices || []).length > 1
    ;[prevBtn, focusPrevBtn].forEach((btn) => {
        if (!btn) return
        btn.disabled = !canGoBack
        btn.setAttribute('aria-disabled', String(!canGoBack))
        if (!canGoBack) btn.title = 'No previous stops in this walk history'
        else btn.removeAttribute('title')
    })
    ;[nextBtn, focusNextBtn].forEach((btn) => {
        if (!btn) return
        const noNext = neighborCount === 0
        btn.disabled = noNext
        btn.setAttribute('aria-disabled', String(noNext))
        if (noNext) btn.title = 'No nearby stops to continue to'
        else btn.removeAttribute('title')
    })

    const currentName = formatBusinessName(currentFocusPoint?.name || 'this business')
    const currentCandidate =
        nav.mode === 'trail' && nav.trailCursor >= 0 && neighborCount > 0 ? nav.threadCandidates[nav.trailCursor] : null
    const sourceLabel = nav.threadSource === 'semantic' ? 'semantic thread' : 'approximate cloud projection fallback'
    const currentIndexForWalk = nav.focusedIndex ?? getCurrentTrailFocusIndex(nav.focusedIndex)
    const nextWalkCandidate = getNextWalkCandidateForIndex(currentIndexForWalk ?? 0)
    const nextWalkPoint = nextWalkCandidate ? points[nextWalkCandidate.index] : null
    const nextWalkName = nextWalkPoint ? formatBusinessName(nextWalkPoint.name || 'next business') : null
    const nextWalkReason = nextWalkCandidate
        ? summarizeNeighborReason(nextWalkCandidate, nextWalkPoint as any, currentFocusPoint as any)
        : ''
    if (focusRouteEl)
        focusRouteEl.dataset.state = neighborCount ? (nav.mode === 'trail' ? 'walking' : 'ready') : 'empty'

    if (coldDegradedNoRail) {
        const queryLabel = appState.semanticLaneSnapshot?.query
            ? `"${appState.semanticLaneSnapshot.query}"`
            : 'this semantic trail'
        prevBtn.disabled = true
        nextBtn.disabled = true
        focusPrevBtn.disabled = true
        focusNextBtn.disabled = true
        contextEl.textContent = `${currentName} restored from this shared link, but the ${queryLabel} did not restore while the semantic lane is degraded. Retry now to rebuild it, or use Overview to step back to the county.`
        focusProgressEl.textContent = `Semantic trail unavailable for ${queryLabel} while the lane is degraded.`
        if (focusNextEl) focusNextEl.textContent = 'Retry the semantic lane before continuing this trail.'
        updateWalkBreadcrumb(false)
        updateFocusNeighborRail()
        removeFocusSemanticOverlay()
        resetFocusThreadDiagnostics('cold-degraded')
        return
    }

    if ((appState.trailDepth ?? 0) >= 1 && (nav.walkHistoryIndices || []).length >= 0) {
        const reason = nav.lastTraversalReason || currentCandidate?.reason || 'nearby business relationship'
        const walkLength = (nav.walkHistoryIndices || []).length
        const stepNumber = walkLength + 1
        contextEl.textContent = `Stop ${stepNumber}: ${currentName}. Why here: ${reason}. Source: ${sourceLabel}. Use Prev to go back or Next to continue.`
        focusProgressEl.textContent = `Stop ${stepNumber} of ${neighborCount}`
        if (focusNextEl) {
            focusNextEl.textContent = nextWalkName
                ? `Next: ${nextWalkName} - ${nextWalkReason}.`
                : 'This exploration has no unseen visible stop left in the current slice.'
            if (nextWalkName) focusNextEl.title = focusNextEl.textContent!
            else focusNextEl.removeAttribute('title')
        }
    } else if (neighborCount === 0 && nav.threadSource === 'semantic') {
        contextEl.textContent = `Semantic connections exist around ${currentName}, but none survive the current slice. Broaden the view to see the record-backed relationship.`
        focusProgressEl.textContent = `No visible nearby records from ${currentName} in this slice.`
        if (focusNextEl) focusNextEl.textContent = 'No visible next stop in this filtered slice.'
    } else {
        const fallbackLeadIn =
            state.semanticThreadsStatus === 'loading'
                ? 'Semantic connections are still loading, so this is a temporary cloud fallback.'
                : 'Semantic relationship data is missing here, so this trail is using the current cloud as an approximate fallback.'
        const focusPocketMeta = (nav as any).focusPocketMeta
        const pocketNote =
            nav.threadSource === 'semantic' && focusPocketMeta?.active
                ? ` Focus lens is staging ${focusPocketMeta.nodeCount} related records as a ${focusPocketMeta.motifLabel || 'semantic constellation'} for readability; the links still come from the semantic trail.`
                : ''
        contextEl.textContent = `${neighborCount} candidate steps around ${currentName}. ${nav.threadSource === 'semantic' ? 'These come from record-backed relationships, and the bright spokes show the same links even when spacing stays approximate.' : fallbackLeadIn}${pocketNote} Use Prev / Next to continue.`
        focusProgressEl.textContent = neighborCount
            ? `${neighborCount} nearby ready from ${currentName}`
            : `Start with ${currentName}, then explore the neighborhood.`
        if (focusNextEl) {
            focusNextEl.textContent = nextWalkName
                ? `Next: ${nextWalkName} - ${nextWalkReason}.`
                : 'Choose a nearby business to continue the path.'
            if (nextWalkName) focusNextEl.title = focusNextEl.textContent!
            else focusNextEl.removeAttribute('title')
        }
    }

    updateFocusNeighborRail()
    updateWalkBreadcrumb(hasFocus)
    refreshFocusSemanticOverlay()
    updateFocusSemanticOverlayPositions()
}
