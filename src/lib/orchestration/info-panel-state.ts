/**
 * info-panel-state.ts — Per-state content descriptor for InfoPanel
 *
 * Maps `data-panel-surface` values to header text, empty-state copy,
 * and visibility flags so the InfoPanel shows contextually appropriate
 * content instead of a static "Business Details" placeholder.
 *
 * Surface values come from derivePanelSurface() in lifecycle.ts:
 *   idle | focus | search | focus-search | semantic-dive |
 *   map-idle | map-focus | map-search | map-focus-search | map-trail
 */

export interface InfoPanelContentDescriptor {
    /** Header text shown above the content area */
    headerText: string
    /** Whether the header is visible (hidden in search mode per contract) */
    headerVisible: boolean
    /** Headline for the empty state (no business selected) */
    emptyHeadline: string
    /** Subtext for the empty state */
    emptySubtext: string
    /** Whether the panel itself should be visible */
    panelVisible: boolean
    /** Whether the selected-business card is suppressed (search owns the panel) */
    selectionSuppressed: boolean
}

const CONTENT_BY_SURFACE: Record<string, InfoPanelContentDescriptor> = {
    idle: {
        // Note: panelVisible controls the internal open-state of the InfoPanel
        // component when it is mounted. On mobile/compact viewports, the panel
        // is NOT mounted at all on idle (see App.svelte infoPanelOpen
        // derivation). Keep these two gates in sync when adding new surfaces.
        headerText: 'Business Details',
        headerVisible: true,
        emptyHeadline: 'Select a business to see details',
        emptySubtext: 'Click a node in the field or choose a search result to explore.',
        panelVisible: true,
        selectionSuppressed: false
    },
    focus: {
        headerText: 'Business Details',
        headerVisible: true,
        emptyHeadline: 'Select a business to see details',
        emptySubtext: 'Click a node in the field to explore its connections.',
        panelVisible: true,
        selectionSuppressed: false
    },
    'focus-search': {
        headerText: 'Business Details',
        headerVisible: true,
        emptyHeadline: 'Select a business to see details',
        emptySubtext: 'Click a search result or node to explore.',
        panelVisible: true,
        selectionSuppressed: false
    },
    search: {
        headerText: 'Search',
        headerVisible: false, // hidden per search-chrome contract
        emptyHeadline: 'Type a query to search',
        emptySubtext: 'Search across all businesses by name, category, or keyword.',
        panelVisible: true,
        selectionSuppressed: true
    },
    'semantic-dive': {
        headerText: 'Semantic Dive',
        headerVisible: true,
        emptyHeadline: 'Exploring semantic neighborhood',
        emptySubtext: 'Select a business to dive deeper into its connections.',
        panelVisible: true,
        selectionSuppressed: false
    }
}

// Map-family surfaces: panel is hidden (map view owns the viewport)
const MAP_SURFACES = new Set(['map-idle', 'map-focus', 'map-search', 'map-focus-search', 'map-trail'])

const MAP_DESCRIPTOR: InfoPanelContentDescriptor = {
    headerText: '',
    headerVisible: false,
    emptyHeadline: '',
    emptySubtext: '',
    panelVisible: false,
    selectionSuppressed: true
}

const FALLBACK_DESCRIPTOR: InfoPanelContentDescriptor = CONTENT_BY_SURFACE.idle!

/**
 * Given a panelSurface string (from body[data-panel-surface]),
 * return the content descriptor for that state.
 */
export function getInfoPanelContent(panelSurface: string): InfoPanelContentDescriptor {
    if (MAP_SURFACES.has(panelSurface)) return MAP_DESCRIPTOR
    return CONTENT_BY_SURFACE[panelSurface] ?? FALLBACK_DESCRIPTOR
}

/**
 * Derived header text for the InfoPanel, keyed on panelSurface.
 */
export function getInfoPanelHeaderText(panelSurface: string): string {
    return getInfoPanelContent(panelSurface).headerText
}

/**
 * Whether the info-header should be hidden for this surface.
 */
export function isInfoHeaderVisible(panelSurface: string): boolean {
    return getInfoPanelContent(panelSurface).headerVisible
}

/**
 * Whether the selected-business card should be suppressed.
 */
export function isSelectionSuppressed(panelSurface: string): boolean {
    return getInfoPanelContent(panelSurface).selectionSuppressed
}

/**
 * Whether the panel itself should be visible.
 */
export function isInfoPanelVisible(panelSurface: string): boolean {
    return getInfoPanelContent(panelSurface).panelVisible
}

/**
 * Empty-state headline for the given surface.
 */
export function getEmptyHeadline(panelSurface: string): string {
    return getInfoPanelContent(panelSurface).emptyHeadline
}

/**
 * Empty-state subtext for the given surface.
 */
export function getEmptySubtext(panelSurface: string): string {
    return getInfoPanelContent(panelSurface).emptySubtext
}
