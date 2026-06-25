/**
 * journey-bindings.ts
 * Canonical location (ported from js/modules/bindings/journey-bindings.ts — W15).
 * Journey navigation, focus controls, thread inspector, and compass delegation.
 */

import { appState as _state } from '@lib/state/app.svelte'
const state = _state
import { bindClick } from '@lib/ui/view-bindings'
import { executeJourneyCompassAction } from '@lib/orchestration/compass-controller'
import { setSemanticDiveMode, resetExplorationFocus, exploreInsideToNextStop } from '@lib/orchestration/lifecycle'
import { pinThreadNeighbor, pinFirstAvailableNeighbor, unpinThreadInspection } from '@lib/journey/thread-inspector'
import { walkThreadNeighbor } from '@lib/journey/thread-settler'
import { traverseNeighbor } from '@lib/journey/thread-settler-adapter'
import { applyLocalNeighborhoodFocus } from '@lib/journey/focus-pocket'
import { animateCameraToNode } from '@lib/engine/camera-choreography'
import { clearClusterFilter } from '@lib/orchestration/cluster-filter-controller'
import { showExperienceToast } from '@lib/ui/ui-feedback'

let _journeyAbortController: AbortController | null = null

export function disposeJourneyBindings(): void {
    _journeyAbortController?.abort()
    _journeyAbortController = null
    state.registeredEvents.clear()
}

export function expandNeighborhoodFromCurrentNode(): void {
    const index = state.focusedNode
    if (!Number.isFinite(index)) return
    applyLocalNeighborhoodFocus(index)
}

export function recenterFocusedNode(): void {
    const index = state.focusedNode
    if (!Number.isFinite(index)) return
    animateCameraToNode(index, { transitionStyle: 'focus' })
}

function resetCountyOverview(): void {
    const actions = (
        window as unknown as {
            __APP_ACTIONS__?: {
                resetExplorationFocus?: (options?: { preserveSearch?: boolean }) => void
            }
        }
    ).__APP_ACTIONS__
    if (typeof actions?.resetExplorationFocus === 'function') {
        actions.resetExplorationFocus({ preserveSearch: false })
        return
    }
    resetExplorationFocus({ preserveSearch: false })
}

export function returnToCountyView(): void {
    resetCountyOverview()
}

interface ClickEvent extends MouseEvent {
    currentTarget: HTMLElement
}

export function bindFocusControls(): void {
    const runJourneyCompassAction = (action: string | undefined): void => {
        if (action) {
            executeJourneyCompassAction(action)
        }
    }
    const stopThreadActionPointer = (id: string): void => {
        const element = document.getElementById(id)
        if (!element) return
        const stop = (event: Event) => {
            event.stopPropagation()
            event.stopImmediatePropagation?.()
        }
        element.onpointerdown = stop
        element.onpointerup = stop
        element.onmousedown = stop
        element.onmouseup = stop
        element.ontouchstart = stop
        element.ontouchend = stop
    }

    bindClick('btn-focus-prev', () => {
        traverseNeighbor(-1)
    })
    bindClick('btn-focus-next', () => {
        traverseNeighbor(1)
    })
    bindClick(
        'btn-focus-overview',
        () => {
            resetCountyOverview()
        },
        { optional: true }
    )
    bindClick('btn-focus-center', (event?: MouseEvent) => {
        // The button is rendered with aria-disabled (not the native
        // disabled attribute) so the title tooltip stays hoverable; the
        // click is a no-op when there is nothing to recenter onto.
        const e = event as ClickEvent | undefined
        if (e?.currentTarget?.getAttribute('aria-disabled') === 'true') return
        recenterFocusedNode()
    })
    bindClick(
        'btn-focus-expand',
        () => {
            expandNeighborhoodFromCurrentNode()
        },
        { optional: true }
    )
    bindClick('btn-focus-dive', () => {
        setSemanticDiveMode(!state.semanticDiveMode)
    })
    bindClick(
        'btn-inside-next',
        () => {
            if (typeof exploreInsideToNextStop === 'function') exploreInsideToNextStop()
        },
        { optional: true }
    )
    bindClick(
        'btn-inside-map',
        () => {
            runJourneyCompassAction('open-map')
        },
        { optional: true }
    )
    bindClick(
        'btn-inside-county',
        () => {
            if (typeof returnToCountyView === 'function') returnToCountyView()
        },
        { optional: true }
    )
    bindClick('btn-journey-primary', (event?: MouseEvent) => {
        const e = event as ClickEvent | undefined
        if (e?.currentTarget?.getAttribute('aria-disabled') === 'true') return
        runJourneyCompassAction(e?.currentTarget?.dataset?.journeyAction)
    })
    bindClick('btn-journey-secondary', (event?: MouseEvent) => {
        const e = event as ClickEvent | undefined
        if (e?.currentTarget?.getAttribute('aria-disabled') === 'true') return
        runJourneyCompassAction(e?.currentTarget?.dataset?.journeyAction)
    })
    bindClick('btn-journey-tertiary', (event?: MouseEvent) => {
        const e = event as ClickEvent | undefined
        if (e?.currentTarget?.getAttribute('aria-disabled') === 'true') return
        runJourneyCompassAction(e?.currentTarget?.dataset?.journeyAction)
    })

    // 10/10 Polish: Thread Inspector stable bindings
    bindClick('btn-thread-pin', () => {
        const index = state.inspectedThreadIndex
        if (!Number.isFinite(index)) return
        if (state.pinnedThreadIndex === index) {
            unpinThreadInspection()
        } else {
            // W7-C fix: when the inspected index is the focused node itself,
            // pinThreadNeighbor returns active:false (a node cannot inspect
            // its own thread). Fall back to the first available neighbor.
            if (index !== state.focusedIndex) {
                pinThreadNeighbor(index, { surface: 'pinned' })
            } else {
                pinFirstAvailableNeighbor({ surface: 'pinned' })
            }
        }
    })

    stopThreadActionPointer('btn-thread-pin')
    stopThreadActionPointer('btn-thread-follow')
    stopThreadActionPointer('btn-thread-clear')

    bindClick('btn-thread-follow', (event?: MouseEvent) => {
        event?.preventDefault()
        event?.stopPropagation()
        const index = state.inspectedThreadIndex
        if (!Number.isFinite(index)) return
        const phase = state.strandContinuityState?.phase
        if (index === state.navState.focusedIndex || phase === 'exploring') return
        const activeSurface = (document.body as HTMLElement).dataset.threadInspectSurface
        walkThreadNeighbor(index, { surface: activeSurface && activeSurface !== 'idle' ? activeSurface : 'rail' })
    })

    bindClick('btn-thread-clear', () => {
        unpinThreadInspection()
    })

    const actionMap: Record<string, string> = {
        overview: 'county-overview',
        search: 'focus-search',
        focus: 'center-anchor',
        inside: 'enter-inside',
        map: 'open-map'
    }

    if (!(document.body as HTMLElement)?.dataset.journeyCompassStepDelegated) {
        _journeyAbortController = new AbortController()
        document.addEventListener(
            'click',
            (event: MouseEvent) => {
                const step = (event.target as HTMLElement)?.closest?.('.journey-compass-step') as HTMLElement | null
                if (!step) return
                const action = actionMap[step.dataset.journeyStep || '']
                if (action) {
                    executeJourneyCompassAction(action)
                }
            },
            { signal: _journeyAbortController.signal }
        )
        document.addEventListener(
            'keydown',
            (event: KeyboardEvent) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                const step = (event.target as HTMLElement)?.closest?.('.journey-compass-step') as HTMLElement | null
                if (!step) return
                event.preventDefault()
                const action = actionMap[step.dataset.journeyStep || '']
                if (action) {
                    executeJourneyCompassAction(action)
                }
            },
            { signal: _journeyAbortController.signal }
        )
        if (document.body) (document.body as HTMLElement).dataset.journeyCompassStepDelegated = 'true'
    }

    bindClick(
        'btn-explore-network',
        () => {
            // Network explorer: navigate to first cluster neighborhood if none active,
            // or clear the cluster filter to return to county overview.
            if (state.activeClusterFilter !== null) {
                if (typeof clearClusterFilter === 'function') clearClusterFilter()
            } else {
                const clusterList = document.getElementById('cluster-list')
                const firstClusterBtn = clusterList?.querySelector('[data-cluster]') as HTMLElement | null
                if (firstClusterBtn) {
                    firstClusterBtn.click()
                } else {
                    showExperienceToast(
                        'Network explorer',
                        'No semantic neighborhoods available in the current filter.'
                    )
                }
            }
        },
        { optional: true }
    )
}
