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

/**
 * Per-mode tooltip / description text. PR-B (2026-06-30) rewrote these
 * from abstract nouns ("Focused path of related business entities") to
 * action verbs and concrete outcomes so users immediately know what
 * they'll be doing when they enter a mode. See REPORT.md Issue 07.
 */
export const MODE_DESCRIPTIONS: Record<NavMode, string> = {
    overview: 'See all 8,406 Montgomery County businesses in one view.',
    search: 'Find businesses by name, type, or location.',
    trail: 'Walk from the focused business to its closest neighbors — click any node to keep going.',
    focus: 'See all businesses linked to the focused node, ranked by relationship strength.',
    inside: 'Surround yourself with the focused business and its local neighborhood.',
    map: 'Switch to a geographic map view of the county.',
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
 * Selection-lock set is the single canonical source of truth defined in
 * @lib/navigation/mode-affordances.ts. Re-exported here (instead of a
 * duplicated local copy) so there is exactly ONE definition of which modes
 * require a focused business. Keep this a re-export — do NOT define a second
 * `new Set(...)` here; editing a local copy would have zero runtime effect
 * (only the canonical set is read by `isModeLocked`).
 */
export { SELECTION_DEPENDENT_MODES } from '@lib/navigation/mode-affordances'

/** Ordered mode-chip rail — the visual rail's source of truth. */
export const modes: ModeOption[] = [
    { id: 'overview', label: 'Overview', description: MODE_DESCRIPTIONS.overview, iconId: 'icon-mycelium' },
    { id: 'search', label: 'Search', description: MODE_DESCRIPTIONS.search, iconId: 'icon-search' },
    { id: 'trail', label: 'Trail', description: MODE_DESCRIPTIONS.trail, iconId: 'icon-trail-bloom' },
    { id: 'focus', label: 'Focus', description: MODE_DESCRIPTIONS.focus, iconId: 'icon-orbit' },
    { id: 'inside', label: 'Inside', description: MODE_DESCRIPTIONS.inside, iconId: 'icon-zoom-in' },
    { id: 'map', label: 'Map', description: 'Geographic map view of the county.', iconId: 'icon-map' }
]
