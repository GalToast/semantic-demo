/**
 * @lib/z-index.ts — Managed z-index layer system
 *
 * Single source of truth for all z-index values in the application.
 * Replaces scattered CSS z-index values that caused overlay-behind-journey-modal,
 * controls-above-focus-card, and similar z-index bug families.
 *
 * Usage in TypeScript:
 *   import { Z_LAYERS } from '@lib/z-index';
 *   style.zIndex = Z_LAYERS.search.toString();
 *
 * Usage in CSS (via z-layers.css custom properties):
 *   z-index: var(--z-search);
 */
export const Z_LAYERS = {
    /** Underlay (below the canvas) — mirrors @lib/css/z-layers.css --z-underlay */
    underlay: -1,

    /** Three.js WebGL canvas and base scene */
    canvas: 0,

    /** Base content layer — mirrors --z-base */
    base: 1,

    /** Raised base content — mirrors --z-base-raised */
    baseRaised: 2,

    /** Generic content — mirrors --z-content */
    content: 5,

    /** Chrome (UI furniture) — mirrors --z-chrome */
    chrome: 10,

    /** Field nodes (point instanced mesh) */
    fieldNodes: 10,

    /** Raised chrome — mirrors --z-chrome-raised */
    chromeRaised: 11,

    /** Chrome overlay — mirrors --z-chrome-overlay */
    chromeOverlay: 12,

    /** Elevated chrome — mirrors --z-chrome-elevated */
    chromeElevated: 14,

    /** Chrome popover — mirrors --z-chrome-popover */
    chromePopover: 20,

    /** Thread/mycelium lines */
    threads: 20,

    /** Semantic manifold and lens overlays */
    overlays: 30,

    /** Legend panel */
    legend: 50,

    /** Search trail cue (mobile) — above canvas/threads, below interactive chrome */
    trailCue: 50,

    /** Mobile focus bottom-sheet card — below panels so the a11y toggle wins */
    focusStageCard: 70,

    /** Info panel and side panels */
    panels: 80,

    /** Elevated panels (popovers, dropdowns) */
    panelsElevated: 90,

    /** Search input and results */
    search: 100,

    /** Search bar container (info-panel-contained variant) — mirrors --z-search-bar */
    searchBar: 100,

    /** Generic overlay — mirrors --z-overlay */
    overlay: 100,

    /** Map overlay layer (alias of overlay; resolves MapView.svelte:264) — mirrors --z-overlay-100 */
    overlay100: 100,

    /** Raised overlay — mirrors --z-overlay-raised */
    overlayRaised: 101,

    /** Floating overlay — mirrors --z-overlay-floating */
    overlayFloating: 102,

    /** Focus neighbor rail — above search, below journey chrome */
    neighborRail: 110,

    /** Elevated overlay — mirrors --z-overlay-elevated */
    overlayElevated: 150,

    /** Tooltips — mirrors --z-tooltips */
    tooltips: 200,

    /** Journey chrome (compass, breadcrumb, step indicators) */
    journeyChrome: 200,

    /** Generic modal — mirrors --z-modal */
    modal: 400,

    /** Active journey trail visualization */
    journeyActive: 500,

    /** Focus pocket card */
    focusCard: 600,

    /** Compass rail */
    compass: 700,

    /** Camera/interaction controls */
    controls: 800,

    /** Journey blocking overlay (prevents interaction during transitions) */
    journeyBlock: 900,

    /** Blocker backdrop (modal backdrop) — mirrors --z-blocker-backdrop */
    blockerBackdrop: 900,

    /** Generic blocker (modal backdrop, loading gate) */
    blocker: 1000,

    /** Inside-walk HUD bars (status/controls) — above blocker, below toasts */
    insideWalk: 1100,

    /** Toast notifications — mirrors --z-toast */
    toast: 1200,

    /** Toast plus — mirrors --z-toast-plus */
    toastPlus: 1201,

    /** Toast above — mirrors --z-toast-above */
    toastAbove: 1300,

    /** Journey modal (trail review, etc.) */
    journeyModal: 2000,

    /** Dev telemetry / inspector HUD — mirrors --z-devtools */
    devtools: 9000,

    /** Click-pulse interaction ring — just below the max tooltip layer */
    canvasInteraction: 9998,

    /** Loading overlay (highest priority — on top of everything; matches --z-max ceiling) */
    loading: 9999,

    /** Canvas hover-preview overlay — at the --z-max ceiling — mirrors --z-canvas-hover */
    canvasHover: 9999,

    // Backfilled 2026-07-28 (L4-H1): the 23 CSS-only z-index layers from
    // @lib/css/z-layers.css are now mirrored here so this TS constant is the
    // single source of truth. CSS remains the runtime consumer via --z-* custom
    // properties; keep Z_LAYERS and z-layers.css :root in sync when adding layers
    // (guarded by tests/unit-active/z-layers-symmetry-invariant.test.ts).
} as const

/** Z-index layer key type for type-safe access */
export type ZLayerKey = keyof typeof Z_LAYERS

