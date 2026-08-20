/**
 * @lib/demo/demo-script.ts — Phase driver for the full-featured auto-demo showcase
 *
 * Pure per-phase action functions + the 10-step DEMO_SCRIPT array. No state
 * mutation beyond calling the orchestrators listed in the spec. The driver
 * in DemoChoreography.svelte iterates this array, calls transitionDemo()
 * for each step, fires step.action() (awaiting if async), and schedules
 * the next step after step.durationMs.
 */
import type { DemoPhase } from '@lib/stores/demo.svelte.ts'
import { demoPhase, getDemoLifecycleSignal, isDemoActive } from '@lib/stores/demo.svelte.ts'
import { toggleAutoRotate, exploreInsideToNextStop, returnToCountyView } from '@lib/orchestration/lifecycle'
import { search, getFirstSearchHit } from '@lib/search/state'
import { focusOnNode } from '@lib/engine/camera-choreography/cursor'
import { traverseNeighbor } from '@lib/journey/thread-settler'
import { setClusterFilter, clearClusterFilter } from '@lib/orchestration/cluster-filter-controller'
import { switchView } from '@lib/orchestration/view-controller'
import { getBusinessRecords } from '@lib/data-store'
import { setLegendOpen } from '@lib/stores/legend.svelte'
import { appState } from '@lib/state/app.svelte.ts'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

export type DemoStep = {
    phase: DemoPhase
    durationMs: number
    caption: () => string
    action: () => void | Promise<void>
}


/**
 * Poll getFirstSearchHit() until a hit appears or the cap expires. The demo's
 * SEARCH phase awaits its action (bounded), but in slow envs the search may
 * still be settling when FOCUS runs — this holds FOCUS until the state is real.
 */
export async function waitForSearchHit(timeoutMs: number): Promise<number | null> {
    const deadline = Date.now() + timeoutMs
    const entryPhase = demoPhase()
    const lifecycleSignal = getDemoLifecycleSignal()
    while (Date.now() < deadline) {
        if (!isDemoActive()) return null
        if (demoPhase() !== entryPhase) return null
        const hit = getFirstSearchHit()
        if (hit !== null) return hit
        const _pollReg = new DisposableRegistry({ label: 'demo-wait-for-search' })
        await new Promise<void>((r) => {
            let settled = false
            let timer: ReturnType<typeof setTimeout> | null = null
            const finish = () => {
                if (settled) return
                settled = true
                if (timer !== null) clearTimeout(timer)
                _pollReg.disposeAll()
                lifecycleSignal?.removeEventListener('abort', finish)
                r()
            }
            timer = _pollReg.schedule(250, finish)
            if (lifecycleSignal) {
                if (lifecycleSignal.aborted) finish()
                else lifecycleSignal.addEventListener('abort', finish, { once: true })
            }
        })
        if (lifecycleSignal?.aborted) return null
        if (!isDemoActive()) return null
        if (demoPhase() !== entryPhase) return null
    }
    if (!isDemoActive()) return null
    if (demoPhase() !== entryPhase) return null
    return getFirstSearchHit()
}

export const DEMO_SCRIPT: DemoStep[] = [
    {
        phase: 'OVERVIEW',
        durationMs: 4000,
        // NOTE: display-dead — DemoChoreography renders its own phaseLabels,
        // not step.caption (drift hazard). Kept count-neutral here so this
        // copy can't lie about corpus size.
        caption: () => {
            const count = getBusinessRecords().length
            return count > 0
                ? `${count.toLocaleString()} businesses across Montgomery County — as a living network.`
                : 'Montgomery County businesses — as a living network.'
        },
        action: () => {
            toggleAutoRotate()
        }
    },
    {
        phase: 'SEARCH',
        durationMs: 5000,
        caption: () => 'Search for any business type…',
        action: async () => {
            await search('coffee')
        }
    },
    {
        phase: 'FOCUS',
        durationMs: 4000,
        caption: () => '…and focus on one.',
        action: async () => {
            // Turn off auto-rotate so the camera stays put on the focused node.
            toggleAutoRotate()
            // Poll for the first search hit: the search can settle slowly in
            // split-origin test envs (API fetch queued behind big data
            // downloads), so SEARCH's await bound may pass before results
            // land. Hold here until a hit appears (or the cap expires) so the
            // caption never claims a focus that hasn't happened.
            const hit = await waitForSearchHit(25000)
            if (hit !== null) {
                focusOnNode(hit)
            }
        }
    },
    {
        phase: 'THREADS',
        durationMs: 3000,
        caption: () => 'Every connection it has.',
        action: () => {
            // Threads auto-render on focus — just hold + caption.
        }
    },
    {
        phase: 'NEIGHBORS',
        durationMs: 4000,
        caption: () => 'Businesses that do similar things — by role.',
        action: () => {
            // Focus pocket auto-renders on focus — just hold + caption.
        }
    },
    {
        phase: 'TRAIL',
        durationMs: 5000,
        caption: () => 'Follow a thread to its source…',
        action: () => {
            traverseNeighbor(1)
        }
    },
    {
        phase: 'DIVE',
        durationMs: 4000,
        caption: () => '…or dive inside a whole cluster.',
        action: () => {
            exploreInsideToNextStop()
        }
    },
    {
        phase: 'FILTER',
        durationMs: 4000,
        caption: () => 'Filter the county to one kind of business.',
        action: () => {
            returnToCountyView()
            // Filter to the FOCUSED node's own cluster (guaranteed non-empty) —
            // hardcoding cluster 0 could filter to nothing if that cluster is
            // sparse/absent in the loaded corpus.
            const focusedIndex = appState.navState.focusedIndex
            const focusedPoint =
                focusedIndex !== null && Array.isArray(appState.points) ? appState.points[focusedIndex] : undefined
            const cluster = typeof focusedPoint?.cluster === 'number' ? focusedPoint.cluster : 0
            setClusterFilter(cluster)
        }
    },
    {
        phase: 'MAP',
        durationMs: 5000,
        caption: () => 'See where they actually are.',
        action: () => {
            switchView('map')
            setLegendOpen(true)
        }
    },
    {
        phase: 'RETURN',
        durationMs: 3000,
        caption: () => 'Now explore your way.',
        action: () => {
            switchView('galaxy')
            clearClusterFilter()
            setLegendOpen(false)
            toggleAutoRotate()
        }
    }
]
