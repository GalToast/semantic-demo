/**
 * @lib/journey/compass-state.ts
 *
 * Ported from:
 * Journey compass state machine and action synthesis.
 */

import { formatBusinessName } from '@lib/utils/dom-formatters'
import { describeCluster } from '@lib/utils/ui-presentation'
import { getNextExploreCandidateForIndex } from './thread-model'
import { getNextWalkCandidateForIndex } from './lifecycle-adapter'
import type { Point } from '@lib/state/state-types'
import { appState } from '@lib/state/app.svelte'

let routeEmbodimentReader: () => unknown[] = () => []

export function registerRouteEmbodimentReader(fn: () => unknown[]): void {
    routeEmbodimentReader = fn
}

export const JOURNEY_ACTIONS = Object.freeze({
    FOCUS_SEARCH: 'focus-search',
    CENTER_ANCHOR: 'center-anchor',
    ENTER_INSIDE: 'enter-inside',
    SHOW_TRAIL_PANEL: 'show-trail-panel',
    NEXT_STOP: 'next-stop',
    OPEN_MAP: 'open-map',
    OPEN_MYCELIUM: 'open-mycelium',
    COUNTY_OVERVIEW: 'county-overview'
} as const)

export function getFocusedJourneyPoint(): Point | null {
    if (appState.selectedPoint) return appState.selectedPoint
    if (Number.isFinite(appState.focusedNode) && appState.points) return appState.points[appState.focusedNode!] || null
    if (Number.isFinite(appState.navState?.focusedIndex) && appState.points)
        return appState.points[appState.navState!.focusedIndex!] || null
    return null
}

export interface CompassAction {
    label: string
    action: string
    hint?: string
}

export interface CompassState {
    phase: string
    kicker: string
    title: string
    note: string
    primaryAction: CompassAction
    secondaryAction: CompassAction | null
    tertiaryAction: CompassAction | null
}

// ── Back-compat aliases ────────────────────────────────────────────────────────
// Kept after the W46-T3 cleanup of orchestration/compass-state.ts. Any code
// that previously imported these names from the legacy stub continues to
// work. Safe to remove in a future pass once no consumers reference them.
export type CompassStateContext = CompassState
export type { CompassStatus, JourneyAction } from '@lib/stores/compass.svelte.ts'

export function getJourneyCompassState(): CompassState {
    const cueBeat: string = appState.semanticTrailCue || 'idle'
    const focusedPoint = getFocusedJourneyPoint()
    const focusedName: string = focusedPoint ? formatBusinessName(focusedPoint.name || 'this business') : ''
    const summary = appState.currentSearchSummary as Record<string, unknown> | null
    const queryLabel: string = summary?.query ? `"${summary.query}"` : 'semantic search'
    const isSearching: boolean = cueBeat === 'searching'
    const isFocusing: boolean = cueBeat === 'focusing'
    const hasSearch: boolean = !!summary || isSearching
    const hasFocus: boolean = !!focusedPoint
    const insideActive: boolean = !!(appState.semanticDiveMode && appState.currentView === 'galaxy' && hasFocus)

    if (appState.currentView === 'map') {
        const routeCount: number = routeEmbodimentReader().length
        const isCountyMapOverview: boolean = !hasFocus && !hasSearch && Number(appState.trailDepth || 0) === 0
        return {
            phase: 'map',
            kicker: routeCount > 1 ? 'Map | Terrain Bridge' : 'Map | Physical Distance',
            title: hasFocus ? `${focusedName} pinned to map` : 'Montgomery County Map',
            note:
                routeCount > 1
                    ? 'The connection trail is now projected onto physical streets. Return to Mycelium to lift back into the living network.'
                    : 'This is the geography layer: physical proximity after semantic similarity.',
            primaryAction: { label: 'Return to Mycelium', action: JOURNEY_ACTIONS.OPEN_MYCELIUM },
            secondaryAction: isCountyMapOverview
                ? null
                : { label: 'County Reset', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW },
            tertiaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH }
        }
    }

    if (insideActive) {
        const focusIndex: number = Number.isFinite(appState.navState?.focusedIndex)
            ? appState.navState!.focusedIndex!
            : appState.focusedNode!
        const nextCandidate = getNextExploreCandidateForIndex(
            focusIndex,
            getNextWalkCandidateForIndex as (index: number) => number | null
        )
        const pts = appState.points!
        const nextPointCandidate = nextCandidate ? (pts[nextCandidate.index] ?? null) : null
        const nextPoint = nextPointCandidate as Point | null
        const clusterName: string = focusedPoint ? describeCluster(focusedPoint.cluster!) : 'Neighborhood'

        return {
            phase: 'inside',
            kicker: `Neighborhood | ${clusterName}`,
            title: '',
            note: nextPoint
                ? `Next stop: "${formatBusinessName(nextPoint.name || 'the next linked stop')}".`
                : 'Pick another match or return to County.',
            primaryAction: nextPoint
                ? { label: 'Follow Connection', action: JOURNEY_ACTIONS.NEXT_STOP }
                : { label: 'End of Trail', action: JOURNEY_ACTIONS.SHOW_TRAIL_PANEL },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: { label: 'County View', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW, hint: 'Exit trail' }
        }
    }

    if (hasFocus || isFocusing) {
        const walkHistory: number[] = Array.isArray(appState.navState?.walkHistoryIndices)
            ? appState.navState!.walkHistoryIndices
            : appState.navState?.explorationHistoryIndices || []
        const walkHistoryLength: number = walkHistory.length
        const walkDepth: number = Math.max(0, walkHistory.length - 1)
        const isSearchFocus: boolean = !!summary && walkDepth === 0
        const isSearchAnchor: boolean = !!(
            summary &&
            Number.isFinite(summary.anchorIndex) &&
            appState.focusedNode === summary.anchorIndex
        )
        const isTrailStop: boolean =
            walkDepth > 0 || (appState.navState?.mode === 'trail' && (appState.trailDepth ?? 0) >= 1 && !isSearchAnchor)
        const hasAnchor: boolean = !!summary
        const clusterName: string = focusedPoint ? describeCluster(focusedPoint.cluster!) : 'Focus'

        // eslint-disable-next-line no-useless-assignment -- branches below overwrite in every reachable case; null is just a TS strict-mode placeholder.
        let primaryAction: CompassAction | null = null
        // eslint-disable-next-line no-useless-assignment -- branches below overwrite in every reachable case; null is just a TS strict-mode placeholder.
        let secondaryAction: CompassAction | null = null
        let tertiaryAction: CompassAction | null = null

        if (isSearchAnchor) {
            primaryAction = { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE }
            secondaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP }
            tertiaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW }
        } else if (isTrailStop) {
            primaryAction = { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE }
            secondaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP }
            tertiaryAction = hasAnchor
                ? {
                      label: 'Center on anchor',
                      action: JOURNEY_ACTIONS.CENTER_ANCHOR,
                      hint: 'Return to search starting point'
                  }
                : { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW }
        } else {
            primaryAction = { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP }
            secondaryAction = { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW }
        }

        return {
            phase: 'focus',
            kicker:
                walkHistoryLength > 1 ? `Trail Step ${walkHistoryLength} | ${clusterName}` : `Focus | ${clusterName}`,
            title: '',
            note: isSearchFocus
                ? 'The strongest semantic match for this search.'
                : 'A local constellation of related businesses. Hover any glowing connection to see why it exists.',
            primaryAction,
            secondaryAction,
            tertiaryAction
        }
    }

    if (hasSearch) {
        const resultCount: number = summary?.dedupedResultCount ?? summary?.resultIndices?.length ?? 0
        const hasNoResults: boolean = !isSearching && !!summary && resultCount === 0
        return {
            phase: 'search',
            kicker: isSearching ? 'Searching the Field' : `Search | ${queryLabel}`,
            title: isSearching
                ? `Finding ${queryLabel}...`
                : hasNoResults
                  ? `No results for ${queryLabel}`
                  : `Found ${resultCount} ${resultCount === 1 ? 'spot' : 'spots'} for ${queryLabel}`,
            note: isSearching
                ? 'Looking for semantic anchors before gathering the trail around your query.'
                : hasNoResults
                  ? 'Try a broader term or one of the suggested high-signal categories below.'
                  : 'The first strong match is the anchor. Center any record to enter its local neighborhood.',
            primaryAction: Number.isFinite(summary?.anchorIndex)
                ? { label: 'Center on anchor', action: JOURNEY_ACTIONS.CENTER_ANCHOR }
                : { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: null
        }
    }

    if (appState.currentEmptyQuery) {
        const label: string = `"${appState.currentEmptyQuery}"`
        return {
            phase: 'search',
            kicker: `Search | ${label}`,
            title: `No results for ${label}`,
            note: 'Try a broader term or one of the suggested high-signal categories below.',
            primaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: null
        }
    }

    const idleNote = 'Start wide, then search by need or clue to open one trail through the network.'

    return {
        phase: 'overview',
        kicker: 'Overview | Montgomery County',
        title: 'The MoCo Mycelium',
        note: idleNote,
        primaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
        secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
        tertiaryAction: null
    }
}
