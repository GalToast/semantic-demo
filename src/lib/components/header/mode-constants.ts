/**
 * @lib/components/header/mode-constants.ts
 *
 * Constants and types for the Header mode-chip rail. Extracted from
 * Header.svelte in PR-D2 so the Svelte file focuses on
 * markup + DOM event handlers; this module is pure data and trivial to
 * import elsewhere (CompassRail.svelte, mode-bindings.ts reuse
 * candidates).
 *
 * The mode list mirrors the navigation surface modes used by
 * src/lib/stores/navigation.svelte.ts and src/lib/ui/mode-bindings.ts.
 * `map` is a view-level switch that shares the same visual rail.
 */

import type { NavMode } from '@lib/types/state'

/** Per-mode tooltip / description text. Ported from lifecycle.js MODE_DESCRIPTIONS. */
export const MODE_DESCRIPTIONS: Record<NavMode, string> = {
    overview: 'County-wide overview across all visible records.',
    search: 'Search results across all business records.',
    trail: 'Focused path of related business entities.',
    focus: 'Living records with high relationship potential.',
    inside: 'Immersive exploration of local neighborhoods.',
    map: 'Geographic map view of the county.',
    bridge: 'Transitioning between navigation states.'
}

export interface ModeOption {
    /** NavMode id or the literal 'map' (a view-level switch). */
    id: NavMode | 'map'
    /** Compact label shown next to the icon at desktop width. */
    label: string
    /** Tooltip / description string for the chip title attribute. */
    description: string
    /** Sprite symbol id used by the SVG <use> tag in the chip icon. */
    iconId: string
}

/**
 * Modes that require a focused business node to be meaningful. These match
 * the selection guard in navigation.svelte.ts (mode === 'focus' || 'inside'
 * || focusedIndex != null) and the trail lock in mode-bindings.ts. They
 * render empty / no-op without a selection, so they are proactively
 * disabled (aria-disabled) rather than appearing active.
 */
export const SELECTION_DEPENDENT_MODES = new Set<string>(['trail', 'focus', 'inside'])

/** Ordered mode-chip rail — the visual rail's source of truth. */
export const modes: ModeOption[] = [
    { id: 'overview', label: 'Overview', description: MODE_DESCRIPTIONS.overview, iconId: 'icon-mycelium' },
    { id: 'search', label: 'Search', description: MODE_DESCRIPTIONS.search, iconId: 'icon-search' },
    { id: 'trail', label: 'Trail', description: MODE_DESCRIPTIONS.trail, iconId: 'icon-trail-bloom' },
    { id: 'focus', label: 'Focus', description: MODE_DESCRIPTIONS.focus, iconId: 'icon-orbit' },
    { id: 'inside', label: 'Inside', description: MODE_DESCRIPTIONS.inside, iconId: 'icon-zoom-in' },
    { id: 'map', label: 'Map', description: 'Geographic map view of the county.', iconId: 'icon-map' }
]
