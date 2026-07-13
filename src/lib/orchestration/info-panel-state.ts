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
        //
        // W45-B: the idle surface now shows a search-first panel. The SearchBar
        // is the primary (and only visible) content; header and empty-state
        // selection card are suppressed so the panel reads as a clean search
        // bar rather than a cluttered business-details panel.
        headerText: 'Search Businesses',
        headerVisible: false,
        emptyHeadline: 'Search Montgomery County businesses',
        emptySubtext: 'Type to search by name, category, or keyword.',
        panelVisible: true,
        selectionSuppressed: true
    },
    focus: {
        headerText: 'Business Details',
        headerVisible: true,
        emptyHeadline: 'Select a business to see details',
        emptySubtext: 'Click a business to see its connections.',
        panelVisible: true,
        selectionSuppressed: false
    },
    'focus-search': {
        headerText: 'Business Details',
        headerVisible: true,
        emptyHeadline: 'Select a business to see details',
        emptySubtext: 'Click a search result or business to explore.',
        panelVisible: true,
        selectionSuppressed: true
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
        headerText: 'Deep exploration',
        headerVisible: true,
        emptyHeadline: 'Exploring similar businesses nearby',
        emptySubtext: 'Select a business to dive deeper into its connections.',
        panelVisible: true,
        selectionSuppressed: false
    },
    inside: {
        // Deep-dive mode: user has entered the focused business's local
        // neighborhood. The InfoPanel shows the anchor business with
        // context-appropriate copy.
        headerText: 'Inside',
        headerVisible: true,
        emptyHeadline: 'Exploring the local neighborhood',
        emptySubtext: 'Walk through the streets and stories of this business and its neighbors.',
        panelVisible: true,
        selectionSuppressed: false
    },
    'thread-inspect': {
        // Connection inspection mode: user is inspecting a specific
        // connection between businesses. The InfoPanel shows it.
        headerText: 'Connection preview',
        headerVisible: true,
        emptyHeadline: 'Reading this connection',
        emptySubtext: 'See how this business relates to its neighbors.',
        panelVisible: true,
        selectionSuppressed: true
    },
    trail: {
        // Trail mode: user is walking a trail of connected businesses.
        headerText: 'Trail',
        headerVisible: true,
        emptyHeadline: 'Following a trail',
        emptySubtext: 'Walk from the focused business through its connected businesses.',
        panelVisible: true,
        selectionSuppressed: false
    },
    // Transition states during the focus animation. The panel keeps showing
    // the focus content rather than falling back to idle mid-animation.
    // (Inlined rather than spread from CONTENT_BY_SURFACE.focus because that
    // variable isn't assigned yet at this point in the object literal.)
    walking: {
        headerText: 'Business Details',
        headerVisible: true,
        emptyHeadline: 'Select a business to see details',
        emptySubtext: 'Click a business to see its connections.',
        panelVisible: true,
        selectionSuppressed: false
    },
    arriving: {
        headerText: 'Business Details',
        headerVisible: true,
        emptyHeadline: 'Select a business to see details',
        emptySubtext: 'Click a business to see its connections.',
        panelVisible: true,
        selectionSuppressed: false
    },
    settling: {
        headerText: 'Business Details',
        headerVisible: true,
        emptyHeadline: 'Select a business to see details',
        emptySubtext: 'Click a business to see its connections.',
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
