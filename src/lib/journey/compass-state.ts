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
    if (appState.focusState.selectedPoint) return appState.focusState.selectedPoint
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
    const cueBeat: string = appState.searchState.semanticTrailCue || 'idle'
    const focusedPoint = getFocusedJourneyPoint()
    const focusedName: string = focusedPoint ? formatBusinessName(focusedPoint.name || 'this business') : ''
    const summary = appState.searchState.currentSearchSummary as {
        query?: string
        dedupedResultCount?: number
        resultIndices?: unknown[]
        anchorIndex?: number
    } | null
    const queryLabel: string = summary?.query ? `"${summary.query}"` : 'search'
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
                    ? 'The connection trail is now projected onto physical streets. Return to Field view to explore more connections.'
                    : 'This is the geography layer — physical proximity between related businesses.',
            primaryAction: { label: 'Return to Field', action: JOURNEY_ACTIONS.OPEN_MYCELIUM },
            secondaryAction: isCountyMapOverview
                ? null
                : { label: 'County Reset', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW },
            tertiaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH }
        }
    }

    // M3 — explicit trail phase.
    // Previously the compass folded trail into 'focus', so JourneyCompass
    // could never show a 'trail' phase and the rail step highlight disagreed
    // with the journey-compass content. Emit 'trail' whenever the journey is
    // in trail mode or a trail is being walked (trailDepth > 0).
    const trailDepthVal: number = Number(appState.trailDepth || 0)
    const inTrailMode: boolean = appState.navState?.mode === 'trail' || trailDepthVal > 0

    // Dive wins: evaluate the inside-active (semantic dive) phase BEFORE
    // trail mode so a dive in progress emits 'inside' (Neighborhood kicker)
    // rather than 'trail' with a contradictory "Trail Step N" label.
    if (insideActive) {
        const focusIndex: number = Number.isFinite(appState.navState?.focusedIndex)
            ? appState.navState!.focusedIndex!
            : appState.focusedNode!
        const nextCandidate = getNextExploreCandidateForIndex(focusIndex, getNextWalkCandidateForIndex)
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

    if (inTrailMode) {
        const trailWalkIndices: readonly number[] = Array.isArray(appState.navState?.walkHistoryIndices)
            ? appState.navState!.walkHistoryIndices!
            : []
        const trailWalkLength: number = trailWalkIndices.length
        const trailClusterName: string = focusedPoint ? describeCluster(focusedPoint.cluster!) : 'Trail'
        return {
            phase: 'trail',
            kicker:
                trailWalkLength >= 1
                    ? `Trail Step ${trailWalkLength} | ${trailClusterName}`
                    : `Trail | ${trailClusterName}`,
            title: '',
            note: 'Follow the trail linking related Montgomery County businesses.',
            primaryAction: { label: 'Step Inside', action: JOURNEY_ACTIONS.ENTER_INSIDE },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: { label: 'County', action: JOURNEY_ACTIONS.COUNTY_OVERVIEW, hint: 'Exit trail' }
        }
    }

    if (hasFocus || isFocusing) {
        const walkHistory: readonly number[] = Array.isArray(appState.navState?.walkHistoryIndices)
            ? appState.navState!.walkHistoryIndices
            : appState.navState?.explorationHistoryIndices || []
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
            kicker: `Focus | ${clusterName}`,
            title: '',
            note: isSearchFocus
                ? 'The strongest match for this search.'
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
                ? 'Looking for related matches before building connections around your query.'
                : hasNoResults
                  ? 'Try a broader term or one of the suggested popular categories below.'
                  : 'The first strong match is the anchor. Center any listing to explore its local connections.',
            primaryAction: Number.isFinite(summary?.anchorIndex)
                ? { label: 'Center on anchor', action: JOURNEY_ACTIONS.CENTER_ANCHOR }
                : { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: null
        }
    }

    if (appState.searchState.currentEmptyQuery) {
        const label: string = `"${appState.searchState.currentEmptyQuery}"`
        return {
            phase: 'search',
            kicker: `Search | ${label}`,
            title: `No results for ${label}`,
            note: 'Try a broader term or one of the suggested popular categories below.',
            primaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
            secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
            tertiaryAction: null
        }
    }

    const idleNote = '8,406 Montgomery County businesses — search by what they do, not just where they are.'

    return {
        phase: 'overview',
        /* PR-K (2026-06-30): drop ' | Montgomery County' from the kicker
           and drop the 'The MoCo Mycelium' title. Both phrases repeated
           "Montgomery County" which the header description already
           provides ("See all 8,406 Montgomery County businesses in one
           view."). Net result: JourneyCompass now shows just "Overview"
           as the kicker and no title — matching the chip rail's active
           chip and letting the header description own the location copy. */
        kicker: 'Overview',
        title: '',
        note: idleNote,
        primaryAction: { label: 'Search', action: JOURNEY_ACTIONS.FOCUS_SEARCH },
        secondaryAction: { label: 'Map', action: JOURNEY_ACTIONS.OPEN_MAP },
        tertiaryAction: null
    }
}
