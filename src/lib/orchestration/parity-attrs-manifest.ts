/**
 * parity-attrs-manifest.ts — the ParityAttribute descriptor table.
 *
 * Pure static data extracted from parity-attrs.svelte.ts (which re-exports
 * for consumer compatibility). No runes, no DOM, no imports: safe to load
 * in any context (node contracts, tests, docs tooling).
 *
 * Each entry maps a body data-attr key to its current desired value and a
 * short description of who reads it. The manifest is exported so focused
 * tests can assert that the parity layer covers everything the legacy
 * shell expects.
 */

export interface ParityAttributeDescriptor {
    /** Body data-attr key (without the `data-` prefix). */
    readonly key: string
    /** What the value means / who reads it. */
    readonly description: string
    /** Which store slice is the source of truth. */
    readonly source: string
}

export const PARITY_ATTRIBUTES: readonly ParityAttributeDescriptor[] = [
    // Journey compass (legacy #journey-compass + .journey-compass CSS hooks)
    {
        key: 'journeyCompassPhase',
        description: 'Journey compass lifecycle phase (idle|checking|synthesizing|active|interrupted)',
        source: 'compass.phase'
    },
    {
        key: 'journeyNavigationOwner',
        description: 'Who owns navigation chrome (journey-compass|map-trail-strip|map-controls|scene|inside-walk)',
        source: 'compass.presentationState'
    },

    // Navigation (legacy navigation-state.js)
    { key: 'navMode', description: 'Navigation mode (overview|search|trail|focus|inside)', source: 'navStore.mode' },
    {
        key: 'navSurface',
        description:
            'Navigation surface (idle|search|focus|focus-search|map|map-trail|map-focus|map-focus-search|inside|thread-inspect|semantic-dive)',
        source: 'navStore.surface'
    },
    {
        key: 'panelSurface',
        description: 'Mirrors navSurface; some legacy code reads this name',
        source: 'navStore.surface'
    },
    {
        key: 'panelSurfaceMode',
        description: 'Mode of the panel surface (focus-search|semantic-dive|...)',
        source: 'derived'
    },
    {
        key: 'panelSurfaceDetail',
        description:
            'Info panel surface detail (none|expanded|peek) — used by mobile_premium__state.css to switch the info panel layout on search/focus-search',
        source: 'derived from panelSurfaceMode + mobileSearchSheet'
    },
    { key: 'activeView', description: 'Current view (galaxy|map)', source: 'navStore.currentView' },
    {
        key: 'focusedNode',
        description: 'Currently focused node index, or removed when null',
        source: 'navStore.focusedIndex'
    },
    {
        key: 'graphContext',
        description: 'Graph context label (idle|counties|corridor|focus|inside|map)',
        source: 'derived'
    },
    {
        key: 'mapContext',
        description: 'Map context label (idle|search|focus|focus-search|trail)',
        source: 'derived'
    },
    { key: 'routeExploration', description: 'Route exploration phase', source: 'journeyStore.routeExplorationPhase' },

    // Trail (legacy lifecycle.js + setTrailDepth)
    { key: 'trailDepth', description: 'Current trail depth (0|1|2+)', source: 'journeyStore.trailDepth' },
    { key: 'trailState', description: 'Trail state (inactive|active)', source: 'derived' },

    // Semantic dive (legacy semantic-dive-ui.js)
    {
        key: 'semanticDive',
        description: 'Semantic dive state (inactive|transitioning|active)',
        source: 'focusStore.semanticDiveMode'
    },

    // Focus transition (legacy camera-controls.js / focus.ts)
    {
        key: 'focusTransition',
        description: 'Focus transition mode (idle|entering|settling|inside|exiting)',
        source: 'focusStore.transitionMode'
    },

    // Search status (legacy lifecycle-modes.js / search-state.js)
    {
        key: 'searchStatus',
        description: 'Search lifecycle status (idle|searching|focusing|results|empty|error)',
        source: 'searchStore.status'
    },

    // Strand journey (legacy strand-continuity.js — CSS journey_steps.css reads data-strand-journey)
    {
        key: 'strandJourney',
        description: 'Strand journey phase (idle|preview|pinned|exploring|arrived|returning)',
        source: 'focusStore.strandContinuityPhase'
    },
    {
        key: 'threadInspectSurface',
        description: 'Thread inspector surface owner (idle|rail|canvas|pinned|inside-cue)',
        source: 'focusStore.threadInspector'
    },
    {
        key: 'inspectedThreadIndex',
        description: 'Currently inspected thread index, or removed when inactive',
        source: 'focusStore.threadInspector'
    },

    // Journey phase
    {
        key: 'journeyPhase',
        description:
            'Journey phase lifecycle (idle|overview|search|focus|inside|map|thread-inspect|walking|arriving|settling)',
        source: 'journeyStore.phase'
    },
    {
        key: 'terrainHandoff',
        description: 'Terrain handoff phase (idle|prelude|transition|settle)',
        source: 'journeyStore.terrainHandoffPhase'
    },
    { key: 'demoPhase', description: 'Demo choreography phase', source: 'demoStore.phase' },

    // Filters (legacy filter-state.js)
    { key: 'filtersActive', description: 'Whether any filter is active', source: 'filterState' },

    // Viewport
    { key: 'reducedMotion', description: 'OS-level reduced motion preference', source: 'viewport.reducedMotion' },
    {
        key: 'compact',
        description: 'Whether viewport is at or below the mobile breakpoint',
        source: 'viewport.isCompact'
    },
    { key: 'mobile', description: 'Whether viewport is mobile (alias of compact)', source: 'viewport.isMobile' },
    { key: 'mode', description: 'Current visual mode (overview|focus|inside|map)', source: 'navStore.mode' },

    // Loading / scene readiness (all derived from loadingPhaseStore + graphicsModeStore)
    { key: 'loadingOverlay', description: 'Loading overlay visibility (hidden|visible)', source: 'loadingPhaseStore' },
    { key: 'loadingPhase', description: 'Loading phase (records|scene|restore|launch)', source: 'loadingPhaseStore' },
    { key: 'sceneReady', description: 'Whether the WebGL scene is ready', source: 'loadingPhaseStore' },
    {
        key: 'viewHandoffActive',
        description: 'Whether a view-handoff animation is in progress',
        source: 'loadingPhaseStore'
    },
    { key: 'cameraAssist', description: 'Camera assistance state (free|suspended)', source: 'loadingPhaseStore' },
    { key: 'graphicsMode', description: 'Graphics mode (webgl|fallback)', source: 'graphicsModeStore' },
    { key: 'testReady', description: 'Test readiness flag (true once parity is installed)', source: 'derived' },
    // Camera orbit slack (legacy camera-orbit-slack.js / camera.ts)
    {
        key: 'cameraSlack',
        description: 'Camera orbit slack phase (idle|active|settling)',
        source: 'cameraStore.orbitSlack.phase'
    },
    {
        key: 'cameraSlackReason',
        description: 'Reason string for the current camera orbit slack phase',
        source: 'cameraStore.orbitSlack.reason'
    }
] as const

/**
 * Set of attribute keys this module owns.
 * Useful for tests that want to assert "every legacy attr is covered".
 */
export const PARITY_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set(PARITY_ATTRIBUTES.map((a) => a.key))
