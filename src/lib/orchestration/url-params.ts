/**
 * @lib/orchestration/url-params.ts — URL / location parameter helpers
 *
 * Extracted from url-state.ts so tests can inject mocked URL search params
 * and DOM surface state without relying on jsdom's incomplete history
 * implementation or global document access.
 */

import { get } from 'svelte/store'
import { navStore } from '@lib/stores/navigation.svelte.ts'
import type { NavMode, PanelSurface } from '@lib/types/state'

// ── URL state keys for identifying restorable navigation params ───────────
// URL flags such as `nodemo=1` and `staticDev=1` control boot/test behavior;
// they do not describe application navigation. The post-data boot restore
// must not reset a user interaction when the URL has no state to restore.
// Internal-only (used by hasRestorableUrlState); not part of the export surface.
const URL_STATE_KEYS = [
    'view',
    'q',
    'mode',
    'depth',
    'story',
    'surface',
    'anchor',
    'record',
    'status',
    'city',
    'website',
    'email',
    'geocoded',
    'cluster'
] as const

export function hasRestorableUrlState(params: URLSearchParams): boolean {
    return URL_STATE_KEYS.some((key) => {
        // `dormant` is the initial renderer state and is serialized by the
        // first URL sync on compact boot. It carries no navigation intent, so
        // treating it as a restore would reintroduce the mode-chip race.
        if (key === 'mode' && params.get(key) === 'dormant') return false
        return params.has(key)
    })
}

/**
 * Parse a depth value from URL params, clamped to [0, 2].
 * Exported (Phase 6c, 2026-06-26) to enable direct contract testing without
 * Svelte runtime / appState mocking.
 */
export function getRequestedUrlDepth(params: URLSearchParams): number {
    const rawDepth = Number(params.get('depth') || 0)
    return Number.isFinite(rawDepth) ? Math.max(0, Math.min(2, rawDepth)) : 0
}

export function getSearchParams(): URLSearchParams {
    if (typeof window === 'undefined') return new URLSearchParams()
    return new URLSearchParams(window.location.search || '')
}

export function getLocationHref(): string {
    if (typeof window === 'undefined') return ''
    return window.location.href
}

export function getLocationPathname(): string {
    if (typeof window === 'undefined') return '/'
    return window.location.pathname || '/'
}

export function isDomForcedFocusSearchSurface(): boolean {
    if (typeof document === 'undefined' || !document.body) return false
    const nav = get(navStore)
    return (
        document.body.dataset.focusSearchForced === 'true' ||
        (nav.surface === 'focus-search' && document.body.dataset.journeyPhase === 'search')
    )
}

// ── B-1 pure helpers (extracted 2026-08-11 from url-restore.ts) ─────────────
// Pure functions only: no store reads, no module-level mutable state, no side
// effects. url-restore.ts imports these; behavior is byte-identical to the
// inline originals (see url-restore-split-PLAN.md §B-1).

export interface SurfaceParamPatch {
    mode?: NavMode
    surface: PanelSurface
    currentView?: 'map'
}

/** Map a ?surface= param to its restore patch (same mapping as setSurface). */
export function surfaceParamToNavMode(surface: string | null): SurfaceParamPatch | null {
    if (!surface) return null
    const _surfaceToMode: Record<string, NavMode> = {
        search: 'search',
        focus: 'focus',
        inside: 'inside',
        trail: 'trail',
        idle: 'overview'
    }
    const restoredMode = _surfaceToMode[surface]
    const isMapFamily = surface === 'map' || surface.startsWith('map-')
    const surfacePatch: SurfaceParamPatch = { surface: surface as PanelSurface }
    if (restoredMode) surfacePatch.mode = restoredMode
    if (isMapFamily) surfacePatch.currentView = 'map'
    return surfacePatch
}

/**
 * Resolve ?record=<lead_id> to an array-index anchor (focus-restoration path).
 * Pure except for the optional `points` dataset (passed by the caller).
 * Returns { anchorId, notFound } — notFound carries the record when unmapped
 * so the caller can surface the "Listing not found" toast.
 */
export function resolveAnchorFromRecordId(
    params: URLSearchParams,
    points: { lead_id?: string | number | null | undefined }[] | undefined
): { anchorId: string | null; notFound?: string } {
    let anchorId = params.get('anchor')
    const recordId = params.get('record')
    if (recordId && !anchorId) {
        const recordIndex = points?.findIndex((p) => String(p.lead_id) === recordId) ?? -1
        if (recordIndex >= 0) {
            anchorId = String(recordIndex)
        } else {
            return { anchorId, notFound: recordId }
        }
    }
    return { anchorId }
}

/** Numeric normalization for ?cluster= — null when absent/non-numeric. */
export function parseClusterFilterParam(raw: string | null): number | null {
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
}
