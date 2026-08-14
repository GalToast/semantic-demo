/**
 * @lib/stores/navigation/surface-mode-map.ts — Canonical surface → mode/view mapping
 *
 * Single source of truth for how a PanelSurface maps to NavMode and view family.
 * Used by setSurface() (UI interactions) and surfaceParamToNavMode() (URL restoration).
 *
 * The mapping is split into:
 * - KNOWN_SURFACE_MODE: surfaces that explicitly set a mode (not fallthrough)
 * - MAP_FAMILY_SURFACES: surfaces that imply map view (prefix-based)
 * - All other surfaces fall through to current mode and imply galaxy view.
 */

import type { NavMode, PanelSurface } from '@lib/types/state'

/** Every accepted panel surface, kept beside the canonical mapping. */
export const PANEL_SURFACES: readonly PanelSurface[] = [
    'idle',
    'search',
    'trail',
    'focus',
    'focus-search',
    'map',
    'map-trail',
    'map-focus',
    'map-focus-search',
    'inside',
    'thread-inspect',
    'walking',
    'arriving',
    'settling'
]

const PANEL_SURFACE_SET: ReadonlySet<string> = new Set(PANEL_SURFACES)

/** Narrow untrusted URL/test input before consulting the typed mapping. */
export function isPanelSurface(value: string): value is PanelSurface {
    return PANEL_SURFACE_SET.has(value)
}

/** Patch returned by the canonical mapping. */
export interface SurfaceModePatch {
    /** Explicit mode to set, or undefined to fall through to current mode. */
    mode?: NavMode
    /** View family this surface belongs to. Always defined. */
    viewFamily: 'galaxy' | 'map'
}

/**
 * Surfaces that explicitly set a mode (not fallthrough to current mode).
 * These are the "primary" navigation surfaces with dedicated modes.
 */
const KNOWN_SURFACE_MODE: Readonly<Record<PanelSurface, NavMode | undefined>> = {
    idle: 'overview',
    search: 'search',
    trail: 'trail',
    focus: 'focus',
    'focus-search': undefined, // fallthrough — preserves current mode (usually focus/search)
    map: undefined, // fallthrough — mode set by caller via setJourneyPhase
    'map-trail': undefined,
    'map-focus': undefined,
    'map-focus-search': undefined,
    inside: 'inside',
    'thread-inspect': undefined,
    walking: undefined,
    arriving: undefined,
    settling: undefined
} as const

/**
 * Check if a surface belongs to the map view family.
 * Map-family surfaces: 'map' and any surface starting with 'map-'.
 */
export function isMapFamilySurface(surface: PanelSurface): boolean {
    return surface === 'map' || surface.startsWith('map-')
}

/**
 * Get the canonical mode + viewFamily patch for a surface.
 *
 * This is the single source of truth for surface→mode/view mapping.
 * Callers decide how to handle the optional `mode` (fallthrough vs. omit).
 *
 * @param surface The panel surface to map
 * @returns { mode?: NavMode, viewFamily: 'galaxy' | 'map' }
 *   - mode is defined for surfaces with explicit mode mappings
 *   - mode is undefined for fallthrough surfaces (caller preserves current mode)
 *   - viewFamily is always defined ('map' for map-family, 'galaxy' otherwise)
 */
export function getSurfaceModePatch(surface: PanelSurface): SurfaceModePatch {
    return {
        mode: KNOWN_SURFACE_MODE[surface],
        viewFamily: isMapFamilySurface(surface) ? 'map' : 'galaxy'
    }
}
