/**
 * @lib/orchestration/parity/parity-context.ts
 *
 * Context bundle + resolver for computeParityAttributes().
 * Extracted from parity-attrs.svelte.ts (2026-06-28) following the
 * neighborhood.ts decomposition template (commit 300906d9).
 *
 * The 11 store reads + the legacy window.__APP_STATE__ cast live HERE —
 * one place, greppable. The cast is intentionally isolated so future
 * cleanup can target a single file.
 */

import { get } from 'svelte/store'
import { navStore } from '@lib/stores/navigation.svelte'
import { journeyStore } from '@lib/stores/journey.svelte'
import { focusStore } from '@lib/stores/focus.svelte'
import { searchStore } from '@lib/stores/search.svelte'
import { filterState } from '@lib/stores/filter.svelte'
import { viewport } from '@lib/stores/viewport.svelte'
import { cameraStore } from '@lib/stores/camera.svelte'
import { demoPhase as demoPhaseGetter } from '@lib/stores/demo.svelte'
import { graphicsModeStore, loadingPhaseStore } from '@lib/data-store'
import { getJourneyCompassState } from '@lib/journey/compass-state'
import { getJourneyCompassPresentationState, type CompassPresentationState } from '../compass-controller'
import type { LoadingPhase } from '@lib/types/state'

// filterState and cameraStore are not simple callable stores — they expose
// .subscribe()/.update()/.set() methods. Use the snapshot type returned by
// get() rather than ReturnType<typeof store>.
import type { ActiveFilters } from '@lib/types/state'
import type { CameraStoreState } from '@lib/stores/camera.svelte'

// ── Context Bundle ─────────────────────────────────────────────────────────

export interface ParityContext {
    nav: ReturnType<typeof navStore>
    journey: ReturnType<typeof journeyStore>
    focus: ReturnType<typeof focusStore>
    search: ReturnType<typeof searchStore>
    filters: ActiveFilters
    viewport: ReturnType<typeof viewport>
    demoPhase: string
    camera: CameraStoreState
    compassState: ReturnType<typeof getJourneyCompassState>
    presentation: CompassPresentationState
    loadingPhase: LoadingPhase
    graphicsMode: string
    /** Legacy fallback from window.__APP_STATE__.navState.focusedIndex */
    legacyFocusedIndex: number | null
}

// ── Resolver ───────────────────────────────────────────────────────────────

export function resolveParityContext(): ParityContext {
    // Direct reads from rune stores (auto-tracked when called inside $effect)
    const nav = navStore()
    const journey = journeyStore()
    const focus = focusStore()
    const search = get(searchStore)
    const filters = get(filterState)
    const vp = viewport()
    const demoPhaseValue: string = demoPhaseGetter()
    const camera = get(cameraStore)

    const compassStateVal = getJourneyCompassState()
    const presentation: CompassPresentationState = getJourneyCompassPresentationState(compassStateVal)

    // Loading/graphics state comes from the Svelte data-store. Canvas.svelte
    // advances this store to `launch` when WebGL is ready; nav.loadingPhaseKey
    // is a legacy mirror and can lag behind.
    const loadingPhaseValue: LoadingPhase = get(loadingPhaseStore)
    const graphicsModeValue = get(graphicsModeStore)

    // Legacy fallback: window.__APP_STATE__.navState.focusedIndex. Legacy
    // `applyLocalNeighborhoodFocus` writes to the legacy state but the Svelte
    // navStore is not updated by the legacy code path, so this fallback is
    // what actually carries the focus index in production. Mirrors the same
    // pattern in FocusCard.svelte::currentFocusedIdx.
    let legacyFocusedIndex: number | null = null
    try {
        const legacy = window.__APP_STATE__?.navState?.focusedIndex
        if (typeof legacy === 'number' && Number.isFinite(legacy)) {
            legacyFocusedIndex = legacy
        }
    } catch {
        /* ignore */
    }

    return {
        nav,
        journey,
        focus,
        search,
        filters,
        viewport: vp,
        demoPhase: demoPhaseValue,
        camera,
        compassState: compassStateVal,
        presentation,
        loadingPhase: loadingPhaseValue,
        graphicsMode: graphicsModeValue,
        legacyFocusedIndex
    }
}
