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
import { toggleAutoRotate, exploreInsideToNextStop, returnToCountyView } from '@lib/orchestration/lifecycle'
import { search, getFirstSearchHit } from '@lib/search/state'
import { focusOnNode } from '@lib/engine/camera-choreography/cursor'
import { traverseNeighbor } from '@lib/journey/thread-settler'
import { setClusterFilter, clearClusterFilter } from '@lib/orchestration/cluster-filter-controller'
import { switchView } from '@lib/orchestration/view-controller'
import { setLegendOpen } from '@lib/stores/legend.svelte'

export type DemoStep = {
    phase: DemoPhase
    durationMs: number
    caption: string
    action: () => void | Promise<void>
}

/**
 * Read the first search hit's point index from the canonical search-state facade.
 * Re-exported here for the few demo files that haven't migrated to @lib/search/state.
 * @deprecated Prefer `import { getFirstSearchHit } from '@lib/search/state'`.
 */
export { getFirstSearchHit } from '@lib/search/state'

export const DEMO_SCRIPT: DemoStep[] = [
    {
        phase: 'OVERVIEW',
        durationMs: 4000,
        caption: '8,406 businesses across Montgomery County — as a living network.',
        action: () => {
            toggleAutoRotate()
        }
    },
    {
        phase: 'SEARCH',
        durationMs: 5000,
        caption: 'Search for any business type…',
        action: async () => {
            await search('coffee')
        }
    },
    {
        phase: 'FOCUS',
        durationMs: 4000,
        caption: '…and focus on one.',
        action: () => {
            // Turn off auto-rotate so the camera stays put on the focused node.
            toggleAutoRotate()
            const hit = getFirstSearchHit()
            if (hit !== null) {
                focusOnNode(hit)
            }
        }
    },
    {
        phase: 'THREADS',
        durationMs: 3000,
        caption: 'Every connection it has.',
        action: () => {
            // Threads auto-render on focus — just hold + caption.
        }
    },
    {
        phase: 'NEIGHBORS',
        durationMs: 4000,
        caption: 'Businesses that do similar things — by role.',
        action: () => {
            // Focus pocket auto-renders on focus — just hold + caption.
        }
    },
    {
        phase: 'TRAIL',
        durationMs: 5000,
        caption: 'Follow a thread to its source…',
        action: () => {
            traverseNeighbor(1)
        }
    },
    {
        phase: 'DIVE',
        durationMs: 4000,
        caption: '…or dive inside a whole cluster.',
        action: () => {
            exploreInsideToNextStop()
        }
    },
    {
        phase: 'FILTER',
        durationMs: 4000,
        caption: 'Filter the county to one kind of business.',
        action: () => {
            returnToCountyView()
            setClusterFilter(0)
        }
    },
    {
        phase: 'MAP',
        durationMs: 5000,
        caption: 'See where they actually are.',
        action: () => {
            switchView('map')
            setLegendOpen(true)
        }
    },
    {
        phase: 'RETURN',
        durationMs: 3000,
        caption: 'Now explore your way.',
        action: () => {
            switchView('galaxy')
            clearClusterFilter()
            setLegendOpen(false)
            toggleAutoRotate()
        }
    }
]
