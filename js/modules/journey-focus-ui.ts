/**
 * journey-focus-ui.ts
 *
 * TypeScript shadow of journey-focus-ui.js
 * Focus/traversal DOM UI, neighbor rail rendering, and walk breadcrumb internals.
 */

import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus'
import { formatBusinessName, escapeHtml, cleanOptionalValue } from './utils/dom-formatters.ts'
import { isCompactFocusStageViewport } from './utils/ui-presentation.ts'
import { isPointVisible } from './utils/geo-data.ts'
import { truncateMicrocopy } from './journey-text-helpers.ts'
import { setStrandContinuityState } from './strand-continuity.ts'
import { summarizeNeighborReason, walkThreadNeighbor } from './journey-thread-settler.ts'
import { inspectThreadNeighbor, pinThreadNeighbor, clearThreadInspection } from './thread-inspector.ts'
import { getCurrentTrailFocusIndex, getNextWalkCandidateForIndex } from './journey-neighborhood.ts'
import { ensureCanvasNodeInteractionBindings } from './journey-canvas-interaction.ts'
import { focusOnNode } from '@lib/engine/camera-choreography'
import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from './lifecycle.ts'
import {
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics
} from './journey-webgl.ts'
import { isCompactLandscape, isUltraCompactPortrait } from '@lib/utils/environment'
import { getRelationshipRoleLabel, normalizeRelationshipRole } from '@lib/utils/relationship-roles'
import type { RelationshipRole } from '@lib/utils/relationship-roles'
import type { Point, StrandContinuityState } from '@lib/state/state-types'
import { state } from '@lib/engine/state-bridge'
import { appState } from '@lib/state/app.svelte'

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
    const surface: string | undefined = (document.body as any)?.dataset?.panelSurface
    if (surface !== 'focus' && surface !== 'focus-search') return false
    if ((document.body as any)?.dataset?.focusPanelMode === 'field-node') return false
    const threadSurface: string | undefined = (document.body as any)?.dataset?.threadInspectSurface
    if (threadSurface && threadSurface !== 'idle') return false
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches
}

function shouldSuppressSelectedBusinessNeighborRail(): boolean {
    if (typeof document === 'undefined') return false
    const surface: string | undefined = (document.body as any)?.dataset?.panelSurface
    if (surface !== 'focus' && surface !== 'focus-search') return false
    if ((document.body as any)?.dataset?.focusPanelMode === 'field-node') return false
    const threadSurface: string | undefined = (document.body as any)?.dataset?.threadInspectSurface
    if (threadSurface && threadSurface !== 'idle') return false
    const shortLandscapeFocusViewport: boolean =
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

    const threadInspectSurface: string | undefined = (document.body as any)?.dataset?.threadInspectSurface
    const threadInspectorOwnsSurface: boolean = !!threadInspectSurface && threadInspectSurface !== 'idle'
    if (threadInspectorOwnsSurface) {
        rail.classList.remove('active')
        rail.hidden = true
        rail.setAttribute('aria-hidden', 'true')
        list.innerHTML = ''
        if (countEl) countEl.textContent = '0 visible neighbors'
        return
    }

    rail.hidden = false
    rail.setAttribute('aria-hidden', 'false')

    if (!Number.isFinite(appState.navState?.focusedIndex) || hasColdDegradedSemanticFallback()) {
        rail.classList.remove('active')
        list.innerHTML = ''
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
        list.innerHTML = ''
        if (countEl) countEl.textContent = '0 visible neighbors'
        return
    }

    const candidateLimit: number = shouldUseSingleNeighborFocusRail()
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
        list.innerHTML = '<div class="empty-state">No neighboring stops found in this area.</div>'
        if (countEl) countEl.textContent = '0 visible neighbors'
        clearThreadInspection({
            force: true,
            preserveJourney: ['exploring', 'arrived'].includes(
                (appState.strandContinuityState as StrandContinuityState).phase
            )
        })
        return
    }

    list.innerHTML = ''
    if (countEl) {
        const source: string = candidates.length === 1 ? 'neighbor' : 'neighbors'
        countEl.textContent = `${candidates.length} visible ${source}`
    }

    candidates.forEach((candidate: any, order: number) => {
        const points = appState.points!
        const point: Point | null =
            Number.isFinite(candidate.index) && candidate.index >= 0 && candidate.index < points.length
                ? (points[candidate.index] as Point)
                : null
        const button = document.createElement('button')
        button.className = 'focus-stage-neighbor-pill' + (order === 0 ? ' is-next-stop' : '')
        button.type = 'button'
        button.tabIndex = 0
        button.dataset.index = String(candidate.index)
        button.dataset.role = (nav as any).focusPocketRoleByIndex?.get(candidate.index) || 'trail'
        const relationshipRole: RelationshipRole = normalizeRelationshipRole(candidate.relationshipRole)
        button.dataset.relationshipRole = relationshipRole
        button.dataset.reason = candidate.reason || 'semantic neighbor'
        const name: string = formatBusinessName((point as Point)?.name || 'Nearby business')
        const city: string = cleanOptionalValue((point as Point)?.city) || 'Montgomery County'
        const focusIdx = nav.focusedIndex
        const focusPoint: Point | null =
            Number.isFinite(focusIdx) && focusIdx! >= 0 && focusIdx! < points.length
                ? (points[focusIdx!] as Point)
                : null
        const reason: string = summarizeNeighborReason(candidate, point, focusPoint)
        const relationshipLabel: string = getRelationshipRoleLabel(relationshipRole, 'rail')
        const relationshipTitle: string = getRelationshipRoleLabel(relationshipRole, 'title')
        const reasonLabel: string = isCompactFocusStageViewport()
            ? truncateMicrocopy(reason, 58)
            : `${truncateMicrocopy(reason, 72)} | ${city}`
        const ariaLabel: string =
            order === 0 ? `Next stop: ${name}. ${relationshipTitle}.` : `Explore ${name}: ${relationshipTitle}.`
        button.setAttribute('aria-label', ariaLabel)
        const nextStopBadge: string =
            order === 0 ? '<span class="focus-stage-neighbor-next-stop-badge">Next stop</span>' : ''
        button.innerHTML = `
            <span class="focus-stage-neighbor-main">
                <span class="focus-stage-neighbor-index">${String(order + 1).padStart(2, '0')}</span>
                <span class="focus-stage-neighbor-copy">
                    <span class="focus-stage-neighbor-name">${escapeHtml(name)} <span class="focus-stage-neighbor-role">${escapeHtml(relationshipLabel)}</span>${nextStopBadge}</span>
                    <span class="focus-stage-neighbor-reason">${escapeHtml(reasonLabel)}</span>
                </span>
            </span>
            <span class="focus-stage-neighbor-actions" aria-label="Strand actions">
                <button class="focus-stage-neighbor-action" type="button" data-neighbor-action="inspect" aria-label="Inspect connection">Inspect</button>
                <button class="focus-stage-neighbor-action primary" type="button" data-neighbor-action="pin" aria-label="Pin connection">Pin</button>
            </span>
        `
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
    const history: number[] = ((appState.navState?.walkHistoryIndices || []) as number[])
        .filter((index: number) => Number.isFinite(index) && points[index])
        .filter(
            (index: number, order: number, list: number[]) => list.indexOf(index) === order || order === list.length - 1
        )

    if (!hasFocus || history.length <= 1) {
        breadcrumb.hidden = true
        breadcrumb.classList.remove('visible')
        breadcrumb.innerHTML = ''
        return
    }

    breadcrumb.hidden = false
    breadcrumb.classList.add('visible')
    breadcrumb.innerHTML = `
        <span class="walk-breadcrumb-label">Trail</span>
        ${history
            .map((index: number, order: number) => {
                const point = points[index]
                const name: string = formatBusinessName(point?.name || 'Stop')
                const isCurrent = order === history.length - 1
                return `
                <button class="walk-breadcrumb-chip${isCurrent ? ' current' : ''}" type="button"
                    data-walk-index="${index}" data-walk-order="${order}"
                    ${isCurrent ? 'aria-current="step"' : ''}
                    aria-label="${escapeHtml(isCurrent ? `Current stop: ${name}` : `Return to ${name}`)}">
                    ${escapeHtml(name)}
                </button>
            `
            })
            .join('<span class="walk-breadcrumb-sep" aria-hidden="true">/</span>')}
    `

    breadcrumb.querySelectorAll('.walk-breadcrumb-chip:not(.current)').forEach((chip: Element) => {
        const chipBtn = chip as HTMLButtonElement
        chipBtn.onclick = () => {
            const targetIndex = Number(chipBtn.dataset.walkIndex)
            const targetOrder = Number(chipBtn.dataset.walkOrder)
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
            })
        }
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
    const currentFocusPoint: Point | null =
        appState.currentView === 'map'
            ? appState.selectedPoint
            : Number.isFinite(nav.focusedIndex)
              ? (points[nav.focusedIndex!] ?? null)
              : null
    const hasFocus: boolean = !!currentFocusPoint
    const neighborCount: number = nav.trailNeighborIndices?.length ?? 0
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

    const canGoBack: boolean = (nav.walkHistoryIndices || []).length > 1
    ;[prevBtn, focusPrevBtn].forEach((btn) => {
        if (!btn) return
        btn.disabled = !canGoBack
        btn.setAttribute('aria-disabled', String(!canGoBack))
        if (!canGoBack) btn.title = 'No previous stops in this walk history'
        else btn.removeAttribute('title')
    })
    ;[nextBtn, focusNextBtn].forEach((btn) => {
        if (!btn) return
        const noNext: boolean = neighborCount === 0
        btn.disabled = noNext
        btn.setAttribute('aria-disabled', String(noNext))
        if (noNext) btn.title = 'No nearby stops to continue to'
        else btn.removeAttribute('title')
    })

    const currentName: string = formatBusinessName(currentFocusPoint?.name || 'this business')
    const currentCandidate =
        nav.mode === 'trail' && nav.trailCursor >= 0 && neighborCount > 0 ? nav.threadCandidates[nav.trailCursor] : null
    const sourceLabel: string =
        nav.threadSource === 'semantic' ? 'semantic thread' : 'approximate cloud projection fallback'
    const currentIndexForWalk = nav.focusedIndex ?? getCurrentTrailFocusIndex()
    const nextWalkCandidate = getNextWalkCandidateForIndex(currentIndexForWalk ?? 0)
    const nextWalkPoint = nextWalkCandidate ? points[nextWalkCandidate.index] : null
    const nextWalkName: string | null = nextWalkPoint ? formatBusinessName(nextWalkPoint.name || 'next business') : null
    const nextWalkReason: string = nextWalkCandidate
        ? summarizeNeighborReason(nextWalkCandidate, nextWalkPoint, currentFocusPoint)
        : ''
    if (focusRouteEl)
        focusRouteEl.dataset.state = neighborCount ? (nav.mode === 'trail' ? 'walking' : 'ready') : 'empty'

    if (coldDegradedNoRail) {
        const queryLabel: string = (appState.semanticLaneSnapshot as any)?.query
            ? `"${(appState.semanticLaneSnapshot as any).query}"`
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
        const reason: string = nav.lastTraversalReason || currentCandidate?.reason || 'nearby business relationship'
        const walkLength: number = (nav.walkHistoryIndices || []).length
        const stepNumber: number = walkLength + 1
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
        const fallbackLeadIn: string =
            state.semanticThreadsStatus === 'loading'
                ? 'Semantic connections are still loading, so this is a temporary cloud fallback.'
                : 'Semantic relationship data is missing here, so this trail is using the current cloud as an approximate fallback.'
        const focusPocketMeta = (nav as any).focusPocketMeta
        const pocketNote: string =
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
