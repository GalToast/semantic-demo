import { appState } from '@lib/state/app.svelte.ts'
import { useSearchSummary } from '@lib/ui/use-search-summary.svelte'
import { hideViewHandoff } from '@lib/orchestration/view-controller'
import { debugWarn } from '@lib/utils/debug'
import { getRouteEmbodimentIndices } from './map-route-embodiment'

export interface TerrainHandoffOptions {
    routeCount?: number
    from?: string
    to?: string
    settleAfterMs?: number
    settlePhase?: string
}

export function getRouteDirectorState(): string {
    const search = useSearchSummary()
    if (appState.currentView === 'map') {
        return appState.focusState.selectedPoint ||
            (appState.focusedNode !== null && appState.focusedNode !== undefined)
            ? 'map-trail'
            : 'map-overview'
    }
    if (appState.semanticDiveMode && appState.focusedNode !== null && appState.focusedNode !== undefined)
        return 'inside-pocket'
    if (appState.focusedNode !== null && appState.focusedNode !== undefined) {
        if ((appState.navState.walkHistoryIndices || []).length > 1 || appState.navState.mode === 'trail')
            return 'thread-walk'
        return search.summary ? 'search-focus' : 'node-focus'
    }
    if (search.summary) return 'search-corridor'
    return 'overview'
}

export function syncRouteDirectorState(_reason = 'state'): string {
    const directorState = getRouteDirectorState()
    // NOTE: body.dataset writes removed. routeDirector is not used by CSS or JS readers.
    // If needed, add to parity-attrs.svelte.ts with journeyStore as source.
    return directorState
}

export function setTerrainHandoffState(phase = 'idle', options: TerrainHandoffOptions = {}): void {
    const normalizedPhase = String(phase || 'idle').replace(/[^a-z0-9-]/gi, '') || 'idle'
    const routeCount = Number.isFinite(options.routeCount) ? options.routeCount : getRouteEmbodimentIndices().length

    {
        appState.terrainHandoffState = {
            phase: normalizedPhase,
            from: options.from || appState.terrainHandoffState?.from || 'overview',
            to: options.to || appState.terrainHandoffState?.to || appState.currentView || 'galaxy',
            routeCount: routeCount!,
            startedAt: performance.now()
        }
    }

    // NOTE: body.dataset writes removed. parity-attrs.svelte.ts handles terrainHandoff sync.
    // The additional terrainHandoffFrom/To/RouteCount attrs are not used by CSS or JS readers.

    if (['idle', 'settled'].includes(normalizedPhase) && typeof hideViewHandoff === 'function') {
        hideViewHandoff()
    }

    if (appState.terrainHandoffTimer) {
        window.clearTimeout(appState.terrainHandoffTimer)
        appState.terrainHandoffTimer = null
    }

    if (Number.isFinite(options.settleAfterMs) && options.settleAfterMs! > 0) {
        // eslint-disable-next-line no-restricted-syntax -- raw setTimeout in dispose path: cleared via window.clearTimeout immediately below
        appState.terrainHandoffTimer = setTimeout(() => {
            const settlePhase = options.settlePhase || (appState.currentView === 'map' ? 'settled' : 'idle')
            setTerrainHandoffState(settlePhase, {
                routeCount,
                from: appState.terrainHandoffState.from,
                to: appState.terrainHandoffState.to
            })
        }, options.settleAfterMs)
    }
}
